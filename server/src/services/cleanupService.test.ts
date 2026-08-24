import { prisma } from '../config/database'
import { cleanupService } from './cleanupService'

jest.mock('../config/database', () => ({
  prisma: { $transaction: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('CleanupService.resetDatabase', () => {
  let tx: Record<string, { deleteMany: jest.Mock; updateMany: jest.Mock }>

  beforeEach(() => {
    jest.clearAllMocks()

    // 12: المخازن (باستثناء المركزي) — لاحظ أن deleteMany المركزي مرتين
    tx = {} as any
    const models = [
      'stockTransferItem',
      'stockTransfer',
      'inventoryCountItem',
      'inventoryCount',
      'serialMovement',
      'rmaItem',
      'rma',
      'warranty',
      'serial',
      'quoteItem',
      'quote',
      'saleInvoiceItem',
      'saleInvoice',
      'purchaseInvoiceItem',
      'purchaseInvoice',
      'shipment',
      'purchaseOrderItem',
      'purchaseOrder',
      'bankReconciliationLine',
      'bankReconciliation',
      'receipt',
      'journalEntryLine',
      'journalEntry',
      'bundlePart',
      'itemAttribute',
      'stock',
      'stockMovement',
      'party',
      'item',
      'exchangeRate',
      'syncLog',
      'auditLog',
      'permission',
      'user',
      'warehouse',
    ]
    for (const m of models) {
      tx[m] = { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) }
    }
    tx.sequence = { updateMany: jest.fn().mockResolvedValue({ count: 3 }) }
    tx.account = { updateMany: jest.fn().mockResolvedValue({ count: 10 }) }
    tx.treasury = { updateMany: jest.fn().mockResolvedValue({ count: 2 }) }

    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  it('ينفذ الحذف داخل تراكشن واحد', async () => {
    await cleanupService.resetDatabase(1, 5)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('يحذف المعاملات والجرد والسيريالات والقيود والسندات', async () => {
    await cleanupService.resetDatabase(1, 5)

    expect(tx.stockTransfer.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
    expect(tx.saleInvoice.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
    expect(tx.purchaseInvoice.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
    expect(tx.receipt.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
    expect(tx.journalEntry.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
    expect(tx.serial.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
    expect(tx.exchangeRate.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
    expect(tx.syncLog.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
    expect(tx.auditLog.deleteMany).toHaveBeenCalledWith({ where: { companyId: 1 } })
  })

  it('يحذف الجرد عبر علاقة count (المتبقية عبر companyId)', async () => {
    await cleanupService.resetDatabase(1, 5)
    expect(tx.inventoryCountItem.deleteMany).toHaveBeenCalledWith({
      where: { count: { companyId: 1 } },
    })
  })

  it('يُبقي السوبر أدمن والمخزن المركزي', async () => {
    await cleanupService.resetDatabase(1, 5)
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { companyId: 1, NOT: { id: 5 } },
    })
    expect(tx.warehouse.deleteMany).toHaveBeenCalledWith({
      where: { companyId: 1, NOT: { type: 'central' } },
    })
  })

  it('يعيد ضبط التسلسلات والأرصدة إلى الصفر', async () => {
    const result = await cleanupService.resetDatabase(1, 5)
    expect(tx.sequence.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1 },
      data: { currentValue: 0 },
    })
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1 },
      data: { currentBalance: 0, openingBalance: 0 },
    })
    expect(tx.treasury.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1 },
      data: { currentBalance: 0, openingBalance: 0 },
    })
    expect(result).toMatchObject({
      success: true,
      deletedUsers: 1,
      deletedWarehouses: 1,
      resetSequences: 3,
      resetAccounts: 10,
      resetTreasuries: 2,
    })
  })

  it('يجمع عدد السجلات المحذوفة في deletedTransactions', async () => {
    const result = await cleanupService.resetDatabase(1, 5)
    // 33 مكالمة deleteMany (دون users/warehouses) × { count: 1 }
    expect(result.deletedTransactions).toBe(33)
  })
})
