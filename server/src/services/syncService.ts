import { prisma } from '../config/database'
import logger from '../config/logger'
import { logSecurityEvent } from '../middleware/audit'
import { accountingService } from './accountingService'
import { treasuryService } from './treasuryService'
import { reconciliationService } from './reconciliationService'
import { saleService } from './saleService'
import { inventoryService } from './inventoryService'
import { MOVEMENT_TYPES } from '../../../shared/constants'

// مزامنة البيانات بين الأجهزة المحلية (SQLite/IndexedDB) والسيرفر المركزي
export class SyncService {
  /**
   * استقبال التغييرات من جهاز محلي
   * كل تغيير يحتوي على: entity, action, record, timestamp, userId, branchId
   * يُتحقق من هوية (المستخدم/الفرع) المرفقة من التوكن — لا تُثق بيانات العميل أبداً
   */
  async pushChanges(
    companyId: number,
    actorUserId: number,
    actorBranchId: number | null,
    deviceId: string,
    changes: any[]
  ) {
    const startedAt = new Date()
    let recordsCount = 0
    const errors: Array<{ entity: string; id: number | null; message: string }> = []

    try {
      for (const change of changes) {
        try {
          // التحقق من الهوية المرفقة (claim) مقابل التوكن الموثق
          const claimedUserId = (change as any).userId ?? null
          const claimedBranchId = (change as any).branchId ?? null
          if (claimedUserId !== actorUserId) {
            await logSecurityEvent(
              'IDENTITY_TAMPERING',
              `عنصر «${change.entity}» يدّعي هوية مستخدم ${claimedUserId} بينما الموثق هو ${actorUserId}`,
              { companyId, userId: actorUserId }
            )
            throw new Error('رفض المزامنة: تزوير هوية المستخدم في عنصر الطابور')
          }
          if (claimedBranchId !== actorBranchId) {
            await logSecurityEvent(
              'BRANCH_ACCESS_DENIED',
              `عنصر «${change.entity}» يخص فرع ${claimedBranchId} بينما فرع المستخدم الموثق هو ${actorBranchId}`,
              { companyId, userId: actorUserId }
            )
            throw new Error('رفض المزامنة: فرع غير مصرح في عنصر الطابور')
          }

          await this.applyChange(companyId, change)
          recordsCount++
        } catch (err: any) {
          errors.push({
            entity: change.entity ?? 'unknown',
            id: typeof change.id === 'number' ? change.id : null,
            message: err?.message ?? String(err),
          })
        }
      }

      const status = errors.length === 0 ? 'success' : 'partial'

      await prisma.syncLog.create({
        data: {
          companyId,
          deviceId,
          syncType: 'push',
          recordsCount,
          status,
          errorMessage: errors.length ? JSON.stringify(errors) : null,
          startedAt,
          completedAt: new Date(),
        },
      })

      return { status, recordsCount, errors }
    } catch (error: any) {
      logger.error('Sync push error:', error)
      throw error
    }
  }

  private async applyChange(companyId: number, change: any) {
    const { entity, action, id, data } = change

    // خريطة الجداول القابلة للمزامنة
    const entityMap: Record<string, string> = {
      item: 'item',
      party: 'party',
      account: 'account',
      saleInvoice: 'saleInvoice',
      purchaseInvoice: 'purchaseInvoice',
      receipt: 'receipt',
      treasury: 'treasury',
      stockMovement: 'stockMovement',
      journalEntry: 'journalEntry',
      serial: 'serial',
      quote: 'quote',
      purchaseOrder: 'purchaseOrder',
      stockTransfer: 'stockTransfer',
      inventoryCount: 'inventoryCount',
      company: 'company',
      branch: 'branch',
      warehouse: 'warehouse',
      exchangeRate: 'exchangeRate',
      user: 'user',
      bankReconciliation: 'bankReconciliation',
    }

    const modelName = entityMap[entity]
    if (!modelName) throw new Error(`كيان غير معروف: ${entity}`)

    // القيد المحاسبي يُنشأ عبر خدمة المحاسبة (ترقيم JRN + تحقق توازن + تحديث الأرصدة داخل ترانزاكشن)
    if (entity === 'journalEntry' && action === 'create') {
      const { lines, entryDate, entryType, description } = data
      if (!Array.isArray(lines) || lines.length < 2) {
        throw new Error('سطران على الأقل مطلوبان للقيد')
      }
      await accountingService.createJournalEntry({
        companyId,
        entryDate: new Date(entryDate),
        entryType: entryType || 'adjusting',
        description,
        lines,
      })
      return
    }

    // سند القبض/الصرف يُنشأ عبر خدمة الخزينة (ترقيم RCV/PAY + تحديث رصيد الخزينة + القيد المحاسبي داخل ترانزاكشن)
    if (entity === 'receipt' && action === 'create') {
      let rate = data.exchangeRate
      if (!rate) {
        const lastRate = await prisma.exchangeRate.findFirst({
          where: { companyId, fromCurrency: data.currency || 'LYD', toCurrency: 'LYD' },
          orderBy: { rateDate: 'desc' },
        })
        rate = lastRate?.rate.toNumber() || 1
      }
      await treasuryService.createReceipt({
        companyId,
        receiptDate: new Date(data.receiptDate || Date.now()),
        receiptType: data.receiptType,
        partyId: data.partyId,
        treasuryId: data.treasuryId,
        branchId: data.branchId,
        currency: data.currency || 'LYD',
        exchangeRate: rate,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        checkNumber: data.checkNumber,
        bankName: data.bankName,
        referenceNo: data.referenceNo,
        saleInvoiceId: data.saleInvoiceId,
        purchaseInvoiceId: data.purchaseInvoiceId,
        notes: data.notes,
      })
      return
    }

    // التسوية البنكية تُنشأ عبر خدمة التسوية (ترقيم RC + حساب الفرق + سطور المطابقة داخل ترانزاكشن)
    if (entity === 'bankReconciliation' && action === 'create') {
      await reconciliationService.createReconciliation({
        companyId,
        treasuryId: data.treasuryId,
        from: new Date(data.from),
        statementDate: new Date(data.statementDate),
        openingBalance: data.openingBalance ?? 0,
        statementBalance: data.statementBalance ?? 0,
        matchedReceiptIds: data.matchedReceiptIds ?? [],
        notes: data.notes,
        createdBy: data.createdBy,
      })
      return
    }

    // فاتورة البيع تُنشأ عبر خدمة المبيعات (ترقيم INV عبر SequenceService + القيود المحاسبية + تحديث المخزون + السيريالات + الضمان داخل ترانزاكشن)
    if (entity === 'saleInvoice' && action === 'create') {
      const items = Array.isArray(data.items) ? data.items : []
      if (items.length === 0) throw new Error('لا توجد أصناف في الفاتورة')
      await saleService.createSaleInvoice({
        companyId,
        branchId: data.branchId,
        warehouseId: data.warehouseId,
        invoiceDate: new Date(data.invoiceDate || Date.now()),
        partyId: data.partyId,
        treasuryId: data.treasuryId,
        payType: data.payType,
        bankingService: data.bankingService,
        taxRate: data.taxRate ?? 0,
        discount: data.discount ?? 0,
        paidAmount: data.paidAmount,
        notes: data.notes,
        createdBy: data.createdBy,
        items: items.map((i: any) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount ?? 0,
          serialNumbers: Array.isArray(i.serialNumbers) ? i.serialNumbers : undefined,
          returnAsDamaged: !!i.returnAsDamaged,
        })),
      })
      return
    }

    // المستخدم والصلاحيات يُحدَّثان عبر ترانزاكشن (يمسح ويعيد إنشاء permissions)
    if (entity === 'user' && action === 'update') {
      const { fullName, email, phone, role, branchId, isActive, permissions } = data
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: { fullName, email, phone, role, branchId, isActive },
        })
        if (permissions) {
          await tx.permission.deleteMany({ where: { userId: id } })
          if (permissions.length > 0) {
            await tx.permission.createMany({
              data: permissions.map((p: any) => ({
                userId: id,
                module: p.module,
                canView: p.canView,
                canAdd: p.canAdd,
                canEdit: p.canEdit,
                canDelete: p.canDelete,
                canPrint: p.canPrint,
              })),
            })
          }
        }
      })
      return
    }

    // حركات التالف المؤجلة تُنفَّذ عبر خدمة المخزون (تحديث الأرصدة + حركة داخل ترانزاكشن) — لا raw create
    if (entity === 'stockMovement' && action === 'create' && data?.movementType) {
      const mt = data.movementType
      if (mt === MOVEMENT_TYPES.DAMAGED || mt === MOVEMENT_TYPES.RETURN_DAMAGED) {
        await inventoryService.registerDamaged({
          companyId,
          itemId: data.itemId ?? id,
          warehouseId: data.warehouseId,
          quantity: data.quantity,
          notes: data.notes,
          movementType: mt,
        })
        return
      }
      if (mt === MOVEMENT_TYPES.DAMAGE_REVERSAL) {
        await inventoryService.reverseDamaged({
          companyId,
          itemId: data.itemId ?? id,
          warehouseId: data.warehouseId,
          quantity: Math.abs(data.quantity),
          notes: data.notes,
        })
        return
      }
    }

    const model = (prisma as any)[modelName]
    if (!model) throw new Error(`النموذج غير موجود: ${modelName}`)

    switch (action) {
      case 'create':
      case 'update': {
        const { id: _, ...payload } = data
        const existing = id ? await model.findUnique({ where: { id } }).catch(() => null) : null

        if (existing) {
          await model.update({ where: { id }, data: payload })
        } else {
          await model.create({ data: { ...payload, companyId } })
        }
        break
      }

      case 'delete':
        if (id) {
          await model.delete({ where: { id } }).catch(() => null)
        }
        break

      default:
        throw new Error(`إجراء غير معروف: ${action}`)
    }
  }

  /**
   * سحب التغييرات من السيرفر لجهاز محلي
   * يستخدم نقاط تزامن لكل جدول (timestamp-based incremental sync)
   */
  async pullChanges(companyId: number, deviceId: string, lastSyncAt?: Date) {
    const since = lastSyncAt || new Date(0)
    const startedAt = new Date()

    try {
      // الجداول القابلة للمزامنة مع حقل التحديث
      const syncTables = [
        { table: 'item', field: 'updatedAt', include: { attributes: true } },
        { table: 'party', field: 'updatedAt', include: {} },
        { table: 'account', field: 'updatedAt', include: {} },
        { table: 'saleInvoice', field: 'updatedAt', include: { items: true } },
        { table: 'purchaseInvoice', field: 'updatedAt', include: { items: true } },
        { table: 'receipt', field: 'updatedAt', include: {} },
        { table: 'stockMovement', field: 'createdAt', include: {} },
        { table: 'journalEntry', field: 'createdAt', include: { lines: true } },
        { table: 'serial', field: 'updatedAt', include: {} },
        { table: 'quote', field: 'updatedAt', include: { items: true } },
        { table: 'purchaseOrder', field: 'updatedAt', include: { items: true } },
        { table: 'stockTransfer', field: 'updatedAt', include: { items: true } },
        { table: 'inventoryCount', field: 'createdAt', include: { items: true } },
        { table: 'treasury', field: 'updatedAt', include: {} },
        { table: 'warehouse', field: 'updatedAt', include: {} },
        { table: 'branch', field: 'updatedAt', include: {} },
        { table: 'exchangeRate', field: 'createdAt', include: {} },
      ]

      const result: Record<string, any[]> = {}
      let totalCount = 0

      for (const syncTable of syncTables) {
        const model = (prisma as any)[syncTable.table]
        const where: any = { companyId }

        // فقط التحديثات بعد آخر مزامنة
        if (syncTable.field === 'updatedAt') {
          where.updatedAt = { gt: since }
        } else if (syncTable.field === 'createdAt') {
          where.createdAt = { gt: since }
        }

        const rows = await model.findMany({
          where,
          include: syncTable.include,
          orderBy: { [syncTable.field]: 'asc' },
        })

        result[syncTable.table] = rows
        totalCount += rows.length
      }

      await prisma.syncLog.create({
        data: {
          companyId,
          deviceId,
          syncType: 'pull',
          recordsCount: totalCount,
          status: 'success',
          startedAt,
          completedAt: new Date(),
        },
      })

      return { tables: result, totalCount, syncedAt: new Date() }
    } catch (error) {
      logger.error('Sync pull error:', error)
      throw error
    }
  }

  /**
   * حالة المزامنة الأخيرة
   */
  async getSyncStatus(companyId: number, deviceId?: string) {
    const recent = await prisma.syncLog.findMany({
      where: { companyId, ...(deviceId ? { deviceId } : {}) },
      orderBy: { startedAt: 'desc' },
      take: 20,
    })

    const lastSuccess = await prisma.syncLog.findFirst({
      where: { companyId, status: 'success' },
      orderBy: { completedAt: 'desc' },
    })

    return {
      lastSyncAt: lastSuccess?.completedAt || null,
      lastSyncStatus: lastSuccess?.status || 'never',
      recentLogs: recent,
    }
  }
}

export const syncService = new SyncService()
