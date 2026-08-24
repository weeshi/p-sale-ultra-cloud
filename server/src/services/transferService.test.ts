import { prisma } from '../config/database'
import { transferService } from './transferService'
import { sequenceService } from './sequenceService'
import { SERIAL_STATUS } from '../../../shared/constants'
import { Prisma } from '@prisma/client'

jest.mock('../config/database', () => ({
  prisma: { $transaction: jest.fn() },
}))
jest.mock('./sequenceService', () => ({
  sequenceService: { next: jest.fn(), ensure: jest.fn(), current: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockNext = sequenceService.next as jest.Mock

describe('TransferService.createTransfer', () => {
  let tx: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockResolvedValue(1)
    tx = {
      warehouse: {
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve({ id: where.id })
        ),
      },
      stock: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, quantity: new Prisma.Decimal(10) }),
      },
      item: { findUnique: jest.fn().mockResolvedValue({ id: 100, itemName: 'لابتوب' }) },
      stockTransfer: {
        create: jest.fn().mockResolvedValue({ id: 5, transferNumber: 'TRN-000001', status: 'pending' }),
      },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  const base = {
    companyId: 1,
    transferDate: new Date('2026-03-01'),
    fromWarehouseId: 10,
    toWarehouseId: 20,
    items: [{ itemId: 100, quantity: 3 }],
  }

  it('يرفض التحويل لنفس المخزن', async () => {
    await expect(transferService.createTransfer({ ...base, toWarehouseId: 10 })).rejects.toThrow('نفس المخزن')
  })

  it('يرفض التحويل بدون أصناف', async () => {
    await expect(transferService.createTransfer({ ...base, items: [] })).rejects.toThrow('لا توجد أصناف')
  })

  it('يرفض عند مخزن غير موجود في الشركة', async () => {
    tx.warehouse.findFirst.mockResolvedValue(null)
    await expect(transferService.createTransfer(base)).rejects.toThrow('غير موجود في هذه الشركة')
  })

  it('يرفض عند كمية غير كافية', async () => {
    tx.stock.findUnique.mockResolvedValue({ id: 1, quantity: new Prisma.Decimal(2) })
    await expect(transferService.createTransfer({ ...base, items: [{ itemId: 100, quantity: 5 }] })).rejects.toThrow(
      'الكمية غير كافية للصنف: لابتوب'
    )
  })

  it('ينشئ تحويلاً ناجحاً مع رقم TRN', async () => {
    const result = await transferService.createTransfer(base)
    expect(result.transferNumber).toBe('TRN-000001')
    expect(tx.stockTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transferNumber: 'TRN-000001',
          items: { create: [{ itemId: 100, quantity: 3, unitCost: 0 }] },
        }),
      })
    )
  })
})

describe('TransferService.approveTransfer', () => {
  let tx: any

  beforeEach(() => {
    jest.clearAllMocks()
    tx = {
      stockTransfer: {
        findUnique: jest.fn().mockResolvedValue({ id: 5, status: 'pending' }),
        update: jest.fn().mockResolvedValue({ id: 5, status: 'approved' }),
      },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  it('يرفض اعتماد تحويل غير موجود', async () => {
    tx.stockTransfer.findUnique.mockResolvedValue(null)
    await expect(transferService.approveTransfer(5, 1)).rejects.toThrow('غير موجود')
  })

  it('يرفض اعتماد تحويل ليس معلقاً', async () => {
    tx.stockTransfer.findUnique.mockResolvedValue({ id: 5, status: 'received' })
    await expect(transferService.approveTransfer(5, 1)).rejects.toThrow('يجب أن يكون معلقاً')
  })

  it('يعتمد التحويل المعلق', async () => {
    const result = await transferService.approveTransfer(5, 1)
    expect(result.status).toBe('approved')
    expect(tx.stockTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved', approvedBy: 1 }) })
    )
  })
})

describe('TransferService.cancelTransfer', () => {
  let tx: any

  beforeEach(() => {
    jest.clearAllMocks()
    tx = {
      stockTransfer: {
        findUnique: jest.fn().mockResolvedValue({ id: 5, status: 'pending' }),
        update: jest.fn().mockResolvedValue({ id: 5, status: 'cancelled' }),
      },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  it('يرفض إلغاء تحويل مستلم', async () => {
    tx.stockTransfer.findUnique.mockResolvedValue({ id: 5, status: 'received' })
    await expect(transferService.cancelTransfer(5, 1)).rejects.toThrow('لا يمكن إلغاء تحويل مستلم')
  })

  it('يرفض إلغاء تحويل أُلغي مسبقاً', async () => {
    tx.stockTransfer.findUnique.mockResolvedValue({ id: 5, status: 'cancelled' })
    await expect(transferService.cancelTransfer(5, 1)).rejects.toThrow('أُلغي مسبقاً')
  })

  it('يلغي التحويل المعلق', async () => {
    await transferService.cancelTransfer(5, 1, 'rejected')
    expect(tx.stockTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'rejected', approvedBy: 1 }) })
    )
  })
})

describe('TransferService.receiveTransfer', () => {
  let tx: any

  const makeTransfer = (status: string, qty = 5, receivedQty = 0) => ({
    id: 5,
    companyId: 1,
    transferNumber: 'TRN-000001',
    status,
    fromWarehouseId: 10,
    toWarehouseId: 20,
    items: [
      {
        id: 1,
        itemId: 100,
        quantity: new Prisma.Decimal(qty),
        receivedQty: new Prisma.Decimal(receivedQty),
        unitCost: new Prisma.Decimal(50),
        item: { itemName: 'لابتوب' },
      },
    ],
    fromWarehouse: {},
    toWarehouse: {},
  })

  beforeEach(() => {
    jest.clearAllMocks()
    tx = {
      stockTransfer: {
        findUnique: jest.fn().mockResolvedValue(makeTransfer('approved')),
        update: jest.fn().mockResolvedValue({ id: 5, status: 'received' }),
      },
      stock: {
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          where?.itemId_warehouseId?.warehouseId === 10
            ? Promise.resolve({ id: 1, quantity: new Prisma.Decimal(10) })
            : Promise.resolve(null)
        ),
        create: jest.fn().mockResolvedValue({ id: 2, quantity: new Prisma.Decimal(0) }),
        update: jest.fn().mockResolvedValue({}),
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
      stockTransferItem: { update: jest.fn().mockResolvedValue({}) },
      serial: { findUnique: jest.fn() },
      serialMovement: { create: jest.fn().mockResolvedValue({}) },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  it('يرفض استلام تحويل من شركة أخرى', async () => {
    await expect(
      transferService.receiveTransfer(5, { companyId: 2, receivedBy: 1 })
    ).rejects.toThrow('غير موجود في هذه الشركة')
  })

  it('يرفض استلام تحويل مستلم مسبقاً', async () => {
    tx.stockTransfer.findUnique.mockResolvedValue(makeTransfer('received'))
    await expect(
      transferService.receiveTransfer(5, { companyId: 1, receivedBy: 1 })
    ).rejects.toThrow('مستلم مسبقاً')
  })

  it('يرفض استلام تحويل ملغي', async () => {
    tx.stockTransfer.findUnique.mockResolvedValue(makeTransfer('cancelled'))
    await expect(
      transferService.receiveTransfer(5, { companyId: 1, receivedBy: 1 })
    ).rejects.toThrow('ملغي')
  })

  it('يرفض عند كمية غير كافية في المخزن المصدر', async () => {
    tx.stock.findUnique.mockImplementation(({ where }: any) =>
      where?.itemId_warehouseId?.warehouseId === 10
        ? Promise.resolve({ id: 1, quantity: new Prisma.Decimal(2) })
        : Promise.resolve(null)
    )
    await expect(
      transferService.receiveTransfer(5, { companyId: 1, receivedBy: 1 })
    ).rejects.toThrow('الكمية غير كافية في المخزن المصدر')
  })

  it('يستلم تحويلاً كاملاً وينقل الكمية والمخزون', async () => {
    await transferService.receiveTransfer(5, {
      companyId: 1,
      receivedBy: 1,
      items: [{ transferItemId: 1, receivedQty: 5 }],
    })

    // خصم من المصدر + إضافة للهدف
    expect(tx.stock.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { quantity: { decrement: 5 } } })
    )
    expect(tx.stock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ warehouseId: 20 }) })
    )
    expect(tx.stock.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: { quantity: { increment: 5 } } })
    )
    // حركتا مخزون (صادر/وارد)
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2)
    // تحديث سطر التحويل
    expect(tx.stockTransferItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ receivedQty: 5 }) })
    )
    expect(tx.stockTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'received' }) })
    )
  })

  it('يستلم جزئياً ويعلّم التحويل in_transit', async () => {
    await transferService.receiveTransfer(5, {
      companyId: 1,
      receivedBy: 1,
      items: [{ transferItemId: 1, receivedQty: 2 }],
    })

    expect(tx.stock.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { quantity: { decrement: 2 } } })
    )
    expect(tx.stockTransferItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ receivedQty: 2 }) })
    )
    expect(tx.stockTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'in_transit' }) })
    )
  })

  it('ينقل الأرقام التسلسلية إلى المخزن الهدف', async () => {
    tx.serial.findUnique.mockResolvedValue({ id: 50, itemId: 100, warehouseId: 10, status: SERIAL_STATUS.IN_STOCK })
    tx.serial.update = jest.fn().mockResolvedValue({})

    await transferService.receiveTransfer(5, {
      companyId: 1,
      receivedBy: 1,
      items: [{ transferItemId: 1, receivedQty: 5, serialNumbers: ['SN-100'] }],
    })

    expect(tx.serial.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 50 }, data: { warehouseId: 20 } })
    )
    expect(tx.serialMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serialId: 50,
          fromWarehouseId: 10,
          toWarehouseId: 20,
          referenceType: 'stock_transfer',
          referenceId: 5,
        }),
      })
    )
  })
})
