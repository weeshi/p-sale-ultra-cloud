import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize, resolveBranchScope } from '../middleware/auth'
import { purchaseService } from '../services/purchaseService'

const router = Router()
router.use(authenticate)

// ============ سجل المشتريات الموحد (Triple-Track) ============
// محلي + استيراد + تحويلات داخلية في قائمة واحدة مع فلترة
router.get('/', async (req, res) => {
  try {
    const {
      type = 'all',
      page = 1,
      limit = 200,
      from,
      to,
      partyId,
      warehouseId,
      status,
    } = req.query
    const companyId = req.companyId
    const branchId = resolveBranchScope(req)
    const types = type === 'all' ? ['local', 'import', 'internal'] : [String(type)]

    const dateWhere: any = {}
    if (from) dateWhere.gte = new Date(String(from))
    if (to) dateWhere.lte = new Date(String(to))

    const unified: any[] = []

    // 1) محلي — فواتير الشراء
    if (types.includes('local')) {
      const where: any = { companyId }
      if (from || to) where.invoiceDate = dateWhere
      if (partyId) where.partyId = Number(partyId)
      if (warehouseId) where.warehouseId = Number(warehouseId)
      if (branchId) where.branchId = Number(branchId)
      if (status) where.paymentStatus = String(status)

      const invoices = await prisma.purchaseInvoice.findMany({
        where,
        include: { party: true, warehouse: true },
        orderBy: { invoiceDate: 'desc' },
      })
      for (const inv of invoices) {
        unified.push({
          key: `local-${inv.id}`,
          type: 'local',
          number: inv.invoiceNumber,
          date: inv.invoiceDate,
          partyId: inv.partyId,
          partyName: inv.party?.partyName ?? '—',
          direction: '',
          warehouseId: inv.warehouseId ?? null,
          warehouseName: inv.warehouse?.name ?? '—',
          total: Number(inv.total),
          totalUsd: Number(inv.subtotal),
          currency: inv.currency,
          status: inv.paymentStatus,
          notes: inv.notes,
          raw: inv,
        })
      }
    }

    // 2) استيراد — أوامر الشراء (خارجي)
    if (types.includes('import')) {
      const where: any = { companyId }
      if (from || to) where.poDate = dateWhere
      if (partyId) where.partyId = Number(partyId)
      if (warehouseId) where.targetWarehouseId = Number(warehouseId)
      if (branchId) where.branchId = Number(branchId)
      if (status) where.status = String(status)

      const orders = await prisma.purchaseOrder.findMany({
        where,
        include: { party: true },
        orderBy: { poDate: 'desc' },
      })
      for (const po of orders) {
        unified.push({
          key: `import-${po.id}`,
          type: 'import',
          number: po.poNumber,
          date: po.poDate,
          partyId: po.partyId,
          partyName: po.party?.partyName ?? '—',
          direction: '',
          warehouseId: po.targetWarehouseId ?? null,
          warehouseName: '',
          total: Number(po.totalAmountUsd),
          totalUsd: Number(po.totalAmountUsd),
          currency: 'USD',
          status: po.status,
          notes: po.notes,
          raw: po,
        })
      }
    }

    // 3) داخلي — التحويلات بين المخازن
    if (types.includes('internal')) {
      const where: any = { companyId }
      if (from || to) where.transferDate = dateWhere
      if (warehouseId && branchId) {
        const wid = Number(warehouseId)
        const br = Number(branchId)
        where.OR = [
          { fromWarehouseId: wid, fromWarehouse: { branchId: br } },
          { toWarehouseId: wid, toWarehouse: { branchId: br } },
        ]
      } else if (warehouseId) {
        where.OR = [{ fromWarehouseId: Number(warehouseId) }, { toWarehouseId: Number(warehouseId) }]
      } else if (branchId) {
        const br = Number(branchId)
        where.OR = [
          { fromWarehouse: { branchId: br } },
          { toWarehouse: { branchId: br } },
        ]
      }
      if (status) where.status = String(status)

      const transfers = await prisma.stockTransfer.findMany({
        where,
        include: { fromWarehouse: true, toWarehouse: true, items: true },
        orderBy: { transferDate: 'desc' },
      })
      for (const tr of transfers) {
        const total = tr.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0)
        unified.push({
          key: `internal-${tr.id}`,
          type: 'internal',
          number: tr.transferNumber,
          date: tr.transferDate,
          partyId: null,
          partyName: '',
          direction: `${tr.fromWarehouse?.name ?? '—'} ← ${tr.toWarehouse?.name ?? '—'}`,
          warehouseId: tr.fromWarehouseId,
          warehouseName: tr.fromWarehouse?.name ?? '—',
          total,
          totalUsd: 0,
          currency: 'LYD',
          status: tr.status,
          notes: tr.notes,
          raw: tr,
        })
      }
    }

    unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const total = unified.length
    const start = (Number(page) - 1) * Number(limit)
    const purchases = unified.slice(start, start + Number(limit))

    return res.json({ purchases, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// فاتورة شراء واحدة
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        party: true,
        warehouse: true,
        treasury: true,
        items: { include: { item: true, serials: true } },
        journalEntry: { include: { lines: { include: { account: true } } } },
      },
    })
    if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' })
    return res.json(invoice)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// شراء محلي مباشر
router.post('/', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const {
      partyId,
      warehouseId,
      treasuryId,
      payType,
      bankingService,
      invoiceDate,
      currency = 'USD',
      exchangeRate,
      shippingCost,
      customsCost,
      discount,
      paidAmount,
      notes,
      items,
    } = req.body

    if (!partyId || !warehouseId) return res.status(400).json({ error: 'المورد والمخزن مطلوبان' })
    if (!items || items.length === 0) return res.status(400).json({ error: 'لا توجد أصناف' })

    // الحصول على سعر الصرف الافتراضي
    let rate = exchangeRate
    if (!rate) {
      const lastRate = await prisma.exchangeRate.findFirst({
        where: {
          companyId: req.companyId!,
          fromCurrency: currency,
          toCurrency: 'LYD',
        },
        orderBy: { rateDate: 'desc' },
      })
      rate = lastRate?.rate.toNumber() || 8.5
    }

    const invoice = await purchaseService.createDirectPurchase({
      companyId: req.companyId!,
      branchId: req.branchId ?? undefined,
      partyId,
      warehouseId,
      treasuryId,
      payType,
      bankingService,
      invoiceDate: new Date(invoiceDate || Date.now()),
      currency,
      exchangeRate: rate,
      shippingCost,
      customsCost,
      discount,
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

// ============ أوامر الاستيراد (خارجي) ============

// أمر استيراد واحد
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: { party: true, items: { include: { item: true } }, shipments: true },
    })
    if (!order) return res.status(404).json({ error: 'أمر الشراء غير موجود' })
    return res.json(order)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء أمر استيراد
router.post('/orders', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const {
      poDate,
      partyId,
      currency = 'USD',
      exchangeRate,
      shippingCost,
      customsCost,
      insuranceCost,
      otherCosts,
      discount,
      lcNumber,
      lcBank,
      expectedArrival,
      targetWarehouseId,
      notes,
      items,
    } = req.body

    if (!partyId) return res.status(400).json({ error: 'المورد مطلوب' })
    if (!items || items.length === 0) return res.status(400).json({ error: 'لا توجد أصناف' })

    const order = await purchaseService.createPurchaseOrder({
      companyId: req.companyId!,
      branchId: req.branchId ?? undefined,
      poDate: new Date(poDate || Date.now()),
      partyId,
      currency,
      exchangeRate: exchangeRate || 8.5,
      shippingCost,
      customsCost,
      insuranceCost,
      otherCosts,
      discount,
      lcNumber,
      lcBank,
      expectedArrival: expectedArrival ? new Date(expectedArrival) : undefined,
      targetWarehouseId,
      notes,
      createdBy: req.user!.id,
      items,
    })

    return res.status(201).json(order)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// استلام أمر استيراد
router.post('/orders/:id/receive', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const {
      warehouseId,
      treasuryId,
      receiveDate,
      shippingCost,
      customsCost,
      insuranceCost,
      otherCosts,
      paidAmount,
      items,
    } = req.body

    if (!warehouseId) return res.status(400).json({ error: 'المخزن الهدف مطلوب' })

    const invoice = await purchaseService.receivePurchaseOrder(Number(req.params.id), {
      companyId: req.companyId!,
      warehouseId,
      treasuryId,
      receiveDate: new Date(receiveDate || Date.now()),
      shippingCost,
      customsCost,
      insuranceCost,
      otherCosts,
      paidAmount,
      createdBy: req.user!.id,
      items,
    })

    return res.status(201).json(invoice)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

export default router
