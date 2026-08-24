import { prisma } from '../config/database'
import { Prisma } from '@prisma/client'

// خدمة تنظيف قاعدة البيانات (منطقة الخطر)
// تحذف كل معاملات الشركة وبياناتها التشغيلية مع الإبقاء على:
//   Company + Branch + Account + central Warehouse + super Admin + إعدادات الكتالوج (units/categories/brands/attributes)
// ويُعاد ضبط التسلسلات والأرصدة لقيمها الأولية.

export interface ResetResult {
  success: boolean
  deletedTransactions: number
  deletedUsers: number
  deletedWarehouses: number
  resetSequences: number
  resetAccounts: number
  resetTreasuries: number
}

export class CleanupService {
  async resetDatabase(companyId: number, superAdminId: number): Promise<ResetResult> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1) التحويلات وملحقاتها
      const stockTransferItems = await tx.stockTransferItem.deleteMany({ where: { transfer: { companyId } } })
      const stockTransfers = await tx.stockTransfer.deleteMany({ where: { companyId } })

      // 2) الجرد
      const inventoryCountItems = await tx.inventoryCountItem.deleteMany({ where: { count: { companyId } } })
      const inventoryCounts = await tx.inventoryCount.deleteMany({ where: { companyId } })

      // 3) السيريالات وحركاتها + الضمان + RMA (قبل فواتير البيع/الشراء)
      const serialMovements = await tx.serialMovement.deleteMany({ where: { serial: { companyId } } })
      const rmaItems = await tx.rmaItem.deleteMany({ where: { rma: { companyId } } })
      const rmas = await tx.rma.deleteMany({ where: { companyId } })
      const warranties = await tx.warranty.deleteMany({ where: { companyId } })
      const serials = await tx.serial.deleteMany({ where: { companyId } })

      // 4) عروض الأسعار
      const quoteItems = await tx.quoteItem.deleteMany({ where: { quote: { companyId } } })
      const quotes = await tx.quote.deleteMany({ where: { companyId } })

      // 5) فواتير البيع
      const saleInvoiceItems = await tx.saleInvoiceItem.deleteMany({ where: { invoice: { companyId } } })
      const saleInvoices = await tx.saleInvoice.deleteMany({ where: { companyId } })

      // 6) فواتير الشراء وأوامر الشراء والشحنات
      const purchaseInvoiceItems = await tx.purchaseInvoiceItem.deleteMany({ where: { invoice: { companyId } } })
      const purchaseInvoices = await tx.purchaseInvoice.deleteMany({ where: { companyId } })
      const shipments = await tx.shipment.deleteMany({ where: { companyId } })
      const purchaseOrderItems = await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { companyId } } })
      const purchaseOrders = await tx.purchaseOrder.deleteMany({ where: { companyId } })

      // 7) التسويات البنكية وسندات القبض/الصرف
      const reconciliationLines = await tx.bankReconciliationLine.deleteMany({ where: { reconciliation: { companyId } } })
      const bankReconciliations = await tx.bankReconciliation.deleteMany({ where: { companyId } })
      const receipts = await tx.receipt.deleteMany({ where: { companyId } })

      // 8) القيود المحاسبية
      const journalEntryLines = await tx.journalEntryLine.deleteMany({ where: { journalEntry: { companyId } } })
      const journalEntries = await tx.journalEntry.deleteMany({ where: { companyId } })

      // 9) الأصناف وملحقاتها (تُحذف مع الإبقاء على إعدادات الكتالوج)
      const bundleParts = await tx.bundlePart.deleteMany({
        where: {
          OR: [{ parentItem: { companyId } }, { childItem: { companyId } }],
        },
      })
      const itemAttributes = await tx.itemAttribute.deleteMany({ where: { item: { companyId } } })
      const stock = await tx.stock.deleteMany({ where: { companyId } })
      const stockMovements = await tx.stockMovement.deleteMany({ where: { companyId } })
      const parties = await tx.party.deleteMany({ where: { companyId } })
      const items = await tx.item.deleteMany({ where: { companyId } })

      // 10) بيانات تشغيلية قابلة للمسح
      const exchangeRates = await tx.exchangeRate.deleteMany({ where: { companyId } })
      const syncLogs = await tx.syncLog.deleteMany({ where: { companyId } })
      const auditLogs = await tx.auditLog.deleteMany({ where: { companyId } })

      // 11) مستخدمو الشركة (باستثناء السوبر أدمن) وصلاحياتهم
      const permissions = await tx.permission.deleteMany({ where: { user: { companyId } } })
      const users = await tx.user.deleteMany({ where: { companyId, NOT: { id: superAdminId } } })

      // 12) المخازن (باستثناء المركزي)
      const warehouses = await tx.warehouse.deleteMany({
        where: { companyId, NOT: { type: 'central' } },
      })

      // 13) إعادة ضبط التسلسلات والأرصدة
      const resetSequences = await tx.sequence.updateMany({
        where: { companyId },
        data: { currentValue: 0 },
      })
      const resetAccounts = await tx.account.updateMany({
        where: { companyId },
        data: { currentBalance: 0, openingBalance: 0 },
      })
      const resetTreasuries = await tx.treasury.updateMany({
        where: { companyId },
        data: { currentBalance: 0, openingBalance: 0 },
      })

      return {
        success: true,
        deletedTransactions:
          stockTransferItems.count +
          stockTransfers.count +
          inventoryCountItems.count +
          inventoryCounts.count +
          serialMovements.count +
          rmaItems.count +
          rmas.count +
          warranties.count +
          serials.count +
          quoteItems.count +
          quotes.count +
          saleInvoiceItems.count +
          saleInvoices.count +
          purchaseInvoiceItems.count +
          purchaseInvoices.count +
          shipments.count +
          purchaseOrderItems.count +
          purchaseOrders.count +
          reconciliationLines.count +
          bankReconciliations.count +
          receipts.count +
          journalEntryLines.count +
          journalEntries.count +
          bundleParts.count +
          itemAttributes.count +
          stock.count +
          stockMovements.count +
          parties.count +
          items.count +
          exchangeRates.count +
          syncLogs.count +
          auditLogs.count +
          permissions.count,
        deletedUsers: users.count,
        deletedWarehouses: warehouses.count,
        resetSequences: resetSequences.count,
        resetAccounts: resetAccounts.count,
        resetTreasuries: resetTreasuries.count,
      }
    })
  }
}

export const cleanupService = new CleanupService()
