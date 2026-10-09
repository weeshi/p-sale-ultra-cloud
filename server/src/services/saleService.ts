import { prisma } from '../config/database'
import { accountingService } from './accountingService'
import { inventoryService } from './inventoryService'
import { generateNumber, toDecimal } from '../../../shared/utils'
import { sequenceService } from './sequenceService'
import { JOURNAL_TYPES, MOVEMENT_TYPES, PAYMENT_STATUS, SERIAL_STATUS } from '../../../shared/constants'

// Helper: validate that a resource belongs to the user's branch (or user has canViewAllBranches)
async function validateBranchOwnership(tx: any, resourceType: 'warehouse' | 'treasury', resourceId: number, branchId: number | null | undefined): Promise<void> {
  if (!branchId) return // No branch restriction (super admin or global user)
  
  let resourceBranchId: number | null = null
  
  switch (resourceType) {
    case 'warehouse':
      const warehouse = await tx.warehouse.findUnique({ where: { id: resourceId }, select: { branchId: true } })
      if (!warehouse) throw new Error(`المخزن رقم ${resourceId} غير موجود`)
      resourceBranchId = warehouse.branchId
      break
    case 'treasury':
      const treasury = await tx.treasury.findUnique({ where: { id: resourceId }, select: { branchId: true } })
      if (!treasury) throw new Error(`الخزينة رقم ${resourceId} غير موجودة`)
      resourceBranchId = treasury.branchId
      break
  }
  
  if (resourceBranchId !== null && resourceBranchId !== branchId) {
    throw new Error(`${resourceType === 'warehouse' ? 'المخزن' : 'الخزينة'} لا يتبع فرع المستخدم`)
  }
}

// خدمة المبيعات: إنشاء الفواتير مع القيود المحاسبية وتحديث المخزون
export class SaleService {
  /**
   * إنشاء فاتورة بيع
   * ينشئ تلقائياً: قيد الإيراد + قيد التكلفة + تحديث المخزون + الأرقام التسلسلية + الضمان
   */
  async createSaleInvoice(data: {
    companyId: number
    branchId?: number
    warehouseId: number
    invoiceDate: Date
    partyId?: number
    treasuryId?: number
    payType?: string
    bankingService?: string
    invoiceType?: string
    subtotal?: number
    taxRate?: number
    discount?: number
    paidAmount?: number
    notes?: string
    createdBy?: number
    items: Array<{
      itemId: number
      quantity: number
      unitPrice: number
      discount?: number
      serialNumbers?: string[]
      returnAsDamaged?: boolean
    }>
  }) {
    const {
      companyId,
      branchId,
      warehouseId,
      invoiceDate,
      partyId,
      treasuryId,
      payType,
      bankingService,
      invoiceType = 'sale',
      taxRate = 0,
      discount = 0,
      paidAmount,
      notes,
      createdBy,
      items,
    } = data

    // أصناف مرتجع تحمل إشارة "إعادة كتالف": تُرجع للتالف بدلاً من الصالح
    const returnAsDamagedItemIds = new Set(
      invoiceType === 'return'
        ? items.filter((i) => i.returnAsDamaged).map((i) => i.itemId)
        : []
    )

    return prisma.$transaction(async (tx) => {
      // Validate branch ownership for resources
      await validateBranchOwnership(tx, 'warehouse', warehouseId, branchId)
      if (treasuryId) await validateBranchOwnership(tx, 'treasury', treasuryId, branchId)
      
      // حساب الإجماليات
      const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
      const taxAmount = (subtotal - discount) * (taxRate / 100)
      const total = subtotal - discount + taxAmount
      const paid = paidAmount ?? total

      // توليد رقم الفاتورة (آمن ضد التزامن)
      const invoiceNumber = generateNumber(
        invoiceType === 'return' ? 'RET' : 'INV',
        await sequenceService.next(companyId, invoiceType === 'return' ? 'RET' : 'INV', tx)
      )

      // إنشاء الفاتورة
      const invoice = await tx.saleInvoice.create({
        data: {
          companyId,
          branchId,
          warehouseId,
          invoiceNumber,
          invoiceDate,
          partyId,
          treasuryId,
          payType: payType || null,
          bankingService: bankingService || null,
          invoiceType,
          subtotal: toDecimal(subtotal),
          taxRate,
          taxAmount: toDecimal(taxAmount),
          discount: toDecimal(discount),
          total: toDecimal(total),
          paidAmount: toDecimal(paid),
          paymentStatus:
            paid >= total ? PAYMENT_STATUS.PAID : paid > 0 ? PAYMENT_STATUS.PARTIAL : PAYMENT_STATUS.UNPAID,
          notes,
          createdBy,
          items: {
            create: items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: toDecimal(item.unitPrice),
              discount: toDecimal(item.discount || 0),
              total: toDecimal(item.unitPrice * item.quantity - (item.discount || 0)),
            })),
          },
        },
        include: { items: true },
      })

      // القيود المحاسبية
      const saleItems = await tx.saleInvoiceItem.findMany({
        where: { invoiceId: invoice.id },
        include: { item: true },
      })

      // قيد الإيراد: مدين العميل/الخزينة، دائن الإيراد
      const salesLines: any[] = []

      if (partyId) {
        const party = await tx.party.findUnique({ where: { id: partyId } })
        if (party?.accountId) {
          salesLines.push({
            accountId: party.accountId,
            description: `فاتورة بيع ${invoiceNumber}`,
            debit: toDecimal(total),
            partyId,
          })
        } else {
          // حساب العميل الافتراضي
          const defaultAccount = await tx.account.findFirst({
            where: { companyId, accountType: 'asset', accountCode: { startsWith: '1101' } },
          })
          if (defaultAccount) {
            salesLines.push({
              accountId: defaultAccount.id,
              description: `فاتورة بيع ${invoiceNumber}`,
              debit: toDecimal(total),
              partyId,
            })
          }
        }
      } else if (treasuryId) {
        const treasury = await tx.treasury.findUnique({ where: { id: treasuryId } })
        if (treasury) {
          // تحقق ملكية الفرع
          if (branchId && treasury.branchId && treasury.branchId !== branchId) {
            throw new Error('الخزينة لا تتبع فرع المستخدم')
          }
          if (treasury.accountId) {
            salesLines.push({
              accountId: treasury.accountId,
              description: `فاتورة بيع نقدي ${invoiceNumber}`,
              debit: toDecimal(paid),
            })
            if (paid < total) {
              const defaultAccount = await tx.account.findFirst({
                where: { companyId, accountType: 'asset', accountCode: { startsWith: '1101' } },
              })
              if (defaultAccount) {
                salesLines.push({
                  accountId: defaultAccount.id,
                  description: `رصيد فاتورة ${invoiceNumber}`,
                  debit: toDecimal(total - paid),
                })
              }
            }
          }
        }
      }

      // دائن الإيراد (حسب الصنف)
      for (const si of saleItems) {
        const salesAccountId =
          si.item.salesAccountId ||
          (await tx.account.findFirst({
            where: { companyId, accountType: 'revenue', accountCode: { startsWith: '4101' } },
          }))?.id
        if (salesAccountId) {
          salesLines.push({
            accountId: salesAccountId,
            description: `${si.item.itemName} - فاتورة ${invoiceNumber}`,
            credit: toDecimal(si.total.toNumber()),
          })
        }
      }

      const saleEntry = await accountingService.createJournalEntry({
        companyId,
        entryDate: invoiceDate,
        entryType: JOURNAL_TYPES.SALE,
        referenceType: invoiceType === 'return' ? 'sale_return' : 'sale_invoice',
        referenceId: invoice.id,
        branchId,
        description: invoiceType === 'return' ? `مرتجع بيع ${invoiceNumber}` : `فاتورة بيع ${invoiceNumber}`,
        currency: 'LYD',
        exchangeRate: 1,
        createdBy,
        lines: salesLines,
      }, tx)

      await tx.saleInvoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: saleEntry.id },
      })

      // قيد التكلفة + تحديث المخزون
      const cogsLines: any[] = []
      const defaultInventoryAccount = await tx.account.findFirst({
        where: { companyId, accountType: 'asset', accountCode: { startsWith: '1102' } },
      })
      const defaultCogsAccount = await tx.account.findFirst({
        where: { companyId, accountType: 'expense', accountCode: { startsWith: '5101' } },
      })

      for (const si of saleItems) {
        const costPrice = si.item.costPrice.toNumber()
        const cogsTotal = costPrice * si.quantity.toNumber()
        const isDamagedReturn = returnAsDamagedItemIds.has(si.itemId)

        // تحديث المخزون
        const stock = await tx.stock.findUnique({
          where: {
            itemId_warehouseId: {
              itemId: si.itemId,
              warehouseId,
            },
          },
        })
        if (
          !isDamagedReturn &&
          (!stock || stock.quantity.toNumber() - (stock.damagedStock?.toNumber() ?? 0) < si.quantity.toNumber())
        ) {
          throw new Error(`الكمية غير كافية للصنف: ${si.item.itemName}`)
        }

        await inventoryService.recordMovement({
          companyId,
          movementDate: invoiceDate,
          movementType: isDamagedReturn
            ? MOVEMENT_TYPES.RETURN_DAMAGED
            : invoiceType === 'return'
              ? MOVEMENT_TYPES.RETURN
              : MOVEMENT_TYPES.SALE,
          referenceType: 'sale_invoice',
          referenceId: invoice.id,
          itemId: si.itemId,
          warehouseId,
          quantity: invoiceType === 'return' ? si.quantity.toNumber() : -si.quantity.toNumber(),
          unitCost: costPrice,
          notes: invoiceNumber,
          createdBy,
        }, tx)

        // تحديث تكلفة الصنف في سطر الفاتورة
        await tx.saleInvoiceItem.update({
          where: { id: si.id },
          data: { costPrice: toDecimal(costPrice) },
        })

        // إضافة سطر قيد التكلفة
        const inventoryAccountId = si.item.inventoryAccountId || defaultInventoryAccount?.id
        const cogsAccountId = si.item.cogsAccountId || defaultCogsAccount?.id
        if (inventoryAccountId && cogsAccountId) {
          if (invoiceType === 'return') {
            cogsLines.push(
              { accountId: inventoryAccountId, description: `مرتجع ${si.item.itemName}`, debit: toDecimal(cogsTotal) },
              { accountId: cogsAccountId, description: `مرتجع ${si.item.itemName}`, credit: toDecimal(cogsTotal) }
            )
          } else {
            cogsLines.push(
              { accountId: cogsAccountId, description: `تكلفة ${si.item.itemName}`, debit: toDecimal(cogsTotal) },
              { accountId: inventoryAccountId, description: `تكلفة ${si.item.itemName}`, credit: toDecimal(cogsTotal) }
            )
          }
        }

        // معالجة الأرقام التسلسلية تتم أدناه عبر serialNumbers
      }

      if (cogsLines.length > 0) {
        await accountingService.createJournalEntry({
          companyId,
          entryDate: invoiceDate,
          entryType: JOURNAL_TYPES.COGS,
          referenceType: invoiceType === 'return' ? 'sale_return' : 'sale_invoice',
          referenceId: invoice.id,
          branchId,
          description: `تكلفة البضاعة المباعة - ${invoiceNumber}`,
          currency: 'LYD',
          exchangeRate: 1,
          createdBy,
          lines: cogsLines,
        }, tx)
      }

      // معالجة الأرقام التسلسلية للفواتير
      const saleItemByItemId = new Map(saleItems.map((si) => [si.itemId, si]))
      for (const item of items) {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          const dbItem = saleItemByItemId.get(item.itemId)
          await inventoryService.updateSerialsStatus({
            serialNumbers: item.serialNumbers,
            status: invoiceType === 'return' ? SERIAL_STATUS.IN_STOCK : SERIAL_STATUS.SOLD,
            fromStatus: SERIAL_STATUS.IN_STOCK,
            soldAt: invoiceType === 'return' ? null : invoiceDate,
            saleItemId: invoiceType === 'return' ? null : dbItem?.id ?? null,
            warehouseId: invoiceType === 'return' ? warehouseId : null,
          }, tx)
        }
      }

      // إنشاء الضمان للأجهزة المباعة
      if (invoiceType === 'sale') {
        const warrantyItems = await tx.saleInvoiceItem.findMany({
          where: { invoiceId: invoice.id },
          include: { item: true },
        })
        for (const si of warrantyItems) {
          if (si.item.trackSerial) {
            const serials = await tx.serial.findMany({
              where: { saleItemId: si.id },
            })
            for (const serial of serials) {
              await tx.warranty.create({
                data: {
                  companyId,
                  warrantyNumber: generateNumber('WRN', await sequenceService.next(companyId, 'WRN', tx)),
                  serialId: serial.id,
                  saleInvoiceId: invoice.id,
                  partyId,
                  startDate: invoiceDate,
                  endDate: new Date(invoiceDate.getTime() + 365 * 24 * 60 * 60 * 1000),
                  warrantyType: 'store',
                },
              })
            }
          }
        }
      }

      return tx.saleInvoice.findUnique({
        where: { id: invoice.id },
        include: { items: { include: { item: true } }, party: true },
      })
    })
  }

  /**
   * إنشاء فاتورة عرض (Quote)
   */
  async createQuote(data: {
    companyId: number
    quoteDate: Date
    partyId?: number
    branchId?: number
    validUntil?: Date
    notes?: string
    createdBy?: number
    items: Array<{
      itemId: number
      quantity: number
      unitPrice: number
      discount?: number
    }>
  }) {
    const { companyId, quoteDate, partyId, branchId, validUntil, notes, createdBy, items } = data

    return prisma.$transaction(async (tx) => {
      const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
      const quoteNumber = generateNumber('QOT', await sequenceService.next(companyId, 'QOT', tx))

      const quote = await tx.quote.create({
        data: {
          companyId,
          quoteNumber,
          quoteDate,
          partyId,
          branchId,
          validUntil,
          subtotal: toDecimal(subtotal),
          total: toDecimal(subtotal),
          notes,
          createdBy,
          items: {
            create: items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: toDecimal(item.unitPrice),
              discount: toDecimal(item.discount || 0),
              total: toDecimal(item.unitPrice * item.quantity - (item.discount || 0)),
            })),
          },
        },
        include: { items: { include: { item: true } }, party: true },
      })

      return quote
    })
  }

  /**
   * تحويل فاتورة عرض إلى فاتورة بيع
   */
  async convertQuoteToInvoice(quoteId: number, warehouseId: number, treasuryId?: number, createdBy?: number) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { items: true },
    })
    if (!quote) throw new Error('عرض السعر غير موجود')

    const invoice = await this.createSaleInvoice({
      companyId: quote.companyId,
      branchId: quote.branchId ?? undefined,
      warehouseId,
      invoiceDate: new Date(),
      partyId: quote.partyId ?? undefined,
      treasuryId,
      subtotal: quote.subtotal.toNumber(),
      discount: quote.discount.toNumber(),
      notes: `تحويل من عرض ${quote.quoteNumber}`,
      createdBy,
      items: quote.items.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity.toNumber(),
        unitPrice: item.unitPrice.toNumber(),
        discount: item.discount.toNumber(),
      })),
    })

    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'converted', saleInvoiceId: invoice?.id },
    })

    return invoice
  }
}

export const saleService = new SaleService()
