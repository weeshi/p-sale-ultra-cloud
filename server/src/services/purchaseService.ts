import { prisma } from '../config/database'
import { accountingService } from './accountingService'
import { inventoryService } from './inventoryService'
import { sequenceService } from './sequenceService'
import { generateNumber, toDecimal, absorbedAverageCost } from '../../../shared/utils'
import { JOURNAL_TYPES } from '../../../shared/constants'

// خدمة المشتريات: أوامر الشراء، الاستيراد، تكلفة الوصول
export class PurchaseService {
  /**
   * إنشاء أمر شراء (PO) - للاستيراد من الصين بالدولار
   */
  async createPurchaseOrder(data: {
    companyId: number
    branchId?: number | null
    poDate: Date
    partyId: number
    currency: string
    exchangeRate: number
    shippingCost?: number
    customsCost?: number
    insuranceCost?: number
    otherCosts?: number
    discount?: number
    lcNumber?: string
    lcBank?: string
    expectedArrival?: Date
    targetWarehouseId?: number
    notes?: string
    createdBy?: number
    items: Array<{
      itemId: number
      quantity: number
      unitPriceUsd: number
    }>
  }) {
    const {
      companyId,
      branchId,
      poDate,
      partyId,
      currency,
      exchangeRate,
      shippingCost = 0,
      customsCost = 0,
      insuranceCost = 0,
      otherCosts = 0,
      discount = 0,
      lcNumber,
      lcBank,
      expectedArrival,
      targetWarehouseId,
      notes,
      createdBy,
      items,
    } = data

    return prisma.$transaction(async (tx) => {
      const subtotalUsd = items.reduce((s, i) => s + i.unitPriceUsd * i.quantity, 0)
      const totalUsd = subtotalUsd - discount + shippingCost + customsCost + insuranceCost + otherCosts

      const poNumber = generateNumber('PO', await sequenceService.next(companyId, 'PO', tx))

      const po = await tx.purchaseOrder.create({
        data: {
          companyId,
          branchId: branchId ?? undefined,
          poNumber,
          poDate,
          partyId,
          currency,
          exchangeRate: toDecimal(exchangeRate, 6),
          subtotal: toDecimal(subtotalUsd),
          shippingCost: toDecimal(shippingCost),
          customsCost: toDecimal(customsCost),
          insuranceCost: toDecimal(insuranceCost),
          otherCosts: toDecimal(otherCosts),
          discount: toDecimal(discount),
          totalAmount: toDecimal(totalUsd),
          totalAmountUsd: toDecimal(totalUsd),
          lcNumber,
          lcBank,
          expectedArrival,
          targetWarehouseId,
          notes,
          createdBy,
          items: {
            create: items.map((item) => {
              const totalUsdItem = item.unitPriceUsd * item.quantity
              return {
                itemId: item.itemId,
                quantity: item.quantity,
                unitPriceUsd: toDecimal(item.unitPriceUsd),
                unitPriceLyd: toDecimal(item.unitPriceUsd * exchangeRate),
                totalUsd: toDecimal(totalUsdItem),
                totalLyd: toDecimal(totalUsdItem * exchangeRate),
              }
            }),
          },
        },
        include: { items: true },
      })

      return po
    }, { timeout: 30000 })
  }

  /**
   * استلام أمر شراء وتحويله إلى فاتورة شراء
   * يوزع تكلفة الوصول (شحن + جمارك + تأمين) على الأصناف
   */
  async receivePurchaseOrder(
    poId: number,
    data: {
      companyId: number
      warehouseId: number
      treasuryId?: number
      receiveDate: Date
      shippingCost?: number
      customsCost?: number
      insuranceCost?: number
      otherCosts?: number
      paidAmount?: number
      createdBy?: number
      items?: Array<{ itemId: number; serialNumbers: string[] }>
    }
  ) {
    const {
      companyId,
      warehouseId,
      treasuryId,
      receiveDate,
      shippingCost = 0,
      customsCost = 0,
      insuranceCost = 0,
      otherCosts = 0,
      paidAmount,
      createdBy,
      items: serialItems = [],
    } = data

    return prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: poId },
        include: { items: true, party: true },
      })
      if (!po) throw new Error('أمر الشراء غير موجود')
      if (po.status === 'cancelled') throw new Error('أمر الشراء ملغي')
      if (po.status === 'received') throw new Error('أمر الشراء تم استلامه مسبقاً')

      const exchangeRate = po.exchangeRate.toNumber()
      const isUsd = po.currency === 'USD'
      const rate = exchangeRate || 1
      const toLyd = (v: number) => (isUsd ? v * rate : v)
      const landedCosts = shippingCost + customsCost + insuranceCost + otherCosts

      // حساب التوزيع: توزيع تكلفة الوصول حسب قيمة كل صنف
      const subtotalUsd = po.totalAmountUsd.toNumber() - landedCosts + po.shippingCost.toNumber()
      const allocatableBase = po.items.reduce((s, i) => s + i.totalUsd.toNumber(), 0)

      // إنشاء فاتورة الشراء
      const invoiceNumber = generateNumber('PINV', await sequenceService.next(companyId, 'PINV', tx))

      const totalUsd = po.totalAmountUsd.toNumber() + landedCosts
      const totalLyd = totalUsd * exchangeRate
      const paidLyd = toLyd(paidAmount ?? 0)

      const invoice = await tx.purchaseInvoice.create({
        data: {
          companyId,
          branchId: po.branchId ?? undefined,
          invoiceNumber,
          invoiceDate: receiveDate,
          partyId: po.partyId,
          warehouseId,
          treasuryId,
          purchaseOrderId: poId,
          currency: po.currency,
          exchangeRate: po.exchangeRate,
          subtotal: toDecimal(totalUsd - landedCosts),
          shippingCost: toDecimal(shippingCost),
          customsCost: toDecimal(customsCost),
          total: toDecimal(totalLyd),
          paidAmount: toDecimal(paidLyd),
          paymentStatus: paidLyd >= totalLyd ? 'paid' : paidLyd > 0 ? 'partial' : 'unpaid',
          status: 'posted',
          notes: `استلام أمر شراء ${po.poNumber}`,
          createdBy,
        },
      })

      // معالجة الأصناف
      for (const poItem of po.items) {
        const itemData = await tx.item.findUnique({ where: { id: poItem.itemId } })
        if (!itemData) continue

        // حصة الصنف من تكلفة الوصول
        const shareRatio = allocatableBase > 0 ? poItem.totalUsd.toNumber() / allocatableBase : 0
        const landedShare = landedCosts * shareRatio
        const unitCostUsd = poItem.unitPriceUsd.toNumber() + landedShare / poItem.quantity.toNumber()
        const unitCostLyd = unitCostUsd * exchangeRate

        // سطر فاتورة الشراء
        const pItem = await tx.purchaseInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            itemId: poItem.itemId,
            quantity: poItem.quantity,
            unitPriceUsd: toDecimal(poItem.unitPriceUsd.toNumber()),
            unitPrice: toDecimal(poItem.unitPriceUsd.toNumber() * exchangeRate),
            landedCost: toDecimal(landedShare),
            unitCost: toDecimal(unitCostLyd),
            total: poItem.totalLyd,
          },
        })

        // تحديث سعر الشراء والمخزون — الامتصاص: قيمة المخزون (مع التالف) تُوزّع على الصالح فقط
        const newAvg = absorbedAverageCost(
          itemData.currentStock.toNumber(),
          itemData.damagedStock.toNumber(),
          itemData.costPrice.toNumber(),
          poItem.quantity.toNumber(),
          unitCostLyd
        )

        await tx.item.update({
          where: { id: poItem.itemId },
          data: {
            costPrice: toDecimal(newAvg),
            purchasePriceUsd: poItem.unitPriceUsd,
            purchasePrice: toDecimal(poItem.unitPriceUsd.toNumber() * exchangeRate),
          },
        })

        // تسجيل حركة المخزون
        await inventoryService.recordMovement({
          companyId,
          movementDate: receiveDate,
          movementType: 'purchase',
          referenceType: 'purchase_invoice',
          referenceId: invoice.id,
          itemId: poItem.itemId,
          warehouseId,
          quantity: poItem.quantity.toNumber(),
          unitCost: unitCostLyd,
          notes: invoiceNumber,
          createdBy,
        }, tx)

        // الأرقام التسلسلية المستلمة
        const serialItem = serialItems.find((si) => si.itemId === poItem.itemId)
        if (serialItem && serialItem.serialNumbers.length > 0) {
          await inventoryService.registerSerials({
            companyId,
            itemId: poItem.itemId,
            warehouseId,
            serialNumbers: serialItem.serialNumbers,
            costPrice: unitCostLyd,
            purchaseItemId: pItem.id,
          }, tx)
        }
      }

      // القيد المحاسبي: مدين المخزون، دائن المورد/الخزينة
      const lines: any[] = []
      const defaultInventoryAccount = await tx.account.findFirst({
        where: { companyId, accountType: 'asset', accountCode: { startsWith: '1102' } },
      })
      const vendorAccount = po.party.accountId
        ? await tx.account.findUnique({ where: { id: po.party.accountId } })
        : await tx.account.findFirst({
            where: { companyId, accountType: 'liability', accountCode: { startsWith: '2101' } },
          })

      if (defaultInventoryAccount) {
        lines.push({
          accountId: defaultInventoryAccount.id,
          description: `فاتورة شراء ${invoiceNumber}`,
          debit: toDecimal(totalLyd),
        })
      }

      // دفعة مقدمة أو استحقاق للمورد
      if (paidLyd > 0 && treasuryId) {
        const treasury = await tx.treasury.findUnique({ where: { id: treasuryId } })
        if (treasury) {
          // تحقق ملكية الفرع
          if (po.branchId && treasury.branchId && treasury.branchId !== po.branchId) {
            throw new Error('الخزينة لا تتبع فرع المستخدم')
          }
          if (treasury.accountId) {
            lines.push({
              accountId: treasury.accountId,
              description: `دفعة فاتورة شراء ${invoiceNumber}`,
              credit: toDecimal(paidLyd),
            })
            if (totalLyd > paidLyd && vendorAccount) {
              lines.push({
                accountId: vendorAccount.id,
                description: `رصيد مستحق للمورد ${po.party.partyName}`,
                credit: toDecimal(totalLyd - paidLyd),
                partyId: po.partyId,
              })
            }
          }
        }
      } else if (vendorAccount) {
        lines.push({
          accountId: vendorAccount.id,
          description: `استحقاق للمورد ${po.party.partyName}`,
          credit: toDecimal(totalLyd),
          partyId: po.partyId,
        })
      }

      if (lines.length > 0) {
        const entry = await accountingService.createJournalEntry({
          companyId,
          entryDate: receiveDate,
          entryType: JOURNAL_TYPES.PURCHASE,
          referenceType: 'purchase_invoice',
          referenceId: invoice.id,
          description: `فاتورة شراء ${invoiceNumber}`,
          currency: po.currency,
          exchangeRate,
          createdBy,
          lines,
        }, tx)
        await tx.purchaseInvoice.update({
          where: { id: invoice.id },
          data: { journalEntryId: entry.id },
        })
      }

      // تحديث حالة أمر الشراء
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'received',
          actualArrival: receiveDate,
        },
      })

      return tx.purchaseInvoice.findUnique({
        where: { id: invoice.id },
        include: { items: true, party: true },
      })
    }, { timeout: 30000 })
  }

  /**
   * شراء مباشر (بدون أمر شراء)
   */
  async createDirectPurchase(data: {
    companyId: number
    branchId?: number | null
    partyId: number
    warehouseId: number
    treasuryId?: number
    payType?: string
    bankingService?: string
    invoiceDate: Date
    currency: string
    exchangeRate: number
    shippingCost?: number
    customsCost?: number
    discount?: number
    paidAmount?: number
    notes?: string
    createdBy?: number
    items: Array<{
      itemId: number
      quantity: number
      unitPrice: number // سعر الوحدة بالعملة المختارة
      unitPriceUsd?: number // سعر الوحدة بالدولار (اختياري — يُستخدم مباشرة إن وُجد)
      unitPriceLyd?: number // سعر الوحدة بالدينار (اختياري — يُستخدم مباشرة إن وُجد)
      serialNumbers?: string[]
    }>
  }) {
    const {
      companyId,
      branchId,
      partyId,
      warehouseId,
      treasuryId,
      payType,
      bankingService,
      invoiceDate,
      currency,
      exchangeRate,
      shippingCost = 0,
      customsCost = 0,
      discount = 0,
      paidAmount,
      notes,
      createdBy,
      items,
    } = data

    return prisma.$transaction(async (tx) => {
      const isUsd = currency === 'USD'
      const rate = exchangeRate || 1

      // سعر الصنف بالدولار/الدينار/العملة المختارة — تُستخدم الأسعار المدخلة مباشرة إن وُجدت
      const lineUsd = (i: (typeof items)[number]) =>
        i.unitPriceUsd ?? (isUsd ? i.unitPrice : i.unitPrice / rate)
      const lineLyd = (i: (typeof items)[number]) => i.unitPriceLyd ?? lineUsd(i) * rate
      const lineCurr = (i: (typeof items)[number]) => (isUsd ? lineUsd(i) : lineLyd(i))
      const toLyd = (v: number) => (isUsd ? v * rate : v)

      const subtotalCurr = items.reduce((s, i) => s + lineCurr(i) * i.quantity, 0)
      const subtotalLyd = items.reduce((s, i) => s + lineLyd(i) * i.quantity, 0)
      const totalCurr = subtotalCurr - (discount ?? 0) + (shippingCost ?? 0) + (customsCost ?? 0)
      const totalLyd =
        subtotalLyd - toLyd(discount ?? 0) + toLyd(shippingCost ?? 0) + toLyd(customsCost ?? 0)
      const paidLyd = toLyd(paidAmount ?? 0)

      const invoiceNumber = generateNumber('PINV', await sequenceService.next(companyId, 'PINV', tx))

      const invoice = await tx.purchaseInvoice.create({
        data: {
          companyId,
          branchId: branchId ?? undefined,
          invoiceNumber,
          invoiceDate,
          partyId,
          warehouseId,
          treasuryId,
          payType: payType || null,
          bankingService: bankingService || null,
          currency,
          exchangeRate: toDecimal(exchangeRate, 6),
          subtotal: toDecimal(subtotalCurr),
          shippingCost: toDecimal(shippingCost),
          customsCost: toDecimal(customsCost),
          discount: toDecimal(discount),
          total: toDecimal(totalLyd),
          paidAmount: toDecimal(paidLyd),
          paymentStatus: paidLyd >= totalLyd ? 'paid' : paidLyd > 0 ? 'partial' : 'unpaid',
          status: 'posted',
          notes,
          createdBy,
        },
      })

      const landedCostsLyd = toLyd((shippingCost ?? 0) + (customsCost ?? 0))

      for (const item of items) {
        const itemData = await tx.item.findUnique({ where: { id: item.itemId } })
        if (!itemData) continue

        const unitPriceUsd = lineUsd(item)
        const unitPriceLyd = lineLyd(item)

        const shareRatio = subtotalCurr > 0 ? (lineCurr(item) * item.quantity) / subtotalCurr : 0
        const landedShareLyd = landedCostsLyd * shareRatio
        const unitCostLyd = unitPriceLyd + (item.quantity > 0 ? landedShareLyd / item.quantity : 0)

        await tx.purchaseInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            itemId: item.itemId,
            quantity: item.quantity,
            unitPriceUsd: toDecimal(unitPriceUsd),
            unitPrice: toDecimal(unitPriceLyd),
            landedCost: toDecimal(landedShareLyd),
            unitCost: toDecimal(unitCostLyd),
            total: toDecimal(unitPriceLyd * item.quantity),
          },
        })

        const newAvg = absorbedAverageCost(
          itemData.currentStock.toNumber(),
          itemData.damagedStock.toNumber(),
          itemData.costPrice.toNumber(),
          item.quantity,
          unitCostLyd
        )
        await tx.item.update({
          where: { id: item.itemId },
          data: { costPrice: toDecimal(newAvg) },
        })

        await inventoryService.recordMovement({
          companyId,
          movementDate: invoiceDate,
          movementType: 'purchase',
          referenceType: 'purchase_invoice',
          referenceId: invoice.id,
          itemId: item.itemId,
          warehouseId,
          quantity: item.quantity,
          unitCost: unitCostLyd,
          notes: invoiceNumber,
          createdBy,
        }, tx)

        // الأرقام التسلسلية
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          const pItem = await tx.purchaseInvoiceItem.findFirst({
            where: { invoiceId: invoice.id, itemId: item.itemId },
          })
          await inventoryService.registerSerials({
            companyId,
            itemId: item.itemId,
            warehouseId,
            serialNumbers: item.serialNumbers,
            costPrice: unitCostLyd,
            purchaseItemId: pItem?.id,
          }, tx)
        }
      }

      // القيد المحاسبي
      const lines: any[] = []
      const defaultInventoryAccount = await tx.account.findFirst({
        where: { companyId, accountType: 'asset', accountCode: { startsWith: '1102' } },
      })
      const party = await tx.party.findUnique({ where: { id: partyId } })
      const vendorAccount = party?.accountId
        ? await tx.account.findUnique({ where: { id: party.accountId } })
        : await tx.account.findFirst({
            where: { companyId, accountType: 'liability', accountCode: { startsWith: '2101' } },
          })

      if (defaultInventoryAccount) {
        lines.push({
          accountId: defaultInventoryAccount.id,
          description: `فاتورة شراء ${invoiceNumber}`,
          debit: toDecimal(totalLyd),
        })
      }

      if (paidLyd > 0 && treasuryId) {
        const treasury = await tx.treasury.findUnique({ where: { id: treasuryId } })
        if (treasury) {
          // تحقق ملكية الفرع
          if (branchId && treasury.branchId && treasury.branchId !== branchId) {
            throw new Error('الخزينة لا تتبع فرع المستخدم')
          }
          if (treasury.accountId) {
            lines.push({
              accountId: treasury.accountId,
              description: `دفعة فاتورة شراء ${invoiceNumber}`,
              credit: toDecimal(paidLyd),
            })
            if (totalLyd > paidLyd && vendorAccount) {
              lines.push({
                accountId: vendorAccount.id,
                description: `رصيد مستحق للمورد`,
                credit: toDecimal(totalLyd - paidLyd),
                partyId,
              })
            }
          }
        }
      } else if (vendorAccount) {
        lines.push({
          accountId: vendorAccount.id,
          description: `استحقاق للمورد`,
          credit: toDecimal(totalLyd),
          partyId,
        })
      }

      if (lines.length > 0) {
        const entry = await accountingService.createJournalEntry({
          companyId,
          entryDate: invoiceDate,
          entryType: JOURNAL_TYPES.PURCHASE,
          referenceType: 'purchase_invoice',
          referenceId: invoice.id,
          description: `فاتورة شراء ${invoiceNumber}`,
          currency,
          exchangeRate,
          createdBy,
          lines,
        }, tx)
        await tx.purchaseInvoice.update({
          where: { id: invoice.id },
          data: { journalEntryId: entry.id },
        })
      }

      return tx.purchaseInvoice.findUnique({
        where: { id: invoice.id },
        include: { items: { include: { item: true } }, party: true },
      })
    }, { timeout: 30000 })
  }
}

export const purchaseService = new PurchaseService()
