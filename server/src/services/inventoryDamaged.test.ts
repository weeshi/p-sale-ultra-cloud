import { prisma } from '../config/database'
import { inventoryService } from './inventoryService'
import { MOVEMENT_TYPES } from '../../../shared/constants'
import { Prisma } from '@prisma/client'

jest.mock('../config/database', () => ({
  prisma: { $transaction: jest.fn() },
}))

jest.mock('../services/sequenceService', () => ({
  sequenceService: { next: jest.fn(), ensure: jest.fn(), current: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('InventoryService.registerDamaged', () => {
  let tx: any

  beforeEach(() => {
    jest.clearAllMocks()
    tx = {
      stock: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          itemId: 100,
          warehouseId: 1,
          quantity: new Prisma.Decimal(10),
          damagedStock: new Prisma.Decimal(0),
          item: { id: 100, costPrice: new Prisma.Decimal(25) },
        }),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 9, movementType: 'damaged' }),
      },
      stock: {
        update: jest.fn(),
      },
    }
    // دمج خيارات stock في نفس الكائن (findUnique + update)
    tx.stock.findUnique = jest.fn().mockResolvedValue({
      id: 1,
      itemId: 100,
      warehouseId: 1,
      quantity: new Prisma.Decimal(10),
      damagedStock: new Prisma.Decimal(0),
      item: { id: 100, costPrice: new Prisma.Decimal(25) },
    })
    tx.stock.update = jest.fn()
    tx.item = {
      update: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        id: 100,
        currentStock: new Prisma.Decimal(10),
        damagedStock: new Prisma.Decimal(0),
        costPrice: new Prisma.Decimal(25),
      }),
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  const base = {
    companyId: 1,
    itemId: 100,
    warehouseId: 1,
    quantity: 2,
  }

  it('يرفض بدون مخزن', async () => {
    await expect(inventoryService.registerDamaged({ ...base, warehouseId: 0 })).rejects.toThrow('المخزن مطلوب')
  })

  it('يرفض كمية صفر أو سالبة', async () => {
    await expect(inventoryService.registerDamaged({ ...base, quantity: 0 })).rejects.toThrow('أكبر من صفر')
    await expect(inventoryService.registerDamaged({ ...base, quantity: -3 })).rejects.toThrow('أكبر من صفر')
  })

  it('يرفض تسجيل تالف يتجاوز الكمية الصالحة', async () => {
    await expect(
      inventoryService.registerDamaged({ ...base, quantity: 11 })
    ).rejects.toThrow('تتجاوز الكمية الصالحة')
  })

  it('يسجّل التالف ويحدّث damagedStock دون تغيير الإجمالي', async () => {
    const result = await inventoryService.registerDamaged(base)
    expect(result.validQtyAfter).toBe(8)
    // الحركة سُجلت بنوع damaged
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MOVEMENT_TYPES.DAMAGED,
        }),
      })
    )
    // recordMovement زادت damagedStock على المخزن والصنف دون لمس quantity/currentStock
    expect(tx.stock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          damagedStock: { increment: 2 },
        }),
      })
    )
    // امتصاص التكلفة: 10×25 ÷ (10−2) = 31.25
    expect(tx.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costPrice: 31.25,
        }),
      })
    )
  })
})

describe('InventoryService.reverseDamaged', () => {
  let tx: any

  beforeEach(() => {
    jest.clearAllMocks()
    tx = {
      stock: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          itemId: 100,
          warehouseId: 1,
          quantity: new Prisma.Decimal(10),
          damagedStock: new Prisma.Decimal(5),
          item: { id: 100, currentStock: new Prisma.Decimal(10), costPrice: new Prisma.Decimal(25) },
        }),
        update: jest.fn(),
      },
      item: {
        update: jest.fn(),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 9, movementType: 'damage_reversal' }),
      },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  const base = { companyId: 1, itemId: 100, warehouseId: 1 }

  it('يرفض كمية صفر أو سالبة', async () => {
    await expect(inventoryService.reverseDamaged({ ...base, quantity: 0 })).rejects.toThrow('أكبر من صفر')
    await expect(inventoryService.reverseDamaged({ ...base, quantity: -3 })).rejects.toThrow('أكبر من صفر')
  })

  it('يرفض عكس كمية تتجاوز التالف المتاح', async () => {
    await expect(inventoryService.reverseDamaged({ ...base, quantity: 6 })).rejects.toThrow(
      'تتجاوز التالف المتاح'
    )
  })

  it('ينقل من التالف إلى الصالح + يعيد حساب التكلفة + يسجل damage_reversal', async () => {
    const result = await inventoryService.reverseDamaged({ ...base, quantity: 2 })
    expect(result.validQtyAfter).toBe(7) // 10 − (5−2)
    // خفض التالف على المخزن
    expect(tx.stock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ damagedStock: { decrement: 2 } }),
      })
    )
    // التكلفة: 10×25 ÷ (10−3) = 35.714285...
    const itemUpdateCall = tx.item.update.mock.calls[0][0]
    expect(itemUpdateCall.data.damagedStock).toEqual(3)
    expect(itemUpdateCall.data.costPrice).toBeCloseTo(250 / 7, 3)
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ movementType: MOVEMENT_TYPES.DAMAGE_REVERSAL, quantity: 2 }),
      })
    )
  })
})