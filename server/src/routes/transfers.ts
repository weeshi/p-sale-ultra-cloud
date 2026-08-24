import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize, resolveBranchScope } from '../middleware/auth'
import { transferService } from '../services/transferService'
import { notifyTransfer } from '../realtime'

const router = Router()
router.use(authenticate)

// طلبات واردة (للفرع المستلم)
router.get('/incoming', async (req, res) => {
  try {
    const branchId = req.user?.isSuperAdmin ? (req.query.branchId ? Number(req.query.branchId) : undefined) : req.branchId
    const where: any = {
      companyId: req.companyId,
      transferType: 'branch_request',
      status: { in: ['requested', 'in_transit'] },
    }
    if (branchId) {
      where.toWarehouse = { branchId }
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        fromWarehouse: { include: { branch: true } },
        toWarehouse: { include: { branch: true } },
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.json({ transfers, total: transfers.length })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// طلبات صادرة (من الفرع المرسل)
router.get('/outgoing', async (req, res) => {
  try {
    const branchId = req.user?.isSuperAdmin ? (req.query.branchId ? Number(req.query.branchId) : undefined) : req.branchId
    const where: any = {
      companyId: req.companyId,
      transferType: 'branch_request',
      status: { in: ['requested', 'in_transit', 'received', 'rejected'] },
    }
    if (branchId) {
      where.fromWarehouse = { branchId }
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        fromWarehouse: { include: { branch: true } },
        toWarehouse: { include: { branch: true } },
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.json({ transfers, total: transfers.length })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// مراجعة طلب داخلي (المصدر يعدل الكميات ويعتمد)
router.post('/:id/review', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { items, notes } = req.body
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'بنود المراجعة مطلوبة' })
    }

    const transfer = await transferService.reviewTransfer(
      Number(req.params.id),
      req.user!.id,
      items.map((i: any) => ({
        transferItemId: Number(i.transferItemId),
        approvedQty: Number(i.approvedQty),
        notes: i.notes,
      })),
      notes
    )

    void notifyTransfer(transfer, 'approved')
    return res.json(transfer)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// قائمة التحويلات
router.get('/', async (req, res) => {
  try {
    const { status, fromWarehouseId, toWarehouseId, page = 1, limit = 50 } = req.query
    const where: any = { companyId: req.companyId }
    if (status) where.status = String(status)
    if (fromWarehouseId) where.fromWarehouseId = Number(fromWarehouseId)
    if (toWarehouseId) where.toWarehouseId = Number(toWarehouseId)

    const [transfers, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        include: { fromWarehouse: true, toWarehouse: true, items: { include: { item: true } } },
        orderBy: { transferDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.stockTransfer.count({ where }),
    ])

    return res.json({ transfers, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تحويل واحد
router.get('/:id', async (req, res) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: { include: { item: { include: { brand: true, unit: true } } } },
      },
    })
    if (!transfer) return res.status(404).json({ error: 'التحويل غير موجود' })
    return res.json(transfer)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء تحويل
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { transferDate, fromWarehouseId, toWarehouseId, transferType, notes, items } = req.body

    if (!fromWarehouseId || !toWarehouseId) {
      return res.status(400).json({ error: 'المخزن المصدر والهدف مطلوبان' })
    }

    const transfer = await transferService.createTransfer({
      companyId: req.companyId!,
      transferDate: new Date(transferDate || Date.now()),
      fromWarehouseId,
      toWarehouseId,
      transferType: transferType || 'transfer',
      notes,
      createdBy: req.user!.id,
      items,
    })

    void notifyTransfer(transfer, 'created')

    return res.status(201).json(transfer)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// اعتماد تحويل
router.post('/:id/approve', authorize('admin', 'manager'), async (req, res) => {
  try {
    const transfer = await transferService.approveTransfer(Number(req.params.id), req.user!.id)
    void notifyTransfer(transfer, 'approved')
    return res.json(transfer)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// إلغاء/رفض تحويل
router.post('/:id/cancel', authorize('admin', 'manager'), async (req, res) => {
  try {
    const status = req.body?.status === 'rejected' ? 'rejected' : 'cancelled'
    const transfer = await transferService.cancelTransfer(Number(req.params.id), req.user!.id, status)
    void notifyTransfer(transfer, status)
    return res.json(transfer)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// استلام تحويل
router.post('/:id/receive', authorize('admin', 'manager'), async (req, res) => {
  try {
    const transfer = await transferService.receiveTransfer(Number(req.params.id), {
      companyId: req.companyId!,
      receivedBy: req.user!.id,
      receivedAt: req.body?.receivedAt ? new Date(req.body.receivedAt) : undefined,
      items: req.body?.items,
    })
    void notifyTransfer(transfer, 'received')
    return res.json(transfer)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

export default router
