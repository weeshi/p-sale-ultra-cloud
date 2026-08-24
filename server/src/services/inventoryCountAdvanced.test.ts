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

describe('InventoryService.postCount (حقلان: صالح + تالف)', () => {
  let tx: any

  beforeEach(() => {
    jest.clearAllMocks()
    const countItem = {
      id: 1,
      itemId: 100,
      countedGoodQty: new Prisma.Decimal(8),
      countedDamagedQty: new Prisma.Decimal(2),
      unitCost: new Prisma.Decimal(25),
      difference: new Prisma.Decimal(0),
    }
    tx = {
      inventoryCount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          companyId: 1,
          warehouseId: 1,
          status: 'draft',
          items: [countItem],
        }),
        update: jest.fn().mockResolvedValue({ id: 5, status: 'posted' }),
      },
      stock: {
        // الرصيد الحي لحظة الترحيل: إجمالي 10، تالف 0 → صالح 10
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          quantity: new Prisma.Decimal(10),
          damagedStock: new Prisma.Decimal(0),
        }),
        update: jest.fn(),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue({
          id: 100,
          currentStock: new Prisma.Decimal(10),
          damagedStock: new Prisma.Decimal(0),
          costPrice: new Prisma.Decimal(25),
        }),
        update: jest.fn(),
      },
      stockMovement: { create: jest.fn() },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  it('يحدّث الإجمالي والتالف + يحرّك صالح وتالف + يعيد حساب التكلفة', async () => {
    await inventoryService.postCount(5, 7)

    // المخزن: quantity = 8+2 = 10، damagedStock = 2
    expect(tx.stock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 10, damagedStock: 2 }),
      })
    )

    // الصنف: currentStock +0 (الإجمالي 10 = 10)، damagedStock +2، costPrice = (10×25)÷8 = 31.25
    const itemCall = tx.item.update.mock.calls[0][0]
    expect(itemCall.data.currentStock).toEqual({ increment: 0 })
    expect(itemCall.data.damagedStock).toEqual({ increment: 2 })
    expect(itemCall.data.costPrice).toBeCloseTo(31.25, 3)

    // حركتان: تعديل صالح (-2) وتعديل تالف (+2)
    const goodMovement = tx.stockMovement.create.mock.calls[0][0]
    const damagedMovement = tx.stockMovement.create.mock.calls[1][0]
    expect(goodMovement.data.movementType).toBe(MOVEMENT_TYPES.INVENTORY_ADJUSTMENT_GOOD)
    expect(goodMovement.data.quantity).toEqual(-2)
    expect(goodMovement.data.balanceAfter).toEqual(8)
    expect(damagedMovement.data.movementType).toBe(MOVEMENT_TYPES.INVENTORY_ADJUSTMENT_DAMAGED)
    expect(damagedMovement.data.quantity).toEqual(2)
    expect(damagedMovement.data.balanceAfter).toEqual(2)

    // ترحيل الحالة
    expect(tx.inventoryCount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'posted' }) })
    )
  })

  it('يتجاوز الأصناف بلا فرق صالح أو تالف', async () => {
    tx.stock.findUnique = jest.fn().mockResolvedValue({
      id: 1,
      quantity: new Prisma.Decimal(10),
      damagedStock: new Prisma.Decimal(2),
    })
    await inventoryService.postCount(5, 7)
    // صالح 8 = 8، تالف 2 = 2 → لا شيء يتغير
    expect(tx.stock.update).not.toHaveBeenCalled()
    expect(tx.stockMovement.create).not.toHaveBeenCalled()
    expect(tx.inventoryCount.update).toHaveBeenCalled()
  })
})
