import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/config/database'

// =====================================================================
// اختبار التكامل الرئيسي (Spine) على قاعدة MySQL حقيقية psale_ultra_test
// الدورة: بيع (فاتورة) → قيد محاسبي تلقائي → سند قبض → تحديث الأرصدة
// + التحقق من التسوية البنكية (9.7) على خزينة بنكية
// التشغيل: npm run test:integration (يعيد تهيئة قاعدة الاختبار أولاً)
// =====================================================================

let token = ''
let companyId = 0
let warehouseId = 0
let bankTreasuryId = 0
let customersAccountId = 0
let revenueAccountId = 0
let inventoryAccountId = 0
let cogsAccountId = 0
let bankAccountId = 0
let partyId = 0
let itemId = 0
let saleInvoiceId = 0
let receiptId = 0
let reconciliationId = 0

const BASE = '/api'
const auth = () => ({ Authorization: `Bearer ${token}` })
const today = () => new Date().toISOString().slice(0, 10)

async function cleanup() {
  // ترتيب الحذف من الابن إلى الأب لاحترام القيود المرجعية
  await prisma.bankReconciliationLine.deleteMany()
  await prisma.bankReconciliation.deleteMany()
  await prisma.receipt.deleteMany()
  await prisma.saleInvoiceItem.deleteMany()
  await prisma.saleInvoice.deleteMany()
  await prisma.journalEntryLine.deleteMany()
  await prisma.journalEntry.deleteMany()
  await prisma.stockMovement.deleteMany()
  await prisma.stock.deleteMany()
  await prisma.treasury.deleteMany()
  await prisma.party.deleteMany()
  await prisma.item.deleteMany()
  await prisma.sequence.deleteMany()
  await prisma.permission.deleteMany()
  await prisma.user.deleteMany()
  await prisma.warehouse.deleteMany()
  await prisma.branch.deleteMany()
  await prisma.account.deleteMany()
  await prisma.company.deleteMany()
}

beforeAll(async () => {
  await cleanup()

  // 1) إعداد الشركة (ينشئ فرعاً رئيسياً + مخزناً مركزياً + دليلاً محاسبياً + خزينة نقدية + تسلسلات + مدير)
  const setupRes = await request(app).post(`${BASE}/auth/setup`).send({
    companyName: 'شركة اختبار التكامل',
    adminUsername: 'admin',
    adminPassword: 'admin123',
    adminFullName: 'مدير الاختبار',
  })
  expect(setupRes.status).toBe(201)
  companyId = setupRes.body.company.id

  // 2) تسجيل دخول المدير
  const loginRes = await request(app).post(`${BASE}/auth/login`).send({
    username: 'admin',
    password: 'admin123',
    deviceId: 'integration-device',
  })
  expect(loginRes.status).toBe(200)
  token = loginRes.body.accessToken

  // 3) المخزن المركزي الذي أنشأه الإعداد — المدير مربوط بالفرع الرئيسي، فيطلب "كل الفروع" صراحةً
  const whRes = await request(app).get(`${BASE}/warehouses`).query({ branchId: 'all' }).set(auth())
  expect(whRes.status).toBe(200)
  const warehouse = whRes.body.find((w: any) => w.type === 'central')
  expect(warehouse).toBeTruthy()
  warehouseId = warehouse.id

  // 4) الحسابات المحاسبية الافتراضية
  const accountsRes = await request(app).get(`${BASE}/accounts`).set(auth())
  expect(accountsRes.status).toBe(200)
  const byCode = (code: string) => accountsRes.body.find((a: any) => a.accountCode === code)?.id
  customersAccountId = byCode('1101')
  bankAccountId = byCode('1104')
  inventoryAccountId = byCode('1102')
  revenueAccountId = byCode('4101')
  cogsAccountId = byCode('5101')
  expect(customersAccountId && bankAccountId && inventoryAccountId && revenueAccountId && cogsAccountId).toBeTruthy()

  // 5) خزينة بنكية مربوطة بحساب البنوك (1104)
  const bankRes = await request(app)
    .post(`${BASE}/treasury`)
    .set(auth())
    .send({
      treasuryName: 'البنك التجاري',
      treasuryType: 'bank',
      currency: 'LYD',
      openingBalance: 0,
      accountId: bankAccountId,
      bankName: 'البنك التجاري',
      accountNumber: '123-456',
    })
  expect(bankRes.status).toBe(201)
  bankTreasuryId = bankRes.body.id

  // 6) عميل
  const partyRes = await request(app)
    .post(`${BASE}/parties`)
    .set(auth())
    .send({
      partyCode: 'C-001',
      partyName: 'مؤسسة النور',
      partyType: 'customer',
      accountId: customersAccountId,
    })
  expect(partyRes.status).toBe(201)
  partyId = partyRes.body.id

  // 7) صنف برصيد افتتاحي (ينشئ حركة مخزون في المخزن المركزي)
  const itemRes = await request(app)
    .post(`${BASE}/items`)
    .set(auth())
    .send({
      itemCode: 'ITM-001',
      itemName: 'لوحة أم ASUS',
      purchasePrice: 40,
      salePrice: 100,
      openingStock: 5,
    })
  expect(itemRes.status).toBe(201)
  itemId = itemRes.body.id

  // تعيين تكلفة الصنف لتوليد قيد تكلفة ذي قيمة فعلية
  await prisma.item.update({ where: { id: itemId }, data: { costPrice: 40 } })
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Spine: بيع ← قيد محاسبي ← سند قبض (قاعدة MySQL حقيقية)', () => {
  it('ينشئ فاتورة بيع ويولّد القيدين (إيراد + تكلفة) ويحدّث الأرصدة', async () => {
    const res = await request(app)
      .post(`${BASE}/sales`)
      .set(auth())
      .send({
        warehouseId,
        invoiceDate: today(),
        partyId,
        paidAmount: 0,
        items: [{ itemId, quantity: 2, unitPrice: 100 }],
      })
    expect(res.status).toBe(201)
    const invoice = res.body
    saleInvoiceId = invoice.id
    expect(Number(invoice.total)).toBe(200)
    expect(invoice.paymentStatus).toBe('unpaid')
    expect(invoice.items.length).toBe(1)

    // المخزون انخفض من 5 إلى 3
    const stock = await prisma.stock.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId } },
    })
    expect(stock?.quantity.toNumber()).toBe(3)

    // قيدان مرتبطان بالفواتير: إيراد (SALE) + تكلفة (COGS)
    const entries = await prisma.journalEntry.findMany({
      where: { referenceType: 'sale_invoice', referenceId: saleInvoiceId },
      include: { lines: true },
    })
    expect(entries.length).toBe(2)

    const saleEntry = entries.find((e) => e.entryType === 'sale')
    const cogsEntry = entries.find((e) => e.entryType === 'cogs')
    expect(saleEntry).toBeTruthy()
    expect(cogsEntry).toBeTruthy()

    // قيد الإيراد: مدين العملاء 200 / دائن الإيرادات 200
    expect(saleEntry!.totalDebit.toNumber()).toBe(200)
    expect(saleEntry!.totalCredit.toNumber()).toBe(200)
    const saleDebit = saleEntry!.lines.find((l) => l.accountId === customersAccountId)
    const saleCredit = saleEntry!.lines.find((l) => l.accountId === revenueAccountId)
    expect(saleDebit?.debit.toNumber()).toBe(200)
    expect(saleCredit?.credit.toNumber()).toBe(200)
    expect(saleDebit?.partyId).toBe(partyId)

    // قيد التكلفة: مدين تكلفة المبيعات 80 / دائن المخزون 80 (2 × 40)
    expect(cogsEntry!.totalDebit.toNumber()).toBe(80)
    const cogsDebit = cogsEntry!.lines.find((l) => l.accountId === cogsAccountId)
    const cogsCredit = cogsEntry!.lines.find((l) => l.accountId === inventoryAccountId)
    expect(cogsDebit?.debit.toNumber()).toBe(80)
    expect(cogsCredit?.credit.toNumber()).toBe(80)

    // أرصدة الحسابات: العملاء +200، الإيرادات −200، التكلفة +80، المخزون −80
    const bal = (id: number) => prisma.account.findUnique({ where: { id } })
    expect((await bal(customersAccountId))!.currentBalance.toNumber()).toBe(200)
    expect((await bal(revenueAccountId))!.currentBalance.toNumber()).toBe(-200)
    expect((await bal(cogsAccountId))!.currentBalance.toNumber()).toBe(80)
    expect((await bal(inventoryAccountId))!.currentBalance.toNumber()).toBe(-80)

    // رصيد العميل +200
    const party = await prisma.party.findUnique({ where: { id: partyId } })
    expect(party?.currentBalance.toNumber()).toBe(200)
  })

  it('ينشئ سند قبض على الخزينة البنكية ويثبت المبلغ ويسدد الفاتورة', async () => {
    const res = await request(app)
      .post(`${BASE}/treasury/receipts`)
      .set(auth())
      .send({
        receiptDate: today(),
        receiptType: 'receipt',
        partyId,
        treasuryId: bankTreasuryId,
        currency: 'LYD',
        exchangeRate: 1,
        amount: 200,
        paymentMethod: 'transfer',
        saleInvoiceId,
      })
    expect(res.status).toBe(201)
    const receipt = res.body
    receiptId = receipt.id
    expect(receipt.receiptNumber.startsWith('RCV')).toBe(true)
    expect(receipt.journalEntryId).toBeTruthy()

    // القيد المحاسبي للسند: مدين البنك 200 / دائن العملاء 200
    const entry = await prisma.journalEntry.findFirst({
      where: { referenceType: 'receipt', referenceId: receiptId },
      include: { lines: true },
    })
    expect(entry).toBeTruthy()
    expect(entry!.totalDebit.toNumber()).toBe(200)
    expect(entry!.totalCredit.toNumber()).toBe(200)
    const bankDebit = entry!.lines.find((l) => l.accountId === bankAccountId)
    const customerCredit = entry!.lines.find((l) => l.accountId === customersAccountId)
    expect(bankDebit?.debit.toNumber()).toBe(200)
    expect(customerCredit?.credit.toNumber()).toBe(200)
    expect(customerCredit?.partyId).toBe(partyId)

    // رصيد الخزينة البنكية = 200
    const treasury = await prisma.treasury.findUnique({ where: { id: bankTreasuryId } })
    expect(treasury?.currentBalance.toNumber()).toBe(200)

    // رصيد حساب البنك = +200، رصيد العميل عاد إلى صفر، الفاتورة أصبحت مدفوعة
    const bank = await prisma.account.findUnique({ where: { id: bankAccountId } })
    expect(bank?.currentBalance.toNumber()).toBe(200)
    const party = await prisma.party.findUnique({ where: { id: partyId } })
    expect(party?.currentBalance.toNumber()).toBe(0)
    const invoice = await prisma.saleInvoice.findUnique({ where: { id: saleInvoiceId } })
    expect(invoice?.paidAmount.toNumber()).toBe(200)
    expect(invoice?.paymentStatus).toBe('paid')
  })

  it('يستعرض حركات الخزينة البنكية وينشئ تسوية متوازنة ويغلقها', async () => {
    // 1) حركات فترة التسوية (سند القبض في الفترة)
    const txRes = await request(app)
      .get(`${BASE}/treasury/reconciliations/${bankTreasuryId}/transactions`)
      .set(auth())
      .query({ from: today(), to: today() })
    expect(txRes.status).toBe(200)
    expect(txRes.body.treasury.treasuryType).toBe('bank')
    expect(txRes.body.openingBalance).toBe(0)
    expect(txRes.body.totalReceipts).toBe(1)
    expect(txRes.body.totalPayments).toBe(0)
    expect(txRes.body.closingSystemBalance).toBe(200)
    expect(txRes.body.transactions.some((t: any) => t.id === receiptId)).toBe(true)

    // 2) إنشاء تسوية بنكية (كشف البنك 200 مقابل رصيد النظام 200 ← متوازنة)
    const createRes = await request(app)
      .post(`${BASE}/treasury/reconciliations`)
      .set(auth())
      .send({
        treasuryId: bankTreasuryId,
        from: today(),
        statementDate: today(),
        openingBalance: 0,
        statementBalance: 200,
        matchedReceiptIds: [receiptId],
        notes: 'تسوية اختبار التكامل',
      })
    expect(createRes.status).toBe(201)
    const recon = createRes.body
    reconciliationId = recon.id
    expect(recon.reconNumber.startsWith('RC')).toBe(true)
    expect(Number(recon.systemBalance)).toBe(200)
    expect(Number(recon.difference)).toBe(0)
    expect(recon.status).toBe('matched')
    expect(recon.lines.length).toBe(1)
    expect(recon.lines[0].isMatched).toBe(true)

    // 3) القائمة تضم التسوية الجديدة
    const listRes = await request(app).get(`${BASE}/treasury/reconciliations`).set(auth())
    expect(listRes.status).toBe(200)
    expect(listRes.body.some((r: any) => r.id === reconciliationId)).toBe(true)

    // 4) إغلاق التسوية
    const completeRes = await request(app)
      .post(`${BASE}/treasury/reconciliations/${reconciliationId}/complete`)
      .set(auth())
    expect(completeRes.status).toBe(200)
    expect(completeRes.body.status).toBe('completed')

    // 5) التفاصيل
    const detailRes = await request(app)
      .get(`${BASE}/treasury/reconciliations/${reconciliationId}`)
      .set(auth())
    expect(detailRes.status).toBe(200)
    expect(detailRes.body.lines[0].receipt.id).toBe(receiptId)
  })
})

describe('Sync: عدم التكرار (Claim-First) وإعادة المحاولة على MySQL حقيقية', () => {
  const pushBody = (changes: any[]) => ({ deviceId: 'integration-sync-device', changes })

  // المدير مربوط بالفرع الرئيسي (كما ينشئه الإعداد)، وفرع العنصر يجب أن يطابق فرع التوكن
  async function adminIdentity() {
    const u = await prisma.user.findFirst({ where: { companyId, username: 'admin' } })
    if (!u) throw new Error('المستخدم admin غير موجود')
    return { userId: u.id, branchId: u.branchId ?? null }
  }

  async function countSalesAndEntries() {
    const invoices = await prisma.saleInvoice.count({ where: { companyId } })
    const entries = await prisma.journalEntry.count({
      where: { companyId, referenceType: 'sale_invoice' },
    })
    return { invoices, entries }
  }

  it('طلبان متوازيان بنفس clientOpId ينشئان فاتورة واحدة وقيدين فقط', async () => {
    const { userId, branchId } = await adminIdentity()
    const before = await countSalesAndEntries()

    const change = {
      clientOpId: `integ-parallel:${Date.now()}`,
      queueId: 1,
      entity: 'saleInvoice',
      action: 'create',
      userId,
      branchId,
      data: {
        warehouseId,
        partyId,
        invoiceDate: today(),
        paidAmount: 0,
        items: [{ itemId, quantity: 1, unitPrice: 100 }],
      },
    }

    const [r1, r2] = await Promise.all([
      request(app).post(`${BASE}/sync/push`).set(auth()).send(pushBody([change])),
      request(app).post(`${BASE}/sync/push`).set(auth()).send(pushBody([change])),
    ])

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(r1.body.recordsCount + r2.body.recordsCount).toBe(1)
    expect(r1.body.skippedCount + r2.body.skippedCount).toBe(1)

    const after = await countSalesAndEntries()
    expect(after.invoices - before.invoices).toBe(1)
    expect(after.entries - before.entries).toBe(2) // إيراد + تكلفة
  })

  it('عملية فاشلة تُحرَّر فتنجح إعادة المحاولة بالمعرّف نفسه، ثم يُتخطى التكرار', async () => {
    const { userId, branchId } = await adminIdentity()
    const clientOpId = `integ-retry:${Date.now()}`
    const base = { clientOpId, queueId: 2, entity: 'party', action: 'create', userId, branchId }
    const partyName = `عميل إعادة المحاولة ${Date.now()}`

    const failed = await request(app)
      .post(`${BASE}/sync/push`)
      .set(auth())
      .send(pushBody([{ ...base, data: {} }]))
    expect(failed.body.recordsCount).toBe(0)
    expect(failed.body.errors[0].queueId).toBe(2)

    const retried = await request(app)
      .post(`${BASE}/sync/push`)
      .set(auth())
      .send(pushBody([{ ...base, data: { partyName, partyType: 'customer' } }]))
    expect(retried.body.recordsCount).toBe(1)
    expect(retried.body.errors).toHaveLength(0)

    const duplicate = await request(app)
      .post(`${BASE}/sync/push`)
      .set(auth())
      .send(pushBody([{ ...base, data: { partyName, partyType: 'customer' } }]))
    expect(duplicate.body.skippedCount).toBe(1)

    const count = await prisma.party.count({ where: { companyId, partyName } })
    expect(count).toBe(1)
  })
})

// =====================================================================
// تفويض المزامنة (RBAC) — سيناريو الهجوم الفعلي على MySQL حقيقية
// كاشير يرسل دفعة تحتوي قيداً محاسبياً + فاتورة بيع: يُرفض القيد وتُقبل الفاتورة
// =====================================================================

describe('Sync RBAC: منع تجاوز الصلاحيات عبر /sync/push', () => {
  const CASHIER_PASSWORD = 'Cashier123!'
  let cashierToken = ''
  let cashierId = 0
  let cashierBranchId: number | null = null

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { companyId, username: 'admin' } })
    if (!admin) throw new Error('المستخدم admin غير موجود')

    const username = `cashier_${Date.now()}`

    // إنشاء كاشير من مسار الإعدادات الرسمي (يطبّق وصفة صلاحيات الدور)
    const created = await request(app)
      .post(`${BASE}/settings/users`)
      .set(auth())
      .send({
        username,
        password: CASHIER_PASSWORD,
        fullName: 'كاشير اختبار RBAC',
        role: 'cashier',
        branchId: admin.branchId,
      })
    expect(created.status).toBe(201)
    cashierId = created.body.id ?? created.body.user?.id

    const login = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ username, password: CASHIER_PASSWORD, deviceId: 'cashier-rbac-device' })
    expect(login.status).toBe(200)
    cashierToken = login.body.accessToken
    cashierBranchId = login.body.user?.branchId ?? admin.branchId ?? null
  })

  it('كاشير: يُرفض القيد المحاسبي وتُقبل فاتورة البيع في الدفعة نفسها', async () => {
    const invoicesBefore = await prisma.saleInvoice.count({ where: { companyId } })

    const res = await request(app)
      .post(`${BASE}/sync/push`)
      .set({ Authorization: `Bearer ${cashierToken}` })
      .send({
        deviceId: 'cashier-rbac-device',
        changes: [
          {
            clientOpId: `rbac-journal:${Date.now()}`,
            queueId: 101,
            entity: 'journalEntry',
            action: 'create',
            userId: cashierId,
            branchId: cashierBranchId,
            data: {
              entryDate: today(),
              entryType: 'adjusting',
              description: 'محاولة حقن قيد من كاشير',
              lines: [
                { accountId: customersAccountId, debit: 500, credit: 0 },
                { accountId: revenueAccountId, debit: 0, credit: 500 },
              ],
            },
          },
          {
            clientOpId: `rbac-sale:${Date.now()}`,
            queueId: 102,
            entity: 'saleInvoice',
            action: 'create',
            userId: cashierId,
            branchId: cashierBranchId,
            data: {
              warehouseId,
              partyId,
              invoiceDate: today(),
              paidAmount: 0,
              items: [{ itemId, quantity: 1, unitPrice: 100 }],
            },
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.recordsCount).toBe(1)
    expect(res.body.errors).toHaveLength(1)
    expect(res.body.errors[0]).toMatchObject({ entity: 'journalEntry', queueId: 101, code: 'FORBIDDEN' })

    // القيد اليدوي لم يُنشأ (قد تُنشئ فاتورة البيع قيودها التلقائية، لذلك نتحقق بالوصف لا بالعدد)
    const hijacked = await prisma.journalEntry.count({
      where: { companyId, description: 'محاولة حقن قيد من كاشير' },
    })
    expect(hijacked).toBe(0)
    expect(await prisma.saleInvoice.count({ where: { companyId } })).toBe(invoicesBefore + 1)
  })

  it('كاشير: لا يستطيع تعديل صنف (سعر البيع) عبر المزامنة', async () => {
    const item = await prisma.item.findFirst({ where: { id: itemId } })
    const originalPrice = item!.salePrice.toString()

    const res = await request(app)
      .post(`${BASE}/sync/push`)
      .set({ Authorization: `Bearer ${cashierToken}` })
      .send({
        deviceId: 'cashier-rbac-device',
        changes: [
          {
            clientOpId: `rbac-item:${Date.now()}`,
            queueId: 103,
            entity: 'item',
            action: 'update',
            id: itemId,
            userId: cashierId,
            branchId: cashierBranchId,
            data: { salePrice: 1 },
          },
        ],
      })

    expect(res.body.recordsCount).toBe(0)
    expect(res.body.errors).toHaveLength(1)
    expect(res.body.errors[0].code).toBe('FORBIDDEN')

    const after = await prisma.item.findFirst({ where: { id: itemId } })
    expect(after!.salePrice.toString()).toBe(originalPrice)
  })

  it('المحاسب: القيد المحاسبي مسموح عبر المزامنة', async () => {
    const username = `accountant_${Date.now()}`
    const password = 'Accountant123!'

    const created = await request(app)
      .post(`${BASE}/settings/users`)
      .set(auth())
      .send({ username, password, fullName: 'محاسب اختبار RBAC', role: 'accountant', branchId: cashierBranchId })
    expect(created.status).toBe(201)
    const accountantId = created.body.id ?? created.body.user?.id

    const login = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ username, password, deviceId: 'accountant-rbac-device' })
    expect(login.status).toBe(200)

    const entriesBefore = await prisma.journalEntry.count({ where: { companyId } })

    const res = await request(app)
      .post(`${BASE}/sync/push`)
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .send({
        deviceId: 'accountant-rbac-device',
        changes: [
          {
            clientOpId: `rbac-acc-journal:${Date.now()}`,
            queueId: 104,
            entity: 'journalEntry',
            action: 'create',
            userId: accountantId,
            branchId: login.body.user?.branchId ?? cashierBranchId,
            data: {
              entryDate: today(),
              entryType: 'adjusting',
              description: 'قيد من محاسب عبر المزامنة',
              lines: [
                { accountId: customersAccountId, debit: 50, credit: 0 },
                { accountId: revenueAccountId, debit: 0, credit: 50 },
              ],
            },
          },
        ],
      })

    expect(res.body.errors).toHaveLength(0)
    expect(res.body.recordsCount).toBe(1)
    expect(await prisma.journalEntry.count({ where: { companyId } })).toBe(entriesBefore + 1)
  })

  it('المحاولة غير المصرح بها تُسجَّل في AuditLog كحدث أمني', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { companyId, eventType: 'UNAUTHORIZED_SYNC_ATTEMPT' },
      orderBy: { id: 'desc' },
    })

    const journalAttempt = logs.find((l) => String(l.newValues).includes('journalEntry'))
    expect(journalAttempt).toBeTruthy()
    expect(journalAttempt!.userId).toBe(cashierId)
    expect(journalAttempt!.action).toBe('SECURITY_EVENT')
  })
})
