import { prisma } from '../config/database'
import { generateNumber, toDecimal } from '../../../shared/utils'
import { sequenceService } from './sequenceService'

const round3 = (n: number) => Math.round(n * 1000) / 1000

// خدمة التسوية البنكية: مطابقة حركات الحساب البنكي للشركة مع كشف المصرف
export class ReconciliationService {
  /**
   * سندات خزينة بنكية خلال فترة + الرصيد الافتتاحي + رصيد تراكمي لكل سند
   */
  async getBankTransactions(
    companyId: number,
    treasuryId: number,
    from?: Date,
    to?: Date
  ) {
    const treasury = await prisma.treasury.findFirst({
      where: { id: treasuryId, companyId, treasuryType: 'bank', isActive: true },
    })
    if (!treasury) throw new Error('الخزينة البنكية غير موجودة')

    const fromDate = from || new Date(0)
    const toDate = to || new Date()

    const [before, receipts] = await Promise.all([
      prisma.receipt.findMany({
        where: { companyId, treasuryId, receiptDate: { lt: fromDate } },
        select: { receiptType: true, amount: true },
      }),
      prisma.receipt.findMany({
        where: { companyId, treasuryId, receiptDate: { gte: fromDate, lte: toDate } },
        include: { party: true },
        orderBy: { receiptDate: 'asc' },
      }),
    ])

    const openingBalance = round3(
      treasury.openingBalance.toNumber() +
        before.reduce(
          (s, r) => s + (r.receiptType === 'receipt' ? r.amount.toNumber() : -r.amount.toNumber()),
          0
        )
    )

    let running = openingBalance
    const transactions = receipts.map((r) => {
      const signed = r.receiptType === 'receipt' ? r.amount.toNumber() : -r.amount.toNumber()
      running += signed
      return { ...r, signed, runningBalance: round3(running) }
    })

    return {
      treasury,
      openingBalance,
      currentBalance: treasury.currentBalance.toNumber(),
      closingSystemBalance: round3(running),
      totalReceipts: receipts.filter((r) => r.receiptType === 'receipt').length,
      totalPayments: receipts.filter((r) => r.receiptType === 'payment').length,
      transactions,
    }
  }

  /**
   * إنشاء تسوية بنكية: يثبت السندات المطابقة ويحسب رصيد النظام والفرق
   */
  async createReconciliation(data: {
    companyId: number
    treasuryId: number
    branchId?: number
    from: Date
    statementDate: Date
    openingBalance: number
    statementBalance: number
    matchedReceiptIds: number[]
    notes?: string
    createdBy?: number
  }) {
    const {
      companyId,
      treasuryId,
      branchId,
      from,
      statementDate,
      openingBalance,
      statementBalance,
      matchedReceiptIds = [],
      notes,
      createdBy,
    } = data

    return prisma.$transaction(async (tx) => {
      const treasury = await tx.treasury.findFirst({
        where: { id: treasuryId, companyId, treasuryType: 'bank' },
      })
      if (!treasury) throw new Error('الخزينة البنكية غير موجودة')

      // السندات داخل فترة التسوية
      const periodReceipts = await tx.receipt.findMany({
        where: { companyId, treasuryId, receiptDate: { gte: from, lte: statementDate } },
        orderBy: { receiptDate: 'asc' },
      })

      const matchedSet = new Set(matchedReceiptIds)
      const systemBalance = round3(
        openingBalance +
          periodReceipts
            .filter((r) => matchedSet.has(r.id))
            .reduce(
              (s, r) => s + (r.receiptType === 'receipt' ? r.amount.toNumber() : -r.amount.toNumber()),
              0
            )
      )

      const difference = round3(statementBalance - systemBalance)
      const reconNumber = generateNumber(
        'RC',
        await sequenceService.next(companyId, 'RC', tx)
      )

      const reconciliation = await tx.bankReconciliation.create({
        data: {
          companyId,
          branchId: branchId ?? treasury.branchId ?? undefined,
          treasuryId,
          reconNumber,
          statementDate,
          openingBalance: toDecimal(openingBalance),
          statementBalance: toDecimal(statementBalance),
          systemBalance: toDecimal(systemBalance),
          difference: toDecimal(difference),
          status: Math.abs(difference) < 0.01 ? 'matched' : 'draft',
          notes,
          createdBy,
          lines: {
            create: periodReceipts.map((r) => ({
              receiptId: r.id,
              isMatched: matchedSet.has(r.id),
            })),
          },
        },
        include: {
          treasury: true,
          lines: { include: { receipt: { include: { party: true } } } },
        },
      })

      return reconciliation
    })
  }

  /**
   * قائمة التسويات السابقة
   */
  async list(companyId: number, branchId?: number) {
    const where: any = { companyId }
    if (branchId) where.branchId = branchId
    return prisma.bankReconciliation.findMany({
      where,
      include: {
        treasury: true,
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * تفاصيل تسوية واحدة (مع السندات والطرف)
   */
  async get(companyId: number, id: number) {
    const reconciliation = await prisma.bankReconciliation.findFirst({
      where: { id, companyId },
      include: {
        treasury: true,
        lines: {
          include: { receipt: { include: { party: true } } },
          orderBy: { receipt: { receiptDate: 'asc' } },
        },
      },
    })
    if (!reconciliation) throw new Error('التسوية غير موجودة')
    return reconciliation
  }

  /**
   * تأكيد إغلاق التسوية
   */
  async complete(companyId: number, id: number) {
    const updated = await prisma.bankReconciliation.updateMany({
      where: { id, companyId },
      data: { status: 'completed' },
    })
    if (updated.count === 0) throw new Error('التسوية غير موجودة')
    return this.get(companyId, id)
  }
}

export const reconciliationService = new ReconciliationService()
