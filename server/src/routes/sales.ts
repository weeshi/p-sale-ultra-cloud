import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize, resolveBranchScope } from '../middleware/auth'
import { saleService } from '../services/saleService'

const router = Router()
router.use(authenticate)

// فواتير المبيعات
router.get('/', async (req, res) => {
  try {
    const { from, to, partyId, status, page = 1, limit = 50 } = req.query
    const where: any = { companyId: req.companyId }

    if (from || to) {
      where.invoiceDate = {}
      if (from) where.invoiceDate.gte = new Date(String(from))
      if (to) where.invoiceDate.lte = new Date(String(to))
    }
    const branchId = resolveBranchScope(req)
    if (branchId) where.warehouse = { branchId }
    if (partyId) where.partyId = Number(partyId)
    if (status) where.status = String(status)

    const [invoices, total] = await Promise.all([
      prisma.saleInvoice.findMany({
        where,
        include: { party: true, branch: true, warehouse: true, items: { include: { item: true } } },
        orderBy: { invoiceDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.saleInvoice.count({ where }),
    ])

    return res.json({ invoices, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// فاتورة واحدة
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.saleInvoice.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        party: true,
        branch: true,
        warehouse: true,
        treasury: true,
        items: { include: { item: { include: { brand: true, unit: true } }, serials: true } },
        journalEntry: { include: { lines: { include: { account: true } } } },
      },
    })
    if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' })
    return res.json(invoice)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء فاتورة بيع
router.post('/', authorize('admin', 'manager', 'accountant', 'cashier'), async (req, res) => {
  try {
    const {
      warehouseId,
      treasuryId,
      payType,
      bankingService,
      invoiceDate,
      partyId,
      invoiceType,
      taxRate,
      discount,
      paidAmount,
      notes,
      items,
    } = req.body

    if (!warehouseId) return res.status(400).json({ error: 'المخزن مطلوب' })
    if (!items || items.length === 0) return res.status(400).json({ error: 'لا توجد أصناف' })

    const invoice = await saleService.createSaleInvoice({
      companyId: req.companyId!,
      branchId: req.branchId || undefined,
      warehouseId,
      treasuryId,
      payType,
      bankingService,
      invoiceDate: new Date(invoiceDate || Date.now()),
      partyId,
      invoiceType,
      taxRate: taxRate || 0,
      discount: discount || 0,
      paidAmount,
      notes,
      createdBy: req.user!.id,
      items,
    })

    return res.status(201).json(invoice)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// إلغاء فاتورة
router.post('/:id/void', authorize('admin', 'manager'), async (req, res) => {
  try {
    const invoice = await prisma.saleInvoice.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: { journalEntry: true },
    })
    if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' })

    // عكس القيد المحاسبي
    if (invoice.journalEntryId && !invoice.journalEntry?.isReversed) {
      await prisma.journalEntry.update({
        where: { id: invoice.journalEntryId },
        data: { isReversed: true },
      })
    }

    await prisma.saleInvoice.update({
      where: { id: invoice.id },
      data: { status: 'void' },
    })

    return res.json({ success: true })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// عروض الأسعار
router.get('/quotes/list', async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { companyId: req.companyId },
      include: { party: true, items: { include: { item: true } } },
      orderBy: { quoteDate: 'desc' },
    })
    return res.json(quotes)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء عرض سعر
router.post('/quotes', async (req, res) => {
  try {
    const { quoteDate, partyId, validUntil, notes, items } = req.body
    if (!items || items.length === 0) return res.status(400).json({ error: 'لا توجد أصناف' })

    const quote = await saleService.createQuote({
      companyId: req.companyId!,
      quoteDate: new Date(quoteDate || Date.now()),
      partyId,
      branchId: req.branchId || undefined,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      notes,
      createdBy: req.user!.id,
      items,
    })

    return res.status(201).json(quote)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// تحويل عرض إلى فاتورة
router.post('/quotes/:id/convert', async (req, res) => {
  try {
    const { warehouseId, treasuryId } = req.body
    if (!warehouseId) return res.status(400).json({ error: 'المخزن مطلوب' })

    const invoice = await saleService.convertQuoteToInvoice(
      Number(req.params.id),
      warehouseId,
      treasuryId,
      req.user!.id
    )
    return res.status(201).json(invoice)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

export default router
