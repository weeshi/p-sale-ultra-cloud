import { prisma } from '../config/database'
import logger from '../config/logger'
import { logSecurityEvent } from '../middleware/audit'
import { accountingService } from './accountingService'
import { treasuryService } from './treasuryService'
import { reconciliationService } from './reconciliationService'
import { saleService } from './saleService'
import { purchaseService } from './purchaseService'
import { transferService } from './transferService'
import { inventoryService } from './inventoryService'
import { sequenceService } from './sequenceService'
import { notifyTransfer } from '../realtime'
import { assertSyncAllowed, SyncForbiddenError } from './syncAuthorization'
import { MOVEMENT_TYPES } from '../../../shared/constants'
import { generateNumber } from '../../../shared/utils'

export interface SyncActor {
  userId: number
  branchId: number | null
  isSuperAdmin: boolean
  role: string
}

export interface SyncPushError {
  entity: string
  id: number | null
  queueId: number | null
  code?: string
  message: string
}

// مهلة اعتبار الحجز المعلّق (PENDING) مهجوراً بعد انقطاع الخادم
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

// مزامنة البيانات بين الأجهزة المحلية (SQLite/IndexedDB) والسيرفر المركزي
export class SyncService {
  /**
   * استقبال التغييرات من جهاز محلي
   * كل تغيير يحتوي على: entity, action, record, timestamp, userId, branchId
   * يُتحقق من هوية (المستخدم/الفرع) المرفقة من التوكن — لا تُثق بيانات العميل أبداً
   */
  async pushChanges(companyId: number, actor: SyncActor, deviceId: string, changes: any[]) {
    const startedAt = new Date()
    const actorUserId = actor.userId
    const actorBranchId = actor.branchId
    let recordsCount = 0
    let skippedCount = 0
    const errors: SyncPushError[] = []

    try {
      for (const change of changes) {
        const queueId = typeof change.queueId === 'number' ? change.queueId : null

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

          // منع التكرار (Idempotency) بالحجز الذري المسبق (Claim-First):
          // قيد UNIQUE على client_op_id يضمن أن طلباً واحداً فقط يحجز المعرّف، حتى مع الطلبات المتوازية.
          // الحجز بحالة PENDING ويُغلق بـ COMPLETED بعد النجاح — فتُغلق نافذة الانقطاع.
          const clientOpId =
            typeof change.clientOpId === 'string' && change.clientOpId.length > 0 ? change.clientOpId : null
          if (clientOpId) {
            const claim = await this.claimOperation(companyId, deviceId, clientOpId, change)
            if (claim === 'duplicate') {
              skippedCount++
              continue
            }
          }

          try {
            await this.applyChange(companyId, change, actor)
          } catch (applyErr) {
            // فشل منطقي: نحرر الحجز ليستطيع العميل إعادة المحاولة بعد تصحيح الخطأ
            if (clientOpId) {
              await prisma.syncOperation.delete({ where: { clientOpId } }).catch(() => undefined)
            }
            throw applyErr
          }
          recordsCount++

          if (clientOpId) {
            // إغلاق الحجز: منع أي إعادة تنفيذ لاحقة. إن فشل التحديث يبقى الحجز PENDING
            // (لا نحرره) لأن منع التكرار أهم من إعادة المحاولة.
            await prisma.syncOperation
              .update({ where: { clientOpId }, data: { status: 'COMPLETED' } })
              .catch((e: any) => logger.error('Sync: تعذّر إغلاق حجز العملية', e))
          }
        } catch (err: any) {
          if (err instanceof SyncForbiddenError) {
            await logSecurityEvent(
              'UNAUTHORIZED_SYNC_ATTEMPT',
              `عنصر «${err.entity}» (${err.action}) رُفض لدور «${actor.role}» — تجاوز صلاحيات عبر المزامنة`,
              { companyId, userId: actorUserId }
            )
          }
          errors.push({
            entity: change.entity ?? 'unknown',
            id: typeof change.id === 'number' ? change.id : null,
            queueId,
            code: typeof err?.code === 'string' ? err.code : undefined,
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

      // تنظيف دوري لسجل العمليات المنفذة (استبقاء 30 يوماً)
      if (recordsCount > 0) {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        await prisma.syncOperation
          .deleteMany({ where: { companyId, createdAt: { lt: cutoff } } })
          .catch(() => undefined)
      }

      return { status, recordsCount, skippedCount, errors }
    } catch (error: any) {
      logger.error('Sync push error:', error)
      throw error
    }
  }

  /**
   * الحجز الذري المسبق لمعرّف العملية (Claim-First) مع حالة PENDING/COMPLETED:
   * - إدراج جديد = PENDING (منفّذ الآن من هذا الطلب)
   * - P2002 + COMPLETED = عملية منفَّذة سابقاً → تخطٍّ
   * - P2002 + PENDING حديث = طلب موازٍ قيد التنفيذ → تخطٍّ
   * - P2002 + PENDING أقدم من 5 دقائق = أثر انقطاع → استيلاء ذري وإعادة تنفيذ
   */
  private async claimOperation(
    companyId: number,
    deviceId: string,
    clientOpId: string,
    change: any
  ): Promise<'claimed' | 'duplicate'> {
    const data = {
      companyId,
      deviceId,
      clientOpId,
      entity: String(change.entity ?? 'unknown'),
      action: String(change.action ?? 'unknown'),
      recordId: typeof change.id === 'number' ? change.id : null,
    }

    try {
      await prisma.syncOperation.create({ data: { ...data, status: 'PENDING' } })
      return 'claimed'
    } catch (e: any) {
      // P2002 متوقع في السباق — لا يُسجَّل كخطأ (مخفض الضجيج)
      if (e?.code !== 'P2002') throw e
    }

    const existing = await prisma.syncOperation.findUnique({ where: { clientOpId } })
    // سباق نادر: أُدرج ثم حُرر (فشل منطقي في الطلب الموازي) — نعتبرها مكتملة لتفادي تكرار غير محكوم
    if (!existing || existing.status !== 'PENDING') return 'duplicate'

    const cutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS)
    if (existing.createdAt && existing.createdAt.getTime() > cutoff.getTime()) return 'duplicate'

    // استيلاء ذري مشروط: طلب واحد فقط ينجح (count = 1)
    const takeover = await prisma.syncOperation.updateMany({
      where: { clientOpId, status: 'PENDING', createdAt: { lt: cutoff } },
      data: { ...data, status: 'PENDING', createdAt: new Date() },
    })
    return takeover.count === 1 ? 'claimed' : 'duplicate'
  }

  /**
   * فرع العملية: المستخدم المقيّد بفرع يُجبر عليه ويُتجاهل فرع الحمولة (البند 3).
   * السوبر أدمن أو المستخدم العالمي (بلا فرع) يستخدم فرع الحمولة إن وُجد.
   */
  private effectiveBranch(actor: SyncActor, payloadBranchId: unknown): number | undefined {
    if (actor.branchId != null && !actor.isSuperAdmin) return actor.branchId
    if (payloadBranchId != null && payloadBranchId !== '') return Number(payloadBranchId)
    return actor.branchId ?? undefined
  }

  /** المخازن المستخدمة في العملية يجب أن تتبع فرع المستخدم المقيّد */
  private async assertWarehousesInBranch(companyId: number, actor: SyncActor, warehouseIds: unknown[]) {
    if (actor.branchId == null || actor.isSuperAdmin) return
    for (const wid of warehouseIds) {
      if (wid == null) continue
      const warehouse = await prisma.warehouse.findFirst({ where: { id: Number(wid), companyId } })
      if (!warehouse) throw new Error('المخزن غير موجود في هذه الشركة')
      if (warehouse.branchId !== actor.branchId) throw new Error('المخزن لا يتبع فرع المستخدم')
    }
  }

  private async applyChange(companyId: number, change: any, actor: SyncActor) {
    const { entity, action, id, data } = change
    const payload = (data ?? {}) as Record<string, any>

    // تفويض المزامنة: نفس قواعد authorize() في REST — تُفرض قبل أي كتابة (deny by default)
    assertSyncAllowed(actor, String(entity), String(action))


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
      // إعدادات الكتالوج (العميل يرسل الاسم بصيغة الجمع)
      category: 'category',
      categories: 'category',
      brand: 'brand',
      brands: 'brand',
      unit: 'unit',
      units: 'unit',
      attribute: 'attribute',
      attributes: 'attribute',
    }

    const modelName = entityMap[entity]
    if (!modelName) throw new Error(`كيان غير معروف: ${entity}`)

    // القيد المحاسبي يُنشأ عبر خدمة المحاسبة (ترقيم JRN + تحقق توازن + تحديث الأرصدة داخل ترانزاكشن)
    if (entity === 'journalEntry' && action === 'create') {
      const { lines, entryDate, entryType, description } = payload
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
      let rate = payload.exchangeRate
      if (!rate) {
        const lastRate = await prisma.exchangeRate.findFirst({
          where: { companyId, fromCurrency: payload.currency || 'LYD', toCurrency: 'LYD' },
          orderBy: { rateDate: 'desc' },
        })
        rate = lastRate?.rate.toNumber() || 1
      }
      await treasuryService.createReceipt({
        companyId,
        receiptDate: new Date(payload.receiptDate || Date.now()),
        receiptType: payload.receiptType,
        partyId: payload.partyId,
        treasuryId: payload.treasuryId,
        branchId: this.effectiveBranch(actor, payload.branchId),
        currency: payload.currency || 'LYD',
        exchangeRate: rate,
        amount: payload.amount,
        paymentMethod: payload.paymentMethod,
        checkNumber: payload.checkNumber,
        bankName: payload.bankName,
        referenceNo: payload.referenceNo,
        saleInvoiceId: payload.saleInvoiceId,
        purchaseInvoiceId: payload.purchaseInvoiceId,
        notes: payload.notes,
      })
      return
    }

    // التسوية البنكية تُنشأ عبر خدمة التسوية (ترقيم RC + حساب الفرق + سطور المطابقة داخل ترانزاكشن)
    if (entity === 'bankReconciliation' && action === 'create') {
      await reconciliationService.createReconciliation({
        companyId,
        treasuryId: payload.treasuryId,
        from: new Date(payload.from),
        statementDate: new Date(payload.statementDate),
        openingBalance: payload.openingBalance ?? 0,
        statementBalance: payload.statementBalance ?? 0,
        matchedReceiptIds: payload.matchedReceiptIds ?? [],
        notes: payload.notes,
        createdBy: actor.userId,
      })
      return
    }

    // فاتورة البيع تُنشأ عبر خدمة المبيعات (ترقيم INV عبر SequenceService + القيود المحاسبية + تحديث المخزون + السيريالات + الضمان داخل ترانزاكشن)
    if (entity === 'saleInvoice' && action === 'create') {
      const items = Array.isArray(payload.items) ? payload.items : []
      if (items.length === 0) throw new Error('لا توجد أصناف في الفاتورة')
      await saleService.createSaleInvoice({
        companyId,
        branchId: this.effectiveBranch(actor, payload.branchId),
        warehouseId: payload.warehouseId,
        invoiceDate: new Date(payload.invoiceDate || Date.now()),
        partyId: payload.partyId,
        treasuryId: payload.treasuryId,
        payType: payload.payType,
        bankingService: payload.bankingService,
        taxRate: payload.taxRate ?? 0,
        discount: payload.discount ?? 0,
        paidAmount: payload.paidAmount,
        notes: payload.notes,
        createdBy: actor.userId,
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

    // عرض السعر — ترقيم QOT + حساب الإجماليات
    if (entity === 'quote' && action === 'create') {
      const items = Array.isArray(payload.items) ? payload.items : []
      if (items.length === 0) throw new Error('لا توجد أصناف في عرض السعر')
      await saleService.createQuote({
        companyId,
        quoteDate: new Date(payload.quoteDate || Date.now()),
        partyId: payload.partyId,
        branchId: this.effectiveBranch(actor, payload.branchId),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : undefined,
        notes: payload.notes,
        createdBy: actor.userId,
        items: items.map((i: any) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount ?? 0,
        })),
      })
      return
    }

    // فاتورة شراء محلية — تسعير مزدوج + متوسط التكلفة + القيد المحاسبي
    // أو استلام أمر استيراد — Landed Cost + سيريالات (يُحدَّد بوجود purchaseOrderId)
    if (entity === 'purchaseInvoice' && action === 'create') {
      const purchaseOrderId = Number(payload.purchaseOrderId ?? payload.poId ?? 0)
      if (purchaseOrderId > 0) {
        await purchaseService.receivePurchaseOrder(purchaseOrderId, {
          companyId,
          warehouseId: Number(payload.warehouseId),
          treasuryId: payload.treasuryId ? Number(payload.treasuryId) : undefined,
          receiveDate: new Date(payload.receiveDate || Date.now()),
          shippingCost: payload.shippingCost,
          customsCost: payload.customsCost,
          insuranceCost: payload.insuranceCost,
          otherCosts: payload.otherCosts,
          paidAmount: payload.paidAmount,
          createdBy: actor.userId,
          items: Array.isArray(payload.items) ? payload.items : undefined,
        })
        return
      }

      const items = Array.isArray(payload.items) ? payload.items : []
      if (!payload.partyId || !payload.warehouseId) throw new Error('المورد والمخزن مطلوبان')
      if (items.length === 0) throw new Error('لا توجد أصناف')

      let rate = payload.exchangeRate
      if (!rate) {
        const lastRate = await prisma.exchangeRate.findFirst({
          where: { companyId, fromCurrency: payload.currency || 'LYD', toCurrency: 'LYD' },
          orderBy: { rateDate: 'desc' },
        })
        rate = lastRate?.rate.toNumber() || 1
      }

      await purchaseService.createDirectPurchase({
        companyId,
        branchId: this.effectiveBranch(actor, payload.branchId),
        partyId: Number(payload.partyId),
        warehouseId: Number(payload.warehouseId),
        treasuryId: payload.treasuryId ? Number(payload.treasuryId) : undefined,
        payType: payload.payType,
        bankingService: payload.bankingService,
        invoiceDate: new Date(payload.invoiceDate || Date.now()),
        currency: payload.currency || 'LYD',
        exchangeRate: rate,
        shippingCost: payload.shippingCost,
        customsCost: payload.customsCost,
        discount: payload.discount,
        paidAmount: payload.paidAmount,
        notes: payload.notes,
        createdBy: actor.userId,
        items: items.map((i: any) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          unitPriceUsd: i.unitPriceUsd,
          unitPriceLyd: i.unitPriceLyd,
          serialNumbers: Array.isArray(i.serialNumbers) ? i.serialNumbers : undefined,
        })),
      })
      return
    }

    // أمر استيراد — ترقيم PO + تكاليف الوصول
    if (entity === 'purchaseOrder' && action === 'create') {
      const items = Array.isArray(payload.items) ? payload.items : []
      if (!payload.partyId) throw new Error('المورد مطلوب')
      if (items.length === 0) throw new Error('لا توجد أصناف')

      await purchaseService.createPurchaseOrder({
        companyId,
        branchId: this.effectiveBranch(actor, payload.branchId),
        poDate: new Date(payload.poDate || Date.now()),
        partyId: Number(payload.partyId),
        currency: payload.currency || 'USD',
        exchangeRate: payload.exchangeRate || 1,
        shippingCost: payload.shippingCost,
        customsCost: payload.customsCost,
        insuranceCost: payload.insuranceCost,
        otherCosts: payload.otherCosts,
        discount: payload.discount,
        lcNumber: payload.lcNumber,
        lcBank: payload.lcBank,
        expectedArrival: payload.expectedArrival ? new Date(payload.expectedArrival) : undefined,
        targetWarehouseId: payload.targetWarehouseId ? Number(payload.targetWarehouseId) : undefined,
        notes: payload.notes,
        createdBy: actor.userId,
        items: items.map((i: any) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          unitPriceUsd: i.unitPriceUsd,
        })),
      })
      return
    }

    // تحويل مخزون — ترقيم TRN + حركات المخزون والسيريالات داخل ترانزاكشن
    if (entity === 'stockTransfer' && action === 'create') {
      const items = Array.isArray(payload.items) ? payload.items : []
      if (items.length === 0) throw new Error('لا توجد أصناف في التحويل')

      await this.assertWarehousesInBranch(companyId, actor, [payload.fromWarehouseId, payload.toWarehouseId])

      const transfer = await transferService.createTransfer({
        companyId,
        transferDate: new Date(payload.transferDate || Date.now()),
        fromWarehouseId: Number(payload.fromWarehouseId),
        toWarehouseId: Number(payload.toWarehouseId),
        transferType: payload.transferType || 'transfer',
        notes: payload.notes,
        createdBy: actor.userId,
        items: items.map((i: any) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          unitCost: i.unitCost,
        })),
      })

      // إشعار لحظي — لا يُسقط المزامنة عند فشله
      try {
        notifyTransfer(transfer, 'created')
      } catch {
        // تجاهل فشل الإشعار اللحظي
      }
      return
    }

    // جرد المخزون — إنشاء (ترقيم CNT + بذر بنود) أو إدخال كمية معدودة لصنف
    if (entity === 'inventoryCount') {
      if (action === 'create') {
        await this.assertWarehousesInBranch(companyId, actor, [payload.warehouseId])
        await inventoryService.createCount({
          companyId,
          warehouseId: Number(payload.warehouseId),
          countDate: new Date(payload.countDate || Date.now()),
          notes: payload.notes,
          createdBy: actor.userId,
        })
        return
      }

      // البند 4: تحديث بند الجرد يجب أن يحمل countId و itemId — لا يسقط أبداً للمسار العام
      const countId = Number(payload.countId ?? 0)
      if (countId > 0 && payload.itemId != null) {
        await inventoryService.processCountItem(
          countId,
          Number(payload.itemId),
          Number(payload.countedGoodQty ?? 0),
          Number(payload.countedDamagedQty ?? 0)
        )
        return
      }
      throw new Error('تحديث بند الجرد يتطلب countId و itemId')
    }

    // صنف جديد — ترقيم ITM + الخصائص + الرصيد الافتتاحي في المخزن المركزي
    if (entity === 'item' && action === 'create') {
      if (!payload.itemName) throw new Error('اسم الصنف مطلوب')
      const itemCode = generateNumber('ITM', await sequenceService.next(companyId, 'ITM'))
      const attributes = Array.isArray(payload.attributes) ? payload.attributes : []
      const bundleParts = Array.isArray(payload.bundleParts) ? payload.bundleParts : []
      const openingStock = Number(payload.openingStock ?? 0)

      const item = await prisma.item.create({
        data: {
          companyId,
          itemCode,
          barcode: payload.barcode,
          itemName: payload.itemName,
          modelNumber: payload.modelNumber,
          categoryId: payload.categoryId ? Number(payload.categoryId) : undefined,
          brandId: payload.brandId ? Number(payload.brandId) : undefined,
          unitId: payload.unitId ? Number(payload.unitId) : undefined,
          description: payload.description,
          image: payload.image,
          purchasePrice: payload.purchasePrice || 0,
          purchasePriceUsd: payload.purchasePriceUsd || 0,
          salePrice: payload.salePrice || 0,
          wholesalePrice: payload.wholesalePrice || 0,
          openingStock,
          currentStock: openingStock,
          minStock: payload.minStock || 0,
          reorderLevel: payload.reorderLevel || 0,
          location: payload.location,
          trackSerial: payload.trackSerial || false,
          isBundle: payload.isBundle || false,
          isService: payload.isService || false,
          taxRate: payload.taxRate || 0,
          inventoryAccountId: payload.inventoryAccountId,
          cogsAccountId: payload.cogsAccountId,
          salesAccountId: payload.salesAccountId,
          purchaseAccountId: payload.purchaseAccountId,
          attributes: attributes.length
            ? {
                create: attributes.map((a: any) => ({
                  attributeId: Number(a.attributeId),
                  value: String(a.value),
                })),
              }
            : undefined,
          bundleParts: bundleParts.length
            ? {
                create: bundleParts.map((b: any) => ({
                  childItemId: Number(b.itemId),
                  quantity: b.quantity || 1,
                })),
              }
            : undefined,
        },
      })

      if (openingStock > 0) {
        const central = await prisma.warehouse.findFirst({
          where: { companyId, type: 'central' },
        })
        if (central) {
          await prisma.stock.create({
            data: { companyId, itemId: item.id, warehouseId: central.id, quantity: openingStock },
          })
        }
      }
      return
    }

    // تعديل صنف — تحديث الحقول + استبدال الخصائص (المصفوفة ليست حقلاً قياسياً)
    if (entity === 'item' && action === 'update') {
      const existing = await prisma.item.findFirst({ where: { id, companyId } })
      if (!existing) throw new Error('الصنف غير موجود في هذه الشركة')

      const { attributes, bundleParts, itemCode: _code, companyId: _c, id: _id, ...rest } = payload
      await prisma.$transaction(async (tx) => {
        await tx.item.update({ where: { id: existing.id }, data: rest })
        if (Array.isArray(attributes)) {
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
        if (Array.isArray(bundleParts)) {
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
      })
      return
    }

    // طرف جديد — ترقيم PTY + رصيد افتتاحي
    if (entity === 'party' && action === 'create') {
      if (!payload.partyName) throw new Error('اسم الحساب مطلوب')
      const partyCode = generateNumber('PTY', await sequenceService.next(companyId, 'PTY'))
      const openingBalance = Number(payload.openingBalance ?? 0)

      await prisma.party.create({
        data: {
          companyId,
          partyCode,
          partyName: payload.partyName,
          partyType: payload.partyType || 'customer',
          address: payload.address,
          phone: payload.phone,
          mobile: payload.mobile,
          email: payload.email,
          whatsapp: payload.whatsapp,
          taxNumber: payload.taxNumber,
          creditLimit: payload.creditLimit || 0,
          openingBalance,
          currentBalance: openingBalance,
          accountId: payload.accountId,
          notes: payload.notes,
        },
      })
      return
    }

    // المستخدم والصلاحيات يُحدَّثان عبر ترانزاكشن (يمسح ويعيد إنشاء permissions)
    if (entity === 'user' && action === 'update') {
      // إدارة المستخدمين والصلاحيات للأدمن فقط (منع تصعيد الصلاحيات عبر المزامنة)
      if (!(actor.isSuperAdmin || actor.role === 'admin')) {
        throw new Error('لا تملك صلاحية تعديل المستخدمين')
      }
      // البند 2: المستخدم المستهدف يجب أن يتبع شركة المنفّذ
      const target = await prisma.user.findFirst({ where: { id, companyId } })
      if (!target) throw new Error(`السجل ${id} غير موجود في هذه الشركة`)

      const { fullName, email, phone, role, branchId, isActive, permissions } = payload
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: target.id },
          data: { fullName, email, phone, role, branchId, isActive },
        })
        if (permissions) {
          await tx.permission.deleteMany({ where: { userId: target.id } })
          if (permissions.length > 0) {
            await tx.permission.createMany({
              data: permissions.map((p: any) => ({
                userId: target.id,
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
    if (entity === 'stockMovement' && action === 'create' && payload?.movementType) {
      const mt = payload.movementType
      if (mt === MOVEMENT_TYPES.DAMAGED || mt === MOVEMENT_TYPES.RETURN_DAMAGED) {
        await inventoryService.registerDamaged({
          companyId,
          itemId: payload.itemId ?? id,
          warehouseId: payload.warehouseId,
          quantity: payload.quantity,
          notes: payload.notes,
          movementType: mt,
        })
        return
      }
      if (mt === MOVEMENT_TYPES.DAMAGE_REVERSAL) {
        await inventoryService.reverseDamaged({
          companyId,
          itemId: payload.itemId ?? id,
          warehouseId: payload.warehouseId,
          quantity: Math.abs(payload.quantity),
          notes: payload.notes,
        })
        return
      }
    }

    const model = (prisma as any)[modelName]
    if (!model) throw new Error(`النموذج غير موجود: ${modelName}`)

    // الجداول المرتبطة بفرع: يُفرض فرع المستخدم الموثق ولو أرسل العميل غيره
    const branchScoped = new Set([
      'treasury',
      'warehouse',
      'saleInvoice',
      'purchaseInvoice',
      'purchaseOrder',
      'stockTransfer',
      'quote',
      'receipt',
      'bankReconciliation',
      'inventoryCount',
    ])

    const sanitize = (raw: Record<string, any>) => {
      const { id: _id, companyId: _companyId, ...rest } = raw ?? {}
      if (branchScoped.has(modelName) && actor.branchId != null && !actor.isSuperAdmin) {
        rest.branchId = actor.branchId
      }
      return rest
    }

    // جدول الشركة نفسه: مفتاحه هو معرّف الشركة (لا عمود company_id)
    if (modelName === 'company') {
      if (id !== companyId) throw new Error('غير مصرح بالوصول لهذه الشركة')
      if (action === 'delete') throw new Error('لا يمكن حذف الشركة عبر المزامنة')
      await model.update({ where: { id: companyId }, data: sanitize(payload) })
      return
    }

    switch (action) {
      case 'create':
      case 'update': {
        // عزل الشركة: لا يُحدَّث سجل يتبع شركة أخرى (15.3)
        const existing = id ? await model.findFirst({ where: { id, companyId } }) : null
        if (id && !existing) {
          throw new Error(`السجل ${id} غير موجود في هذه الشركة`)
        }

        if (existing) {
          await model.update({ where: { id: existing.id }, data: sanitize(payload) })
        } else {
          await model.create({ data: { ...sanitize(payload), companyId } })
        }
        break
      }

      case 'delete':
        if (id) {
          const existing = await model.findFirst({ where: { id, companyId } })
          if (!existing) throw new Error(`السجل ${id} غير موجود في هذه الشركة`)
          await model.delete({ where: { id: existing.id } })
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
