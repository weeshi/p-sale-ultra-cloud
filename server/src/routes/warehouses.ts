import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize, resolveBranchScope } from '../middleware/auth'

const router = Router()
router.use(authenticate)

// الفروع
router.get('/branches', async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { companyId: req.companyId, isActive: true },
      include: { warehouses: true },
      orderBy: { name: 'asc' },
    })
    return res.json(branches)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء فرع
router.post('/branches', authorize('admin'), async (req, res) => {
  try {
    const { name, code, address, phone, isMain } = req.body
    if (!name || !code) return res.status(400).json({ error: 'اسم الفرع وكوده مطلوبان' })

    const branch = await prisma.branch.create({
      data: {
        companyId: req.companyId!,
        name,
        code,
        address,
        phone,
        isMain: isMain || false,
      },
    })
    return res.status(201).json(branch)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تعديل فرع
router.put('/branches/:id', authorize('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, code, address, phone, isMain } = req.body
    if (!name || !code) return res.status(400).json({ error: 'اسم الفرع وكوده مطلوبان' })

    const existing = await prisma.branch.findFirst({ where: { id, companyId: req.companyId } })
    if (!existing) return res.status(404).json({ error: 'الفرع غير موجود' })

    const dup = await prisma.branch.findFirst({ where: { companyId: req.companyId, code, id: { not: id } } })
    if (dup) return res.status(409).json({ error: 'كود الفرع مكرر' })

    const branch = await prisma.branch.update({
      where: { id },
      data: { name, code, address, phone, isMain: isMain ?? existing.isMain },
    })
    return res.json(branch)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// حذف فرع (حذف فعلي بقيود: يُمنع إن وُجد مستخدمون أو فواتير مرتبطة، ويُفك ربط المخازن أولاً)
router.delete('/branches/:id', authorize('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.branch.findFirst({ where: { id, companyId: req.companyId } })
    if (!existing) return res.status(404).json({ error: 'الفرع غير موجود' })

    const [users, invoices] = await Promise.all([
      prisma.user.count({ where: { branchId: id } }),
      prisma.saleInvoice.count({ where: { branchId: id } }),
    ])
    if (users > 0 || invoices > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف الفرع — يوجد مستخدمون أو فواتير مرتبطة به' })
    }

    await prisma.$transaction([
      prisma.warehouse.updateMany({ where: { branchId: id }, data: { branchId: null } }),
      prisma.branch.delete({ where: { id } }),
    ])
    return res.json({ deleted: true })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// المخازن (فلتر اختياري حسب الفرع ?branchId= — يُجبر على الفرع للمستخدم المربوط)
router.get('/', async (req, res) => {
  try {
    const branchId = resolveBranchScope(req)
    const warehouses = await prisma.warehouse.findMany({
      where: {
        companyId: req.companyId,
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      include: { branch: true },
      orderBy: { name: 'asc' },
    })
    return res.json(warehouses)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// مخزن واحد
router.get('/:id', async (req, res) => {
  try {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: { branch: true },
    })
    if (!warehouse) return res.status(404).json({ error: 'المخزن غير موجود' })
    return res.json(warehouse)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء مخزن
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, code, branchId, type = 'regular', address } = req.body
    if (!name || !code) return res.status(400).json({ error: 'اسم المخزن وكوده مطلوبان' })

    // التحقق من أن الفرع ينتمي لنفس الشركة (منع ربط مخزن بفرع شركة أخرى)
    if (branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: Number(branchId), companyId: req.companyId },
      })
      if (!branch) return res.status(400).json({ error: 'الفرع غير موجود في هذه الشركة' })
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: req.companyId!,
        name,
        code,
        branchId,
        type,
        address,
      },
    })
    return res.status(201).json(warehouse)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تعديل مخزن (يسمح بإعادة ربط المخزن بفرع آخر أو فك الربط)
router.put('/:id', authorize('admin', 'manager'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, code, branchId, type = 'regular', address } = req.body
    if (!name || !code) return res.status(400).json({ error: 'اسم المخزن وكوده مطلوبان' })

    const existing = await prisma.warehouse.findFirst({ where: { id, companyId: req.companyId } })
    if (!existing) return res.status(404).json({ error: 'المخزن غير موجود' })

    // التحقق من أن الفرع ينتمي لنفس الشركة (منع ربط مخزن بفرع شركة أخرى)
    if (branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: Number(branchId), companyId: req.companyId },
      })
      if (!branch) return res.status(400).json({ error: 'الفرع غير موجود في هذه الشركة' })
    }

    const dup = await prisma.warehouse.findFirst({ where: { companyId: req.companyId, code, id: { not: id } } })
    if (dup) return res.status(409).json({ error: 'كود المخزن مكرر' })

    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: { name, code, branchId: branchId ?? null, type, address },
    })
    return res.json(warehouse)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// حذف مخزن (حذف فعلي: يُمنع إن وُجدت حركات/فواتير/مخزون/سيريالات/تحويلات/جرد مرتبطة)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.warehouse.findFirst({ where: { id, companyId: req.companyId } })
    if (!existing) return res.status(404).json({ error: 'المخزن غير موجود' })

    const [
      stockCount,
      serialsCount,
      movementsCount,
      outCount,
      inCount,
      countsCount,
      purchaseInvoicesCount,
      saleInvoicesCount,
    ] = await Promise.all([
      prisma.stock.count({ where: { warehouseId: id } }),
      prisma.serial.count({ where: { warehouseId: id } }),
      prisma.stockMovement.count({ where: { warehouseId: id } }),
      prisma.stockTransfer.count({ where: { fromWarehouseId: id } }),
      prisma.stockTransfer.count({ where: { toWarehouseId: id } }),
      prisma.inventoryCount.count({ where: { warehouseId: id } }),
      prisma.purchaseInvoice.count({ where: { warehouseId: id } }),
      prisma.saleInvoice.count({ where: { warehouseId: id } }),
    ])

    const blocked =
      stockCount + serialsCount + movementsCount + outCount + inCount + countsCount + purchaseInvoicesCount + saleInvoicesCount
    if (blocked > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف المخزن — توجد حركات أو فواتير أو مخزون مرتبط به' })
    }

    await prisma.warehouse.delete({ where: { id } })
    return res.json({ deleted: true })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// مخزون مخزن معين
router.get('/:id/stock', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query
    const where: any = {
      warehouseId: Number(req.params.id),
    }
    if (search) {
      where.item = {
        OR: [
          { itemName: { contains: String(search) } },
          { itemCode: { contains: String(search) } },
          { barcode: { contains: String(search) } },
        ],
      }
    }

    const [stock, total] = await Promise.all([
      prisma.stock.findMany({
        where,
        include: { item: { include: { brand: true, unit: true } } },
        orderBy: { item: { itemName: 'asc' } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.stock.count({ where }),
    ])

    return res.json({ stock, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
