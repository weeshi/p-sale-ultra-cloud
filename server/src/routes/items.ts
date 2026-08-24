import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize } from '../middleware/auth'
import { barcodeService } from '../services/barcodeService'
import { sequenceService } from '../services/sequenceService'
import { inventoryService } from '../services/inventoryService'
import { generateNumber } from '../../../shared/utils'

const router = Router()
router.use(authenticate)

// قائمة الأصناف مع الفلترة المتقدمة
router.get('/', async (req, res) => {
  try {
    const {
      search,
      categoryId,
      brandId,
      minStock,
      page = 1,
      limit = 50,
      attributes,
    } = req.query

    const where: any = { companyId: req.companyId }

    if (search) {
      where.OR = [
        { itemName: { contains: String(search) } },
        { itemCode: { contains: String(search) } },
        { barcode: { contains: String(search) } },
        { modelNumber: { contains: String(search) } },
      ]
    }
    if (categoryId) where.categoryId = Number(categoryId)
    if (brandId) where.brandId = Number(brandId)

    // فلترة الخصائص: attributes=[{attributeId,value}]

    // فلترة الخصائص: attributes=[{attributeId,value}]
    if (attributes) {
      const attrFilters = JSON.parse(String(attributes))
      if (Array.isArray(attrFilters) && attrFilters.length > 0) {
        where.AND = attrFilters.map((f) => ({
          attributes: {
            some: {
              attributeId: Number(f.attributeId),
              value: String(f.value),
            },
          },
        }))
      }
    }

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        include: {
          category: true,
          brand: true,
          unit: true,
          attributes: { include: { attribute: true } },
          stock: { include: { warehouse: true } },
        },
        orderBy: { itemName: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.item.count({ where }),
    ])

    // فلترة الأصناف منخفضة المخزون — بالكمية الصالحة (تستثني التالف)
    let resultItems = items
    if (minStock === 'true') {
      resultItems = items.filter(
        (i) => i.currentStock.toNumber() - i.damagedStock.toNumber() <= i.minStock.toNumber()
      )
    }

    return res.json({ items: resultItems, total: resultItems.length, page: Number(page), limit: Number(limit) })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// صنف واحد
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.item.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        category: true,
        brand: true,
        unit: true,
        attributes: { include: { attribute: true } },
        bundleParts: { include: { childItem: true } },
        serials: true,
        stock: { include: { warehouse: true } },
      },
    })
    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' })
    return res.json(item)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// البحث بالباركود
router.get('/search/barcode/:barcode', async (req, res) => {
  try {
    const item = await barcodeService.findByBarcode(req.params.barcode, req.companyId!)
    if (!item) return res.status(404).json({ error: 'لا يوجد صنف بهذا الباركود' })
    return res.json(item)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء صنف
router.post('/', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const {
      barcode,
      itemName,
      modelNumber,
      categoryId,
      brandId,
      unitId,
      description,
      image,
      purchasePrice,
      purchasePriceUsd,
      salePrice,
      wholesalePrice,
      openingStock,
      minStock,
      reorderLevel,
      location,
      trackSerial,
      isBundle,
      isService,
      taxRate,
      attributes,
      bundleParts,
      inventoryAccountId,
      cogsAccountId,
      salesAccountId,
      purchaseAccountId,
    } = req.body

    if (!itemName) {
      return res.status(400).json({ error: 'اسم الصنف مطلوب' })
    }

    // توليد كود الصنف تلقائياً عبر SequenceService
    const nextSeq = await sequenceService.next(req.companyId!, 'ITM')
    const autoItemCode = generateNumber('ITM', nextSeq)

    const item = await prisma.item.create({
      data: {
        companyId: req.companyId!,
        itemCode: autoItemCode,
        barcode,
        itemName,
        modelNumber,
        categoryId,
        brandId,
        unitId,
        description,
        image,
        purchasePrice: purchasePrice || 0,
        purchasePriceUsd: purchasePriceUsd || 0,
        salePrice: salePrice || 0,
        wholesalePrice: wholesalePrice || 0,
        openingStock: openingStock || 0,
        currentStock: openingStock || 0,
        minStock: minStock || 0,
        reorderLevel: reorderLevel || 0,
        location,
        trackSerial: trackSerial || false,
        isBundle: isBundle || false,
        isService: isService || false,
        taxRate: taxRate || 0,
        inventoryAccountId,
        cogsAccountId,
        salesAccountId,
        purchaseAccountId,
        attributes: attributes?.length
          ? { create: attributes.map((a: any) => ({ attributeId: Number(a.attributeId), value: String(a.value) })) }
          : undefined,
        bundleParts: bundleParts?.length
          ? { create: bundleParts.map((b: any) => ({ childItemId: Number(b.itemId), quantity: b.quantity || 1 })) }
          : undefined,
      },
      include: {
        attributes: { include: { attribute: true } },
        bundleParts: { include: { childItem: true } },
      },
    })

    // تسجيل رصيد افتتاحي
    if (openingStock > 0) {
      await prisma.stock.create({
        data: {
          companyId: req.companyId!,
          itemId: item.id,
          warehouseId: (await prisma.warehouse.findFirst({
            where: { companyId: req.companyId!, type: 'central' },
          }))?.id || 0,
          quantity: openingStock,
        },
      })
    }

    return res.status(201).json(item)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تسجيل كمية تالفة: تحويل وحدات صالحة إلى تالفة دون تغيير الإجمالي
router.post('/:id/damaged', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const { warehouseId, quantity, notes } = req.body
    if (!warehouseId) return res.status(400).json({ error: 'المخزن مطلوب' })
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'الكمية يجب أن تكون أكبر من صفر' })
    }

    const item = await inventoryService.registerDamaged({
      companyId: req.companyId!,
      itemId: Number(req.params.id),
      warehouseId: Number(warehouseId),
      quantity: Number(quantity),
      notes,
      createdBy: req.user?.id,
    })

    return res.json(item)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// عكس التالف: نقل وحدات من التالف إلى الصالح + إعادة حساب التكلفة
router.post('/:id/damaged-reverse', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const { warehouseId, quantity, notes } = req.body
    if (!warehouseId) return res.status(400).json({ error: 'المخزن مطلوب' })
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'الكمية يجب أن تكون أكبر من صفر' })
    }

    const item = await inventoryService.reverseDamaged({
      companyId: req.companyId!,
      itemId: Number(req.params.id),
      warehouseId: Number(warehouseId),
      quantity: Number(quantity),
      notes,
      createdBy: req.user?.id,
    })

    return res.json(item)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// تعديل صنف
router.put('/:id', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const { attributes, bundleParts, ...data } = req.body
    delete data.companyId
    delete data.createdAt
    delete data.updatedAt
    delete data.itemCode // الكود تلقائي ولا يُعدّل يدوياً

    const existing = await prisma.item.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
    })
    if (!existing) return res.status(404).json({ error: 'الصنف غير موجود' })

    const item = await prisma.$transaction(async (tx) => {
      // تحديث الخصائص
      if (attributes) {
        await tx.itemAttribute.deleteMany({ where: { itemId: existing.id } })
        if (attributes.length > 0) {
          await tx.itemAttribute.createMany({
            data: attributes.map((a: any) => ({
              itemId: existing.id,
              attributeId: Number(a.attributeId),
              value: String(a.value),
            })),
          })
        }
      }

      // تحديث مكونات الباقة
      if (bundleParts) {
        await tx.bundlePart.deleteMany({ where: { parentItemId: existing.id } })
        if (bundleParts.length > 0) {
          await tx.bundlePart.createMany({
            data: bundleParts.map((b: any) => ({
              parentItemId: existing.id,
              childItemId: Number(b.itemId),
              quantity: b.quantity || 1,
            })),
          })
        }
      }

      return tx.item.update({
        where: { id: existing.id },
        data,
        include: {
          attributes: { include: { attribute: true } },
          bundleParts: { include: { childItem: true } },
        },
      })
    })

    return res.json(item)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// حذف صنف
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const existing = await prisma.item.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
    })
    if (!existing) return res.status(404).json({ error: 'الصنف غير موجود' })

    await prisma.item.update({
      where: { id: existing.id },
      data: { isActive: false },
    })

    return res.json({ success: true })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// توليد باركود
router.post('/:id/generate-barcode', async (req, res) => {
  try {
    const result = await barcodeService.generateBarcode(Number(req.params.id), req.companyId!)
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// توليد QR
router.get('/:id/qrcode', async (req, res) => {
  try {
    const result = await barcodeService.generateQRCode(Number(req.params.id), req.companyId!)
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// حركة مخزون صنف
router.get('/:id/movements', async (req, res) => {
  try {
    const { from, to, limit = 100 } = req.query
    const where: any = {
      itemId: Number(req.params.id),
      companyId: req.companyId,
    }
    if (from || to) {
      where.movementDate = {}
      if (from) where.movementDate.gte = new Date(String(from))
      if (to) where.movementDate.lte = new Date(String(to))
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      include: { warehouse: true },
      orderBy: { movementDate: 'desc' },
      take: Number(limit),
    })
    return res.json(movements)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
