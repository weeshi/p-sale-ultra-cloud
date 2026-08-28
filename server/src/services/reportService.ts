import { prisma } from '../config/database'
import { MOVEMENT_TYPES } from '../../../shared/constants'

// خدمة التقارير: كل التقارير التشغيلية والإدارية
export class ReportService {
  /**
   * تقرير المبيعات حسب الفترة/الفرع/العميل/الصنف
   */
  async salesReport(params: {
    companyId: number
    from?: Date
    to?: Date
    branchId?: number
    partyId?: number
    itemId?: number
    userId?: number
  }) {
    const { companyId, from, to, branchId, partyId, itemId, userId } = params

    const where: any = {
      companyId,
      status: 'posted',
    }
    if (from) where.invoiceDate = { ...(where.invoiceDate || {}), gte: from }
    if (to) where.invoiceDate = { ...(where.invoiceDate || {}), lte: to }
    if (branchId) where.branchId = branchId
    if (partyId) where.partyId = partyId
    if (userId) where.createdBy = userId

    const invoices = await prisma.saleInvoice.findMany({
      where,
      include: {
        party: true,
        branch: true,
        items: itemId ? { where: { itemId } } : true,
      },
      orderBy: { invoiceDate: 'desc' },
    })

    const summary = invoices.reduce(
      (acc, inv) => {
        acc.count++
        acc.subtotal += inv.subtotal.toNumber()
        acc.tax += inv.taxAmount.toNumber()
        acc.discount += inv.discount.toNumber()
        acc.total += inv.total.toNumber()
        acc.paid += inv.paidAmount.toNumber()
        return acc
      },
      { count: 0, subtotal: 0, tax: 0, discount: 0, total: 0, paid: 0 }
    )

    return { invoices, summary }
  }

  /**
   * تقرير حركة الأصناف (الكميات)
   */
  async stockMovementReport(params: {
    companyId: number
    from?: Date
    to?: Date
    itemId?: number
    warehouseId?: number
    movementType?: string
    branchId?: number
  }) {
    const { companyId, from, to, itemId, warehouseId, movementType, branchId } = params

    const where: any = { companyId }
    if (from) where.movementDate = { ...(where.movementDate || {}), gte: from }
    if (to) where.movementDate = { ...(where.movementDate || {}), lte: to }
    if (itemId) where.itemId = itemId
    if (warehouseId) where.warehouseId = warehouseId
    if (movementType) where.movementType = movementType
    if (branchId) where.warehouse = { branchId }

    const movements = await prisma.stockMovement.findMany({
      where,
      include: { item: true, warehouse: true },
      orderBy: { movementDate: 'asc' },
    })

    const byItem = new Map<number, any>()
    for (const mv of movements) {
      const key = mv.itemId
      const current = byItem.get(key) || {
        itemId: mv.itemId,
        itemCode: mv.item.itemCode,
        itemName: mv.item.itemName,
        in: 0,
        out: 0,
        net: 0,
        damaged: 0,
      }
      const type = mv.movementType
      const qty = mv.quantity.toNumber()
      const absQty = Math.abs(qty)

      if (type === MOVEMENT_TYPES.DAMAGED || type === MOVEMENT_TYPES.RETURN_DAMAGED) {
        // التالف: خروج من الصالح بلا تغيير في الإجمالي — يُعزل في عمود التالف
        current.damaged += absQty
      } else if (type === MOVEMENT_TYPES.INVENTORY_ADJUSTMENT_DAMAGED) {
        // تعديل جرد التالف (موجب: تالف أكثر، سالب: تالف أقل)
        current.damaged += qty
      } else if (type === MOVEMENT_TYPES.DAMAGE_REVERSAL) {
        // عكس التالف: عودة وحدات إلى الصالح + تقليل التالف
        current.damaged -= absQty
        current.in += absQty
        current.net += absQty
      } else {
        if (qty > 0) current.in += qty
        else current.out += absQty
        current.net += qty
      }
      byItem.set(key, current)
    }

    return {
      movements,
      summary: Array.from(byItem.values()),
    }
  }

  /**
   * تقرير الأصناف تحت الحد الأدنى
   */
  async lowStockReport(companyId: number, warehouseId?: number, branchId?: number) {
    const stock = await prisma.stock.findMany({
      where: {
        companyId,
        ...(warehouseId ? { warehouseId } : {}),
        ...(branchId ? { warehouse: { branchId } } : {}),
      },
      include: {
        item: true,
        warehouse: true,
      },
    })

    const lowStock = stock
      .filter((s) => s.quantity.toNumber() - (s.damagedStock?.toNumber() ?? 0) <= s.item.minStock.toNumber())
      .map((s) => ({
        itemId: s.itemId,
        itemCode: s.item.itemCode,
        itemName: s.item.itemName,
        warehouse: s.warehouse.name,
        quantity: s.quantity.toNumber() - (s.damagedStock?.toNumber() ?? 0),
        minStock: s.item.minStock.toNumber(),
      }))
      .sort((a, b) => a.quantity - b.quantity)

    return lowStock
  }

  /**
   * تقرير العملاء (أرصدة، مديونيات)
   */
  async customersReport(companyId: number, type: 'customer' | 'vendor') {
    const parties = await prisma.party.findMany({
      where: { companyId, partyType: type, isActive: true },
      include: { account: true },
      orderBy: { partyName: 'asc' },
    })

    const summary = parties.reduce(
      (acc, p) => {
        if (p.currentBalance.toNumber() > 0) acc.debit += p.currentBalance.toNumber()
        else acc.credit += Math.abs(p.currentBalance.toNumber())
        return acc
      },
      { debit: 0, credit: 0 }
    )

    return { parties, summary }
  }

  /**
   * تقرير الخزينة: الحركات حسب الخزينة/الفترة
   */
  async treasuryReport(params: {
    companyId: number
    from?: Date
    to?: Date
    treasuryId?: number
    branchId?: number
  }) {
    const { companyId, from, to, treasuryId, branchId } = params

    const where: any = { companyId }
    if (from) where.receiptDate = { ...(where.receiptDate || {}), gte: from }
    if (to) where.receiptDate = { ...(where.receiptDate || {}), lte: to }
    if (treasuryId) where.treasuryId = treasuryId
    if (branchId) where.branchId = branchId

    const receipts = await prisma.receipt.findMany({
      where,
      include: { treasury: true, party: true },
      orderBy: { receiptDate: 'desc' },
    })

    const summary = receipts.reduce(
      (acc, r) => {
        const amount = r.amount.toNumber()
        if (r.receiptType === 'receipt') {
          acc.receipts += amount
          acc.balance += amount
        } else {
          acc.payments += amount
          acc.balance -= amount
        }
        return acc
      },
      { receipts: 0, payments: 0, balance: 0 }
    )

    return { receipts, summary }
  }

  /**
   * تقرير الأرقام التسلسلية: الحالة والضمان
   */
  async serialsReport(params: {
    companyId: number
    status?: string
    itemId?: number
    warehouseId?: number
    branchId?: number
  }) {
    const { companyId, status, itemId, warehouseId, branchId } = params

    const where: any = { companyId }
    if (status) where.status = status
    if (itemId) where.itemId = itemId
    if (warehouseId) where.warehouseId = warehouseId
    if (branchId) where.warehouse = { branchId }

    const serials = await prisma.serial.findMany({
      where,
      include: { item: true, warehouse: true },
      orderBy: { createdAt: 'desc' },
    })

    const byStatus = serials.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return { serials, byStatus }
  }

  /**
   * تقرير الضمانات والصيانة
   */
  async warrantyReport(companyId: number, status?: string, branchId?: number) {
    const where: any = { companyId }
    if (status) where.status = status
    if (branchId) where.serial = { warehouse: { branchId } }

    const warranties = await prisma.warranty.findMany({
      where,
      include: {
        serial: { include: { item: true } },
        party: true,
      },
      orderBy: { endDate: 'asc' },
    })

    const expiringSoon = warranties.filter((w) => {
      const daysLeft = Math.ceil((w.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysLeft > 0 && daysLeft <= 30
    })

    return { warranties, expiringSoon }
  }

  /**
   * تقرير الأرباح (Gross Profit)
   */
  async profitReport(params: {
    companyId: number
    from?: Date
    to?: Date
    branchId?: number
  }) {
    const { companyId, from, to, branchId } = params

    const where: any = { companyId, status: 'posted' }
    if (from) where.invoiceDate = { ...(where.invoiceDate || {}), gte: from }
    if (to) where.invoiceDate = { ...(where.invoiceDate || {}), lte: to }
    if (branchId) where.branchId = branchId

    const invoices = await prisma.saleInvoice.findMany({
      where,
      include: {
        items: true,
        branch: true,
      },
      orderBy: { invoiceDate: 'desc' },
    })

    const byItem = new Map<number, any>()
    let totalRevenue = 0
    let totalCost = 0

    for (const inv of invoices) {
      totalRevenue += inv.total.toNumber()
      for (const item of inv.items) {
        const key = item.itemId
        const current = byItem.get(key) || {
          itemId: item.itemId,
          quantity: 0,
          revenue: 0,
          cost: 0,
        }
        current.quantity += item.quantity.toNumber()
        current.revenue += item.total.toNumber()
        current.cost += item.costPrice.toNumber() * item.quantity.toNumber()
        byItem.set(key, current)
      }
    }

    totalCost = Array.from(byItem.values()).reduce((s, i) => s + i.cost, 0)

    const items = Array.from(byItem.values()).map((i) => ({
      ...i,
      profit: i.revenue - i.cost,
      margin: i.revenue > 0 ? ((i.revenue - i.cost) / i.revenue) * 100 : 0,
    }))

    return {
      totalRevenue,
      totalCost,
      totalProfit: totalRevenue - totalCost,
      margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
      items,
      invoiceCount: invoices.length,
    }
  }

  /**
   * لوحة المعلومات الرئيسية — تدعم التصفية حسب الفرع اختيارياً
   */
  async dashboard(companyId: number, branchId?: number) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const invoiceBranchFilter = branchId ? { branchId } : {}

    const [salesToday, salesThisMonth, purchasesThisMonth, lowStock, recentInvoices, treasuryBalance, creditInvoices] =
      await Promise.all([
        prisma.saleInvoice.findMany({
          where: {
            companyId,
            status: 'posted',
            invoiceDate: { gte: today },
            ...invoiceBranchFilter,
          },
        }),
        prisma.saleInvoice.findMany({
          where: {
            companyId,
            status: 'posted',
            invoiceDate: { gte: startOfMonth },
            ...invoiceBranchFilter,
          },
        }),
        prisma.purchaseInvoice.findMany({
          where: {
            companyId,
            status: 'posted',
            invoiceDate: { gte: startOfMonth },
            ...(branchId ? { warehouse: { branchId } } : {}),
          },
        }),
        prisma.stock.findMany({
          where: {
            companyId,
            ...(branchId ? { warehouse: { branchId } } : {}),
          },
          include: { item: true, warehouse: true },
        }),
        prisma.saleInvoice.findMany({
          where: { companyId, status: 'posted', ...invoiceBranchFilter },
          include: { party: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.treasury.findMany({ where: { companyId, isActive: true } }),
        prisma.saleInvoice.findMany({
          where: {
            companyId,
            status: 'posted',
            payType: 'credit',
            paymentStatus: { in: ['unpaid', 'partial'] },
            ...invoiceBranchFilter,
          },
          select: { id: true, total: true, paidAmount: true, invoiceDate: true, party: { select: { partyName: true } } },
        }),
      ])

    const salesTodayTotal = salesToday.reduce((s, i) => s + i.total.toNumber(), 0)
    const salesMonthTotal = salesThisMonth.reduce((s, i) => s + i.total.toNumber(), 0)
    const purchasesMonthTotal = purchasesThisMonth.reduce((s, i) => s + i.total.toNumber(), 0)

    const lowStockItems = lowStock
      .filter((s) => s.quantity.toNumber() - (s.damagedStock?.toNumber() ?? 0) <= s.item.minStock.toNumber())
      .map((s) => ({
        itemCode: s.item.itemCode,
        itemName: s.item.itemName,
        warehouse: s.warehouse.name,
        quantity: s.quantity.toNumber() - (s.damagedStock?.toNumber() ?? 0),
        minStock: s.item.minStock.toNumber(),
      }))

    const totalTreasury = treasuryBalance.reduce((s, t) => s + t.currentBalance.toNumber(), 0)

    const totalReceivables = creditInvoices.reduce(
      (s, inv) => s + (inv.total.toNumber() - inv.paidAmount.toNumber()),
      0
    )
    const overdueCount = creditInvoices.filter((inv) => inv.invoiceDate < thirtyDaysAgo).length

    return {
      stats: {
        salesToday: salesTodayTotal,
        salesThisMonth: salesMonthTotal,
        purchasesThisMonth: purchasesMonthTotal,
        lowStockCount: lowStockItems.length,
        treasuryBalance: totalTreasury,
        invoiceCountToday: salesToday.length,
        totalReceivables,
        overdueCount,
      },
      lowStockItems,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        partyName: inv.party?.partyName,
        total: inv.total.toNumber(),
        paymentStatus: inv.paymentStatus,
      })),
    }
  }
}

export const reportService = new ReportService()
