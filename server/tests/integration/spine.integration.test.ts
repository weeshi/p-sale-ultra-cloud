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

  // 3) المخزن المركزي الذي أنشأه الإعداد
  const whRes = await request(app).get(`${BASE}/warehouses`).set(auth())
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
