import { prisma } from '../config/database'
import { syncService } from './syncService'
import { purchaseService } from './purchaseService'
import { transferService } from './transferService'
import { inventoryService } from './inventoryService'
import { saleService } from './saleService'
import { treasuryService } from './treasuryService'
import { sequenceService } from './sequenceService'
import { logSecurityEvent } from '../middleware/audit'
import { notifyTransfer } from '../realtime'

jest.mock('../config/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    syncLog: { create: jest.fn() },
    syncOperation: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    item: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    party: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    user: { findFirst: jest.fn(), update: jest.fn() },
    permission: { deleteMany: jest.fn(), createMany: jest.fn() },
    stock: { create: jest.fn() },
    warehouse: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    branch: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    treasury: { findFirst: jest.fn() },
    exchangeRate: { findFirst: jest.fn() },
  },
}))

jest.mock('./purchaseService', () => ({
  purchaseService: {
    createDirectPurchase: jest.fn(),
    createPurchaseOrder: jest.fn(),
    receivePurchaseOrder: jest.fn(),
  },
}))
jest.mock('./saleService', () => ({
  saleService: { createSaleInvoice: jest.fn(), createQuote: jest.fn() },
}))
jest.mock('./transferService', () => ({ transferService: { createTransfer: jest.fn() } }))
jest.mock('./inventoryService', () => ({
  inventoryService: {
    createCount: jest.fn(),
    processCountItem: jest.fn(),
    registerDamaged: jest.fn(),
    reverseDamaged: jest.fn(),
  },
}))
jest.mock('./accountingService', () => ({ accountingService: { createJournalEntry: jest.fn() } }))
jest.mock('./treasuryService', () => ({ treasuryService: { createReceipt: jest.fn() } }))
jest.mock('./reconciliationService', () => ({
  reconciliationService: { createReconciliation: jest.fn() },
}))
jest.mock('./sequenceService', () => ({
  sequenceService: { next: jest.fn(), ensure: jest.fn(), current: jest.fn() },
}))
jest.mock('../realtime', () => ({ notifyTransfer: jest.fn() }))
jest.mock('../middleware/audit', () => ({ logSecurityEvent: jest.fn() }))

const mockPrisma = prisma as any
const mockNext = sequenceService.next as jest.Mock
const mockDirectPurchase = purchaseService.createDirectPurchase as jest.Mock
const mockReceive = purchaseService.receivePurchaseOrder as jest.Mock
const mockCreateTransfer = transferService.createTransfer as jest.Mock
const mockProcessCountItem = inventoryService.processCountItem as jest.Mock
const mockSaleInvoice = saleService.createSaleInvoice as jest.Mock
const mockReceipt = treasuryService.createReceipt as jest.Mock
const mockSecurity = logSecurityEvent as jest.Mock
const mockNotify = notifyTransfer as jest.Mock

const COMPANY = 1
const USER = 7
const BRANCH = 2
const DEVICE = 'dev-test'

function change(overrides: Record<string, any> = {}) {
  return {
    entity: 'party',
    action: 'create',
    id: undefined,
    data: { partyName: 'عميل اختباري' },
    timestamp: Date.now(),
    userId: USER,
    branchId: BRANCH,
    ...overrides,
  }
}

async function push(changes: any[], actorIsSuperAdmin = false, role = 'manager') {
  return syncService.pushChanges(
    COMPANY,
    { userId: USER, branchId: BRANCH, isSuperAdmin: actorIsSuperAdmin, role },
    DEVICE,
    changes
  )
}

const UNIQUE_VIOLATION = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

describe('SyncService.pushChanges', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.syncLog.create.mockResolvedValue({ id: 1 })
    mockPrisma.syncOperation.findUnique.mockResolvedValue(null)
    mockPrisma.syncOperation.create.mockResolvedValue({ id: 1 })
    mockPrisma.syncOperation.delete.mockResolvedValue({ id: 1 })
    mockPrisma.syncOperation.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.exchangeRate.findFirst.mockResolvedValue(null)
    mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 30, type: 'central', branchId: BRANCH })
    mockPrisma.stock.create.mockResolvedValue({ id: 1 })
    mockPrisma.item.create.mockResolvedValue({ id: 500 })
    mockPrisma.party.create.mockResolvedValue({ id: 600 })
    mockPrisma.user.findFirst.mockResolvedValue(null)
    mockPrisma.user.update.mockResolvedValue({ id: 5 })
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma))
    mockNext.mockResolvedValue(12)
    mockDirectPurchase.mockResolvedValue({ id: 1 })
    mockReceive.mockResolvedValue({ id: 2 })
    mockSaleInvoice.mockResolvedValue({ id: 8 })
    mockReceipt.mockResolvedValue({ id: 9 })
    mockCreateTransfer.mockResolvedValue({ id: 3, transferNumber: 'TRN-000003', status: 'pending' })
    mockProcessCountItem.mockResolvedValue({ id: 4 })
  })

  // ===== الهوية والفرع (أمان) =====
  it('يرفض عنصراً يدّعي هوية مستخدم مختلفاً ويسجل حدثاً أمنياً', async () => {
    const result = await push([change({ queueId: 11, userId: 999 })])

    expect(result.recordsCount).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].queueId).toBe(11)
    expect(result.errors[0].message).toContain('تزوير')
    expect(mockSecurity).toHaveBeenCalledWith('IDENTITY_TAMPERING', expect.any(String), {
      companyId: COMPANY,
      userId: USER,
    })
    expect(mockPrisma.party.create).not.toHaveBeenCalled()
  })

  it('يرفض عنصراً يخص فرعاً آخر ويسجل BRANCH_ACCESS_DENIED', async () => {
    const result = await push([change({ branchId: 5 })])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('فرع غير مصرح')
    expect(mockSecurity).toHaveBeenCalledWith('BRANCH_ACCESS_DENIED', expect.any(String), {
      companyId: COMPANY,
      userId: USER,
    })
  })

  it('مستخدم مقيّد بفرع: يُجبر فرع الفاتورة على فرعه ويتجاهل payload.branchId', async () => {
    await push([
      change({
        entity: 'saleInvoice',
        action: 'create',
        data: { warehouseId: 30, branchId: 9, items: [{ itemId: 100, quantity: 1, unitPrice: 10 }] },
      }),
    ])

    expect(mockSaleInvoice).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH, createdBy: USER }))
  })

  it('مستخدم مقيّد بفرع: يُجبر فرع السند على فرعه', async () => {
    await push([
      change({
        entity: 'receipt',
        action: 'create',
        data: { receiptType: 'receipt', treasuryId: 4, amount: 5, branchId: 9, currency: 'LYD' },
      }),
    ])

    expect(mockReceipt).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH }))
  })

  it('مستخدم مقيّد بفرع: يُجبر فرع التحويل والجرد على فرعه (عبر الحقل المرسل من الواجهة)', async () => {
    await push([
      change({
        entity: 'purchaseInvoice',
        action: 'create',
        data: {
          partyId: 5,
          warehouseId: 30,
          branchId: 9,
          currency: 'LYD',
          exchangeRate: 1,
          items: [{ itemId: 100, quantity: 1, unitPrice: 10, unitPriceLyd: 10 }],
        },
      }),
    ])

    expect(mockDirectPurchase).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH }))
  })

  it('السوبر أدمن (actorIsSuperAdmin) يحتفظ بفرع الحمولة لأنه غير مقيّد', async () => {
    await push(
      [
        change({
          entity: 'saleInvoice',
          action: 'create',
          branchId: BRANCH,
          data: { warehouseId: 30, branchId: 9, items: [{ itemId: 100, quantity: 1, unitPrice: 10 }] },
        }),
      ],
      true
    )

    expect(mockSaleInvoice).toHaveBeenCalledWith(expect.objectContaining({ branchId: 9 }))
  })

  // ===== البند 2: المستخدم مقيّد بالشركة =====
  it('يرفض تعديل مستخدم يتبع شركة أخرى (لا يُنفَّذ update)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null)

    const result = await push(
      [change({ entity: 'user', action: 'update', id: 5, data: { fullName: 'مخترق', permissions: [] } })],
      false,
      'admin'
    )

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({ where: { id: 5, companyId: COMPANY } })
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('غير موجود في هذه الشركة')
  })

  it('كاشير لا يملك صلاحية إدارة المستخدمين لا يستطيع تعديل مستخدم (منع تصعيد الصلاحيات)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 5, companyId: COMPANY })

    const result = await push(
      [change({ entity: 'user', action: 'update', id: 5, data: { role: 'admin', permissions: [] } })],
      false,
      'cashier'
    )

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('صلاحية')
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('يحدّث مستخدم الشركة نفسها', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 5, companyId: COMPANY })

    const result = await push(
      [change({ entity: 'user', action: 'update', id: 5, data: { fullName: 'اسم جديد', permissions: [] } })],
      false,
      'admin'
    )

    expect(result.errors).toHaveLength(0)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({ fullName: 'اسم جديد' }),
    })
  })

  // ===== البند 4: تحديث الجرد يتطلب countId =====
  it('يرفض تحديث بند جرد بدون countId بخطأ واضح دون السقوط للمسار العام', async () => {
    const result = await push([
      change({
        entity: 'inventoryCount',
        action: 'update',
        id: 44,
        data: { itemId: 100, countedGoodQty: 7, countedDamagedQty: 0 },
      }),
    ])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('countId')
    expect(mockProcessCountItem).not.toHaveBeenCalled()
    expect(mockPrisma.inventoryCount).toBeUndefined()
  })

  // ===== البند 1: الحجز الذري المسبق لـ clientOpId =====
  it('يتخطى العملية عند فشل الحجز بسبب تكرار المعرّف (P2002) دون تنفيذها', async () => {
    mockPrisma.syncOperation.create.mockRejectedValue(UNIQUE_VIOLATION)

    const result = await push([change({ queueId: 3, clientOpId: 'dev-test:3:1' })])

    expect(result.recordsCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockPrisma.party.create).not.toHaveBeenCalled()
  })

  it('يحجز clientOpId قبل تنفيذ العملية (وليس بعدها)', async () => {
    await push([change({ queueId: 4, clientOpId: 'dev-test:4:1' })])

    const claimOrder = mockPrisma.syncOperation.create.mock.invocationCallOrder[0]
    const applyOrder = mockPrisma.party.create.mock.invocationCallOrder[0]
    expect(claimOrder).toBeLessThan(applyOrder)
    expect(mockPrisma.syncOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: COMPANY,
        deviceId: DEVICE,
        clientOpId: 'dev-test:4:1',
        entity: 'party',
        action: 'create',
      }),
    })
  })

  it('عند فشل تنفيذ العملية يحرر الحجز ويُرجع الخطأ بـ queueId الصحيح', async () => {
    const result = await push([change({ queueId: 55, clientOpId: 'dev-test:55:1', data: {} })])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].queueId).toBe(55)
    expect(mockPrisma.syncOperation.delete).toHaveBeenCalledWith({ where: { clientOpId: 'dev-test:55:1' } })
  })

  it('بعد تحرير الحجز تستطيع إعادة المحاولة بنفس المعرّف وتنجح', async () => {
    const failing = change({ queueId: 66, clientOpId: 'dev-test:66:1', data: {} })
    await push([failing])

    const fixed = change({ queueId: 66, clientOpId: 'dev-test:66:1', data: { partyName: 'مصحّح' } })
    const retry = await push([fixed])

    expect(retry.recordsCount).toBe(1)
    expect(retry.skippedCount).toBe(0)
    expect(mockPrisma.party.create).toHaveBeenCalledTimes(1)
  })

  it('طلبان متوازيان بنفس المعرّف: تُنفَّذ العملية مرة واحدة فقط', async () => {
    // محاكاة قيد UNIQUE في قاعدة البيانات: أول إدراج ينجح والثاني يفشل بـ P2002
    const claimed = new Set<string>()
    mockPrisma.syncOperation.create.mockImplementation(async ({ data }: any) => {
      await new Promise((r) => setImmediate(r))
      if (claimed.has(data.clientOpId)) throw UNIQUE_VIOLATION
      claimed.add(data.clientOpId)
      return { id: 1 }
    })

    const same = [change({ queueId: 9, clientOpId: 'dev-test:9:1' })]
    const [a, b] = await Promise.all([push(same), push(same)])

    expect(a.recordsCount + b.recordsCount).toBe(1)
    expect(a.skippedCount + b.skippedCount).toBe(1)
    expect(mockPrisma.party.create).toHaveBeenCalledTimes(1)
  })

  // ===== توجيه خدمات الأعمال (15.2) =====
  it('يوجه فاتورة الشراء المحلية إلى purchaseService.createDirectPurchase مع فرع المستخدم', async () => {
    const result = await push([
      change({
        entity: 'purchaseInvoice',
        action: 'create',
        data: {
          partyId: 5,
          warehouseId: 30,
          currency: 'LYD',
          exchangeRate: 1,
          items: [{ itemId: 100, quantity: 2, unitPrice: 50, unitPriceLyd: 50 }],
        },
      }),
    ])

    expect(result.errors).toHaveLength(0)
    expect(mockDirectPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, branchId: BRANCH, partyId: 5, warehouseId: 30, createdBy: USER })
    )
  })

  it('يوجه استلام أمر الاستيراد إلى receivePurchaseOrder عند وجود purchaseOrderId', async () => {
    await push([
      change({ entity: 'purchaseInvoice', action: 'create', data: { purchaseOrderId: 9, warehouseId: 30, items: [] } }),
    ])

    expect(mockReceive).toHaveBeenCalledWith(9, expect.objectContaining({ companyId: COMPANY, warehouseId: 30, createdBy: USER }))
    expect(mockDirectPurchase).not.toHaveBeenCalled()
  })

  it('يوجه التحويل إلى transferService.createTransfer ويطلق إشعاراً لحظياً', async () => {
    await push([
      change({
        entity: 'stockTransfer',
        action: 'create',
        data: {
          fromWarehouseId: 30,
          toWarehouseId: 31,
          transferType: 'branch_request',
          items: [{ itemId: 100, quantity: 1, unitCost: 10 }],
        },
      }),
    ])

    expect(mockCreateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, fromWarehouseId: 30, toWarehouseId: 31, createdBy: USER })
    )
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), 'created')
  })

  it('مستخدم مقيّد لا يحوّل من مخزن يتبع فرعاً آخر', async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValueOnce({ id: 30, branchId: BRANCH })
    mockPrisma.warehouse.findFirst.mockResolvedValueOnce({ id: 31, branchId: 9 })

    const result = await push([
      change({
        entity: 'stockTransfer',
        action: 'create',
        data: { fromWarehouseId: 30, toWarehouseId: 31, items: [{ itemId: 100, quantity: 1 }] },
      }),
    ])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('فرع')
    expect(mockCreateTransfer).not.toHaveBeenCalled()
  })

  it('يوجه إدخال كمية الجرد إلى inventoryService.processCountItem', async () => {
    await push([
      change({
        entity: 'inventoryCount',
        action: 'update',
        id: 44,
        data: { countId: 44, itemId: 100, countedGoodQty: 7, countedDamagedQty: 1 },
      }),
    ])

    expect(mockProcessCountItem).toHaveBeenCalledWith(44, 100, 7, 1)
  })

  it('ينشئ صنفاً جديداً برقم ITM تلقائي ورصيد افتتاحي في المخزن المركزي', async () => {
    await push([change({ entity: 'item', action: 'create', data: { itemName: 'لابتوب', openingStock: 3, salePrice: 1000 } })])

    expect(mockNext).toHaveBeenCalledWith(COMPANY, 'ITM')
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: COMPANY, itemCode: 'ITM-000012', itemName: 'لابتوب' }),
    })
    expect(mockPrisma.stock.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY, itemId: 500, warehouseId: 30, quantity: 3 },
    })
  })

  it('ينشئ طرفاً جديداً برقم PTY تلقائي ورصيد افتتاحي مطابق', async () => {
    mockNext.mockResolvedValue(70)

    await push([change({ entity: 'party', action: 'create', data: { partyName: 'مورد', openingBalance: 250 } })])

    expect(mockPrisma.party.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: COMPANY, partyCode: 'PTY-000070', openingBalance: 250, currentBalance: 250 }),
    })
  })

  // ===== 15.3 عزل companyId =====
  it('يرفض تعديل سجل يتبع شركة أخرى', async () => {
    mockPrisma.branch.findFirst.mockResolvedValue(null)

    const result = await push([change({ entity: 'branch', action: 'update', id: 99, data: { branchName: 'فرع آخر' } })])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('غير موجود في هذه الشركة')
    expect(mockPrisma.branch.update).not.toHaveBeenCalled()
  })

  it('يرفض حذف سجل يتبع شركة أخرى', async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValue(null)

    const result = await push([change({ entity: 'warehouse', action: 'delete', id: 77 })])

    expect(result.errors).toHaveLength(1)
    expect(mockPrisma.warehouse.delete).not.toHaveBeenCalled()
  })

  it('يحدّث سجلاً تابعاً للشركة ويجبر فرعه على فرع المستخدم', async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 77, companyId: COMPANY })
    mockPrisma.warehouse.update.mockResolvedValue({ id: 77 })

    const result = await push([change({ entity: 'warehouse', action: 'update', id: 77, data: { name: 'مخزن', branchId: 9 } })])

    expect(result.errors).toHaveLength(0)
    expect(mockPrisma.warehouse.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: expect.objectContaining({ name: 'مخزن', branchId: BRANCH }),
    })
  })
})
