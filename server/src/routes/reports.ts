import { Router } from 'express'
import { authenticate, resolveBranchScope } from '../middleware/auth'
import { reportService } from '../services/reportService'
import { inventoryService } from '../services/inventoryService'

// نطاق الفرع الموحّد للتقارير (15.5): resolveBranchScope يتكفل بـ canViewAllBranches و branchId=all
function getEffectiveBranchId(req: any): number | undefined {
  return resolveBranchScope(req)
}

const router = Router()
router.use(authenticate)

// لوحة المعلومات
router.get('/dashboard', async (req, res) => {
  try {
    const result = await reportService.dashboard(req.companyId!, getEffectiveBranchId(req))
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تقرير المبيعات
router.get('/sales', async (req, res) => {
  try {
    const { from, to, partyId, itemId, userId } = req.query
    const result = await reportService.salesReport({
      companyId: req.companyId!,
      from: from ? new Date(String(from)) : undefined,
      to: to ? new Date(String(to)) : undefined,
      branchId: getEffectiveBranchId(req),
      partyId: partyId ? Number(partyId) : undefined,
      itemId: itemId ? Number(itemId) : undefined,
      userId: userId ? Number(userId) : undefined,
    })
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تقرير حركة الأصناف
router.get('/stock-movements', async (req, res) => {
  try {
    const { from, to, itemId, warehouseId, movementType } = req.query
    const result = await reportService.stockMovementReport({
      companyId: req.companyId!,
      from: from ? new Date(String(from)) : undefined,
      to: to ? new Date(String(to)) : undefined,
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      movementType: movementType ? String(movementType) : undefined,
      branchId: getEffectiveBranchId(req),
    })
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// الأصناف منخفضة المخزون
router.get('/low-stock', async (req, res) => {
  try {
    const { warehouseId } = req.query
    const result = await reportService.lowStockReport(
      req.companyId!,
      warehouseId ? Number(warehouseId) : undefined,
      getEffectiveBranchId(req)
    )
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تقرير العملاء/الموردين
router.get('/customers', async (req, res) => {
  try {
    const { type } = req.query
    const result = await reportService.customersReport(
      req.companyId!,
      (type as 'customer' | 'vendor') || 'customer'
    )
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تقرير الخزينة
router.get('/treasury', async (req, res) => {
  try {
    const { from, to, treasuryId } = req.query
    const result = await reportService.treasuryReport({
      companyId: req.companyId!,
      from: from ? new Date(String(from)) : undefined,
      to: to ? new Date(String(to)) : undefined,
      treasuryId: treasuryId ? Number(treasuryId) : undefined,
      branchId: getEffectiveBranchId(req),
    })
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تقرير الأرقام التسلسلية
router.get('/serials', async (req, res) => {
  try {
    const { status, itemId, warehouseId } = req.query
    const result = await reportService.serialsReport({
      companyId: req.companyId!,
      status: status as string | undefined,
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      branchId: getEffectiveBranchId(req),
    })
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تقرير الضمانات
router.get('/warranties', async (req, res) => {
  try {
    const { status } = req.query
    const result = await reportService.warrantyReport(
      req.companyId!,
      status as string | undefined,
      getEffectiveBranchId(req)
    )
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تقرير الأرباح
router.get('/profit', async (req, res) => {
  try {
    const { from, to } = req.query
    const result = await reportService.profitReport({
      companyId: req.companyId!,
      from: from ? new Date(String(from)) : undefined,
      to: to ? new Date(String(to)) : undefined,
      branchId: getEffectiveBranchId(req),
    })
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// قيمة المخزون
router.get('/stock-valuation', async (req, res) => {
  try {
    const { warehouseId } = req.query
    const result = await inventoryService.getStockValuation(
      req.companyId!,
      warehouseId ? Number(warehouseId) : undefined,
      getEffectiveBranchId(req)
    )
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router