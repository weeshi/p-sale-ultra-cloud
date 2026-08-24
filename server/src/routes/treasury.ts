import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize, resolveBranchScope } from '../middleware/auth'
import { treasuryService } from '../services/treasuryService'
import { reconciliationService } from '../services/reconciliationService'

const router = Router()
router.use(authenticate)

// الخزائن
router.get('/', async (req, res) => {
  try {
    const branchScope = resolveBranchScope(req)
    const where: any = { companyId: req.companyId, isActive: true }
    if (branchScope) where.branchId = branchScope
    const treasuries = await prisma.treasury.findMany({
      where,
      include: { account: true, branch: true },
      orderBy: { treasuryName: 'asc' },
    })
    return res.json(treasuries)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء خزينة
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  try {
    const {
      treasuryName,
      treasuryType = 'cash',
      currency = 'LYD',
      openingBalance,
      accountId,
      bankName,
      accountNumber,
      iban,
    } = req.body

    if (!treasuryName) return res.status(400).json({ error: 'اسم الخزينة مطلوب' })

    const branchId = req.body.branchId ?? req.branchId ?? null

    const treasury = await prisma.treasury.create({
      data: {
        companyId: req.companyId!,
        branchId,
        treasuryName,
        treasuryType,
        currency,
        openingBalance: openingBalance || 0,
        currentBalance: openingBalance || 0,
        accountId,
        bankName,
        accountNumber,
        iban,
      },
    })

    return res.status(201).json(treasury)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// سندات القبض والصرف
router.get('/receipts', async (req, res) => {
  try {
    const { from, to, type, treasuryId, partyId, page = 1, limit = 50 } = req.query
    const where: any = { companyId: req.companyId }

    // فلتر الفرع: سوبر أدمن يرى كل شيء، مستخدم مربوط يرى فرعه فقط
    const branchScope = resolveBranchScope(req)
    if (branchScope) {
      where.treasury = { branchId: branchScope }
    }

    if (from || to) {
      where.receiptDate = {}
      if (from) where.receiptDate.gte = new Date(String(from))
      if (to) where.receiptDate.lte = new Date(String(to))
    }
    if (type) where.receiptType = String(type)
    if (treasuryId) where.treasuryId = Number(treasuryId)
    if (partyId) where.partyId = Number(partyId)

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        include: { party: true, treasury: true },
        orderBy: { receiptDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.receipt.count({ where }),
    ])

    return res.json({ receipts, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// سند واحد
router.get('/receipts/:id', async (req, res) => {
  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: { party: true, treasury: true, journalEntry: true },
    })
    if (!receipt) return res.status(404).json({ error: 'السند غير موجود' })
    return res.json(receipt)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء سند قبض/صرف
router.post('/receipts', authorize('admin', 'manager', 'accountant', 'cashier'), async (req, res) => {
  try {
    const {
      receiptDate,
      receiptType,
      partyId,
      treasuryId,
      currency = 'LYD',
      exchangeRate,
      amount,
      paymentMethod,
      checkNumber,
      bankName,
      referenceNo,
      saleInvoiceId,
      purchaseInvoiceId,
      notes,
    } = req.body

    if (!treasuryId) return res.status(400).json({ error: 'الخزينة مطلوبة' })
    if (!amount || amount <= 0) return res.status(400).json({ error: 'المبلغ غير صالح' })
    if (!receiptType || !['receipt', 'payment'].includes(receiptType)) {
      return res.status(400).json({ error: 'نوع السند غير صالح' })
    }

    // تحقق ملكية الفرع: الخزينة يجب أن تتبع فرع المستخدم
    const treasury = await prisma.treasury.findUnique({ where: { id: Number(treasuryId) } })
    if (!treasury) return res.status(400).json({ error: 'الخزينة غير موجودة' })
    if (req.branchId && treasury.branchId !== req.branchId) {
      return res.status(403).json({ error: 'الخزينة لا تتبع فرع المستخدم' })
    }

    let rate = exchangeRate
    if (!rate) {
      const lastRate = await prisma.exchangeRate.findFirst({
        where: { companyId: req.companyId!, fromCurrency: currency, toCurrency: 'LYD' },
        orderBy: { rateDate: 'desc' },
      })
      rate = lastRate?.rate.toNumber() || 1
    }

    const receipt = await treasuryService.createReceipt({
      companyId: req.companyId!,
      receiptDate: new Date(receiptDate || Date.now()),
      receiptType,
      partyId,
      treasuryId,
      branchId: treasury.branchId ?? req.branchId ?? undefined,
      currency,
      exchangeRate: rate,
      amount,
      paymentMethod,
      checkNumber,
      bankName,
      referenceNo,
      saleInvoiceId,
      purchaseInvoiceId,
      notes,
      createdBy: req.user!.id,
    })

    return res.status(201).json(receipt)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// حركات خزينة بنكية لفترة (لشاشة التسوية البنكية)
router.get('/reconciliations/:treasuryId/transactions', async (req, res) => {
  try {
    const { from, to } = req.query
    const data = await reconciliationService.getBankTransactions(
      req.companyId!,
      Number(req.params.treasuryId),
      from ? new Date(String(from)) : undefined,
      to ? new Date(String(to)) : undefined
    )
    return res.json(data)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// قائمة التسويات البنكية
router.get('/reconciliations', async (req, res) => {
  try {
    const branchScope = resolveBranchScope(req)
    const reconciliations = await reconciliationService.list(req.companyId!, branchScope)
    return res.json(reconciliations)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تفاصيل تسوية بنكية
router.get('/reconciliations/:id', async (req, res) => {
  try {
    const reconciliation = await reconciliationService.get(req.companyId!, Number(req.params.id))
    return res.json(reconciliation)
  } catch (error: any) {
    return res.status(404).json({ error: error.message })
  }
})

// إنشاء تسوية بنكية
router.post('/reconciliations', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const { treasuryId, from, statementDate, openingBalance, statementBalance, matchedReceiptIds, notes } = req.body
    if (!treasuryId) return res.status(400).json({ error: 'الخزينة البنكية مطلوبة' })
    if (statementBalance === undefined || statementBalance === null) {
      return res.status(400).json({ error: 'رصيد كشف البنك مطلوب' })
    }

    // تحقق ملكية الفرع للخزينة
    const treasury = await prisma.treasury.findUnique({ where: { id: Number(treasuryId) } })
    if (!treasury) return res.status(400).json({ error: 'الخزينة غير موجودة' })
    if (req.branchId && treasury.branchId !== req.branchId) {
      return res.status(403).json({ error: 'الخزينة لا تتبع فرع المستخدم' })
    }

    const reconciliation = await reconciliationService.createReconciliation({
      companyId: req.companyId!,
      treasuryId: Number(treasuryId),
      branchId: treasury.branchId ?? req.branchId ?? undefined,
      from: new Date(from || Date.now()),
      statementDate: new Date(statementDate || Date.now()),
      openingBalance: Number(openingBalance || 0),
      statementBalance: Number(statementBalance),
      matchedReceiptIds: Array.isArray(matchedReceiptIds) ? matchedReceiptIds.map(Number) : [],
      notes,
      createdBy: req.user!.id,
    })
    return res.status(201).json(reconciliation)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// تأكيد إغلاق تسوية بنكية
router.post('/reconciliations/:id/complete', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const reconciliation = await reconciliationService.complete(req.companyId!, Number(req.params.id))
    return res.json(reconciliation)
  } catch (error: any) {
    return res.status(404).json({ error: error.message })
  }
})

export default router
