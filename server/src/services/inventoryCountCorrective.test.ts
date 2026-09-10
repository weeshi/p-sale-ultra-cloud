import { prisma } from '../config/database'
import { inventoryService } from './inventoryService'
import { sequenceService } from './sequenceService'
import { Prisma } from '@prisma/client'

jest.mock('../config/database', () => ({
  prisma: { $transaction: jest.fn() },
}))

jest.mock('../services/sequenceService', () => ({
  sequenceService: { next: jest.fn(), ensure: jest.fn(), current: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSequence = sequenceService as jest.Mocked<typeof sequenceService>

describe('InventoryService.createCorrectiveCount (جرد تصحيحي من جرد مرحّل)', () => {
  let tx: any

  const parentPosted = (overrides: Record<string, unknown> = {}) => ({
    id: 5,
    companyId: 1,
    warehouseId: 1,
    countNumber: 'CNT-000005',
    status: 'posted',
    notes: 'جرد شهري',
    createdBy: 7,
    warehouse: { id: 1, branchId: 2 },
    ...overrides,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    tx = {
      inventoryCount: {
        findFirst: jest.fn().mockResolvedValue(parentPosted()),
        create: jest.fn().mockResolvedValue({ id: 6, countNumber: 'CNT-000006' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 6,
          countNumber: 'CNT-000006',
          warehouse: { id: 1, branchId: 2 },
          parentCount: { id: 5, countNumber: 'CNT-000005' },
          items: [{ id: 1, itemId: 100 }],
        }),
      },
      item: {
        findMany: jest.fn().mockResolvedValue([
          { id: 100, itemName: 'صنف أ', costPrice: 25 },
          { id: 101, itemName: 'صنف ب', costPrice: 10 },
        ]),
      },
      stock: {
        findMany: jest.fn().mockResolvedValue([
          { itemId: 100, quantity: 8, damagedStock: 2 },
        ]),
      },
      inventoryCountItem: { create: jest.fn() },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
    mockSequence.next.mockResolvedValue(6)
  })

  it('ينشئ الجرد التصحيحي من جرد مرحّل + يرقم CNT + يبذر بنوداً من الرصيد الحي', async () => {
    const result = await inventoryService.createCorrectiveCount(1, 5, 7, 2)

    // الترقيم عبر SequenceService
    expect(mockSequence.next).toHaveBeenCalledWith(1, 'CNT', tx)

    // إنشاء الجرد التصحيحي بمرجع الأصل
    const createCall = tx.inventoryCount.create.mock.calls[0][0]
    expect(createCall.data).toEqual(
      expect.objectContaining({
        companyId: 1,
        warehouseId: 1,
        countNumber: 'CNT-000006',
        parentCountId: 5,
        createdBy: 7,
        notes: expect.stringContaining('تصحيحي لـ #CNT-000005'),
      })
    )

    // بذر بنود لكل صنف نشط: systemQty من الرصيد الحي في المخزن
    expect(tx.inventoryCountItem.create).toHaveBeenCalledTimes(2)
    const itemA = tx.inventoryCountItem.create.mock.calls[0][0].data
    const itemB = tx.inventoryCountItem.create.mock.calls[1][0].data
    expect(itemA).toEqual(
      expect.objectContaining({ countId: 6, itemId: 100, systemQty: 8, countedGoodQty: 0, countedDamagedQty: 0, unitCost: 25 })
    )
    expect(itemB).toEqual(
      expect.objectContaining({ countId: 6, itemId: 101, systemQty: 0, unitCost: 10 })
    )

    // إعادة الجرد الكامل بـ warehouse/parentCount/items
    expect(tx.inventoryCount.findUnique).toHaveBeenCalledWith({
      where: { id: 6 },
      include: { warehouse: true, parentCount: true, items: { include: { item: true } } },
    })
    expect(result.countNumber).toBe('CNT-000006')
  })

  it('يرفض عندما يكون الجرد الأصلي غير موجود', async () => {
    tx.inventoryCount.findFirst = jest.fn().mockResolvedValue(null)
    await expect(inventoryService.createCorrectiveCount(1, 999, 7, 2)).rejects.toThrow('الجرد الأصلي غير موجود')
    expect(tx.inventoryCount.create).not.toHaveBeenCalled()
  })

  it('يرفض عندما لا يكون الجرد الأصلي مرحّلاً', async () => {
    tx.inventoryCount.findFirst = jest.fn().mockResolvedValue(parentPosted({ status: 'draft' }))
    await expect(inventoryService.createCorrectiveCount(1, 5, 7, 2)).rejects.toThrow('الجرد التصحيحي يُنشأ من جرد مرحّل فقط')
    expect(tx.inventoryCount.create).not.toHaveBeenCalled()
  })

  it('يرفض عندما لا يملك المستخدم فرع الجرد الأصلي (عزل الفرع)', async () => {
    await expect(inventoryService.createCorrectiveCount(1, 5, 7, 99)).rejects.toThrow('لا يمكن إنشاء جرد تصحيحي من جرد لا يتبع فرعك')
    expect(tx.inventoryCount.create).not.toHaveBeenCalled()
  })

  it('يسمح بالإنشاء من أي فرع عندما لا يقيد المستخدم بفرع (allowedBranchId=null)', async () => {
    await expect(inventoryService.createCorrectiveCount(1, 5, 7, null)).resolves.toBeDefined()
    expect(tx.inventoryCount.create).toHaveBeenCalledTimes(1)
  })
})