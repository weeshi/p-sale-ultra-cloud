import { prisma } from '../config/database'
import { accountingService } from './accountingService'
import { generateNumber, toDecimal } from '../../../shared/utils'
import { sequenceService } from './sequenceService'
import { JOURNAL_TYPES } from '../../../shared/constants'

// خدمة الخزينة: سندات القبض والصرف
export class TreasuryService {
  /**
   * إنشاء سند قبض أو صرف
   */
  async createReceipt(data: {
    companyId: number
    receiptDate: Date
    receiptType: 'receipt' | 'payment'
    partyId?: number
    treasuryId: number
    branchId?: number
    currency: string
    exchangeRate: number
    amount: number
    paymentMethod?: string
    checkNumber?: string
    bankName?: string
    referenceNo?: string
    saleInvoiceId?: number
    purchaseInvoiceId?: number
    notes?: string
    createdBy?: number
  }) {
    const {
      companyId,
      receiptDate,
      receiptType,
      partyId,
      treasuryId,
      branchId,
      currency,
      exchangeRate,
      amount,
      paymentMethod = 'cash',
      checkNumber,
      bankName,
      referenceNo,
      saleInvoiceId,
      purchaseInvoiceId,
      notes,
      createdBy,
    } = data

    return prisma.$transaction(async (tx) => {
      const receiptNumber = generateNumber(
        receiptType === 'receipt' ? 'RCV' : 'PAY',
        await sequenceService.next(companyId, receiptType === 'receipt' ? 'RCV' : 'PAY', tx)
      )

      const amountUsd = currency === 'USD' ? amount : amount / exchangeRate
      const amountLyd = currency === 'LYD' ? amount : amount * exchangeRate

      const receipt = await tx.receipt.create({
        data: {
          companyId,
          receiptNumber,
          receiptDate,
          receiptType,
          partyId,
          treasuryId,
          branchId,
          currency,
          exchangeRate: toDecimal(exchangeRate, 6),
          amount: toDecimal(amountLyd),
          amountUsd: toDecimal(amountUsd),
          paymentMethod,
          checkNumber,
          bankName,
          referenceNo,
          saleInvoiceId,
          purchaseInvoiceId,
          notes,
          createdBy,
        },
      })

      // تحديث الخزينة
      const treasury = await tx.treasury.findUnique({ where: { id: treasuryId } })
      if (treasury) {
        await tx.treasury.update({
          where: { id: treasuryId },
          data: {
            currentBalance: {
              increment: receiptType === 'receipt' ? amountLyd : -amountLyd,
            },
          },
        })
      }

      // القيد المحاسبي
      const lines: any[] = []
      const treasuryAccount = treasury?.accountId
        ? await tx.account.findUnique({ where: { id: treasury.accountId } })
        : await tx.account.findFirst({
            where: { companyId, accountType: 'asset', accountCode: { startsWith: '1103' } },
          })

      // سطر الخزينة
      const treasuryAccountId = treasuryAccount?.id
      if (treasuryAccountId) {
        lines.push({
          accountId: treasuryAccountId,
          description: `سند ${receiptType === 'receipt' ? 'قبض' : 'صرف'} ${receiptNumber}`,
          [receiptType === 'receipt' ? 'debit' : 'credit']: toDecimal(amountLyd),
        })
      }

      // سطر الطرف المقابل
      if (partyId) {
        const party = await tx.party.findUnique({ where: { id: partyId } })
        if (party) {
          let partyAccountId = party.accountId
          if (!partyAccountId) {
            const defaultAccount = await tx.account.findFirst({
              where: {
                companyId,
                accountType: 'asset',
                accountCode: { startsWith: '1101' },
              },
            })
            partyAccountId = defaultAccount?.id ?? null
          }
          if (partyAccountId) {
            lines.push({
              accountId: partyAccountId,
              description: `سند ${receiptType === 'receipt' ? 'قبض' : 'صرف'} ${receiptNumber} - ${party.partyName}`,
              [receiptType === 'receipt' ? 'credit' : 'debit']: toDecimal(amountLyd),
              partyId,
            })
          }
        }
      } else {
        // سند عام (مصاريف أو إيرادات أخرى)
        const defaultAccount = await tx.account.findFirst({
          where: {
            companyId,
            accountType: receiptType === 'receipt' ? 'revenue' : 'expense',
          },
        })
        if (defaultAccount) {
          lines.push({
            accountId: defaultAccount.id,
            description: `سند ${receiptType === 'receipt' ? 'قبض' : 'صرف'} ${receiptNumber}`,
            [receiptType === 'receipt' ? 'credit' : 'debit']: toDecimal(amountLyd),
          })
        }
      }

      if (lines.length > 0) {
        const entry = await accountingService.createJournalEntry({
          companyId,
          entryDate: receiptDate,
          entryType: receiptType === 'receipt' ? JOURNAL_TYPES.RECEIPT : JOURNAL_TYPES.PAYMENT,
          referenceType: 'receipt',
          referenceId: receipt.id,
          branchId,
          description: `سند ${receiptType === 'receipt' ? 'قبض' : 'صرف'} ${receiptNumber}`,
          currency,
          exchangeRate,
          createdBy,
          lines,
        }, tx)
        await tx.receipt.update({
          where: { id: receipt.id },
          data: { journalEntryId: entry.id },
        })
      }

      // تحديث رصيد الفاتورة المرتبطة
      if (saleInvoiceId && receiptType === 'receipt') {
        const invoice = await tx.saleInvoice.findUnique({ where: { id: saleInvoiceId } })
        if (invoice) {
          const newPaid = invoice.paidAmount.toNumber() + amountLyd
          await tx.saleInvoice.update({
            where: { id: saleInvoiceId },
            data: {
              paidAmount: toDecimal(newPaid),
              paymentStatus: newPaid >= invoice.total.toNumber() ? 'paid' : 'partial',
            },
          })
        }
      }

      if (purchaseInvoiceId && receiptType === 'payment') {
        const invoice = await tx.purchaseInvoice.findUnique({ where: { id: purchaseInvoiceId } })
        if (invoice) {
          const newPaid = invoice.paidAmount.toNumber() + amountLyd
          await tx.purchaseInvoice.update({
            where: { id: purchaseInvoiceId },
            data: {
              paidAmount: toDecimal(newPaid),
              paymentStatus: newPaid >= invoice.total.toNumber() ? 'paid' : 'partial',
            },
          })
        }
      }

      return tx.receipt.findUnique({
        where: { id: receipt.id },
        include: { party: true, treasury: true },
      })
    })
  }
}

export const treasuryService = new TreasuryService()
