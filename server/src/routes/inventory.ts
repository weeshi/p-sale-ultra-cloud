import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize, resolveBranchScope } from '../middleware/auth'
import { inventoryService } from '../services/inventoryService'

const router = Router()
router.use(authenticate)

// ============ الجرد ============

// قائمة الجرد
router.get('/counts', async (req, res) => {
  try {
    const { status, warehouseId } = req.query
    const where: any = { companyId: req.companyId }
    if (status) where.status = String(status)
    if (warehouseId) where.warehouseId = Number(warehouseId)
    const branchId = resolveBranchScope(req)
    if (branchId) where.warehouse = { branchId }

    const counts = await prisma.inventoryCount.findMany({
      where,
      include: {
        warehouse: true,
        creator: true,
        poster: true,
        parentCount: true,
        items: { include: { item: true } },
      },
      orderBy: { countDate: 'desc' },
    })

    return res.json(counts)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تفاصيل جرد (ببندانه)
router.get('/counts/:id', async (req, res) => {
  try {
    const count = await inventoryService.getCountById(req.companyId!, Number(req.params.id))
    return res.json(count)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// إنشاء جرد جديد
router.post('/counts', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { warehouseId, countDate, notes } = req.body
    if (!warehouseId) return res.status(400).json({ error: 'المخزن مطلوب' })

    const count = await inventoryService.createCount({
      companyId: req.companyId!,
      warehouseId: Number(warehouseId),
      countDate: new Date(countDate || Date.now()),
      notes,
      createdBy: req.user!.id,
    })

    return res.status(201).json(count)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// حذف جرد (draft فقط)
router.delete('/counts/:id', authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await inventoryService.deleteCount(req.companyId!, Number(req.params.id))
    return res.json(result)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// إدخال نتيجة جرد صنف (صالح + تالف)
router.post('/counts/:id/items', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { itemId, countedGoodQty, countedDamagedQty } = req.body
    if (!itemId || countedGoodQty == null || countedDamagedQty == null) {
      return res.status(400).json({ error: 'الصنف والكميتان المعدودتان (صالح وتالف) مطلوبان' })
    }

    const result = await inventoryService.processCountItem(
      Number(req.params.id),
      Number(itemId),
      Number(countedGoodQty),
      Number(countedDamagedQty)
    )

    return res.json(result)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// ترحيل الجرد
router.post('/counts/:id/post', authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await inventoryService.postCount(Number(req.params.id), req.user!.id)
    return res.json(result)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// جرد تصحيحي من جرد مرحّل (مع تحقق ملكية الفرع)
router.post('/counts/:id/corrective', authorize('admin', 'manager'), async (req, res) => {
  try {
    const effectiveBranch = req.user?.isSuperAdmin || req.branchId == null ? null : req.branchId
    const count = await inventoryService.createCorrectiveCount(
      req.companyId!,
      Number(req.params.id),
      req.user!.id,
      effectiveBranch
    )
    return res.status(201).json(count)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

export default router
