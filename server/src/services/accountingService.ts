import { prisma } from '../config/database'
import { JOURNAL_TYPES } from '../../../shared/constants'
import logger from '../config/logger'
import { Prisma } from '@prisma/client'
import { sequenceService } from './sequenceService'

// الخدمة المحاسبية: تنشئ القيود التلقائية وتحدّث أرصدة الحسابات
export class AccountingService {
  /**
   * إنشاء قيد محاسبي مع تحديث أرصدة الحسابات
   * يقبل tx اختياري للانضمام إلى ترانزاكشن خارجي (يمنع التداخل/الحصار)
   */
  async createJournalEntry(
    data: {
      companyId: number
      entryDate: Date
      entryType: string
      referenceType?: string
      referenceId?: number
      branchId?: number | null
      description?: string
      createdBy?: number
      currency?: string
      exchangeRate?: number
      lines: Array<{
        accountId: number
        description?: string
        debit?: number
        credit?: number
        partyId?: number
        currency?: string
        currencyAmount?: number
      }>
    },
    txClient?: Prisma.TransactionClient
  ) {
    const { lines, currency = 'LYD', exchangeRate = 1, ...header } = data

    const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0)
    const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0)

    // التحقق من توازن القيد (بالدينار الليبي دائماً)
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error('القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن')
    }

    const run = async (tx: Prisma.TransactionClient) => {
      const entryNumber = await sequenceService.next(header.companyId, 'JRN', tx)

      const entry = await tx.journalEntry.create({
        data: {
          ...header,
          currency,
          exchangeRate,
          entryNumber,
          totalDebit,
          totalCredit,
          lines: {
            create: lines.map((line, i) => ({
              lineNumber: i + 1,
              ...line,
            })),
          },
        },
        include: { lines: true },
      })

      // تحديث أرصدة الحسابات
      for (const line of lines) {
        const account = await tx.account.findUnique({
          where: { id: line.accountId },
        })
        if (!account) continue

        await tx.account.update({
          where: { id: line.accountId },
          data: {
            currentBalance:
              account.currentBalance.toNumber() + (line.debit || 0) - (line.credit || 0),
          },
        })
      }

      // تحديث رصيد العميل/المورد إذا كان القيد مرتبطاً بطرف
      for (const line of lines) {
        if (line.partyId) {
          const party = await tx.party.findUnique({ where: { id: line.partyId } })
          if (party) {
            await tx.party.update({
              where: { id: line.partyId },
              data: {
                currentBalance:
                  party.currentBalance.toNumber() + (line.debit || 0) - (line.credit || 0),
              },
            })
          }
        }
      }

      return entry
    }

    if (txClient) return run(txClient)
    return prisma.$transaction((tx) => run(tx), { timeout: 30000 })
  }

  /**
   * عكس قيد محاسبي (للتصحيحات والحذف)
   */
  async reverseJournalEntry(entryId: number, userId: number) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id: entryId },
        include: { lines: true },
      })

      if (!entry) throw new Error('القيد غير موجود')
      if (entry.isReversed) throw new Error('القيد معكوس مسبقاً')

      const entryNumber = await sequenceService.next(entry.companyId, 'JRN', tx)

      const reversedLines = entry.lines.map((line) => ({
        accountId: line.accountId,
        description: `عكس القيد رقم ${entry.entryNumber}: ${line.description || ''}`,
        debit: line.credit?.toNumber() || 0,
        credit: line.debit?.toNumber() || 0,
        partyId: line.partyId,
        currency: line.currency,
        currencyAmount: line.currencyAmount?.toNumber(),
      }))

      const newEntry = await tx.journalEntry.create({
        data: {
          companyId: entry.companyId,
          entryDate: new Date(),
          entryNumber,
          entryType: JOURNAL_TYPES.ADJUSTING,
          description: `عكس القيد رقم ${entry.entryNumber}`,
          currency: entry.currency,
          exchangeRate: entry.exchangeRate,
          totalDebit: entry.totalCredit.toNumber(),
          totalCredit: entry.totalDebit.toNumber(),
          isReversed: false,
          reversedById: entryId,
          createdBy: userId,
          lines: {
            create: reversedLines.map((l, i) => ({ ...l, lineNumber: i + 1 })),
          },
        },
      })

      await tx.journalEntry.update({
        where: { id: entryId },
        data: { isReversed: true, reversedById: newEntry.id },
      })

      // تحديث أرصدة الحسابات (عكس)
      for (const line of entry.lines) {
        const account = await tx.account.findUnique({ where: { id: line.accountId } })
        if (!account) continue
        const debit = line.debit?.toNumber() || 0
        const credit = line.credit?.toNumber() || 0
        await tx.account.update({
          where: { id: line.accountId },
          data: {
            currentBalance: account.currentBalance.toNumber() - debit + credit,
          },
        })
        if (line.partyId) {
          const party = await tx.party.findUnique({ where: { id: line.partyId } })
          if (party) {
            await tx.party.update({
              where: { id: line.partyId },
              data: {
                currentBalance: party.currentBalance.toNumber() - debit + credit,
              },
            })
          }
        }
      }

      return newEntry
    })
  }

  /**
   * دفتر الأستاذ لحساب معين
   */
  async getAccountLedger(accountId: number, companyId: number, from?: Date, to?: Date) {
    const where: any = {
      accountId,
      journalEntry: {
        companyId,
        isPosted: true,
      },
    }
    if (from || to) {
      where.journalEntry.entryDate = {}
      if (from) where.journalEntry.entryDate.gte = from
      if (to) where.journalEntry.entryDate.lte = to
    }

    const lines = await prisma.journalEntryLine.findMany({
      where,
      include: { journalEntry: true },
      orderBy: { journalEntry: { entryDate: 'asc' } },
    })

    const account = await prisma.account.findUnique({ where: { id: accountId } })
    let balance = account?.openingBalance.toNumber() || 0

    const ledger = lines.map((line) => {
      balance += line.debit.toNumber() - line.credit.toNumber()
      return {
        entryNumber: line.journalEntry.entryNumber,
        entryDate: line.journalEntry.entryDate,
        description: line.description || line.journalEntry.description,
        debit: line.debit,
        credit: line.credit,
        balance,
        referenceType: line.journalEntry.referenceType,
        referenceId: line.journalEntry.referenceId,
      }
    })

    return { account, openingBalance: account?.openingBalance.toNumber() || 0, lines: ledger, closingBalance: balance }
  }

  /**
   * كشف حساب عميل/مورد
   */
  async getPartyLedger(partyId: number, companyId: number, from?: Date, to?: Date) {
    const where: any = {
      partyId,
      journalEntry: { companyId, isPosted: true },
    }
    if (from || to) {
      where.journalEntry.entryDate = {}
      if (from) where.journalEntry.entryDate.gte = from
      if (to) where.journalEntry.entryDate.lte = to
    }

    const lines = await prisma.journalEntryLine.findMany({
      where,
      include: { journalEntry: true },
      orderBy: { journalEntry: { entryDate: 'asc' } },
    })

    const party = await prisma.party.findUnique({ where: { id: partyId } })
    let balance = party?.openingBalance.toNumber() || 0

    const result = lines.map((line) => {
      balance += line.debit.toNumber() - line.credit.toNumber()
      return {
        entryNumber: line.journalEntry.entryNumber,
        entryDate: line.journalEntry.entryDate,
        description: line.description || line.journalEntry.description,
        debit: line.debit,
        credit: line.credit,
        balance,
        referenceType: line.journalEntry.referenceType,
        referenceId: line.journalEntry.referenceId,
      }
    })

    return { party, openingBalance: party?.openingBalance.toNumber() || 0, lines: result, closingBalance: balance }
  }

  /**
   * ميزان المراجعة
   */
  async getTrialBalance(companyId: number, asOf?: Date) {
    const accounts = await prisma.account.findMany({
      where: { companyId, isActive: true },
      orderBy: { accountCode: 'asc' },
    })

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId,
          isPosted: true,
          ...(asOf ? { entryDate: { lte: asOf } } : {}),
        },
      },
    })

    const map = new Map<number, { debit: number; credit: number }>()
    for (const line of lines) {
      const current = map.get(line.accountId) || { debit: 0, credit: 0 }
      current.debit += line.debit.toNumber()
      current.credit += line.credit.toNumber()
      map.set(line.accountId, current)
    }

    const result = accounts.map((acc) => {
      const totals = map.get(acc.id) || { debit: 0, credit: 0 }
      const opening = acc.openingBalance.toNumber()
      const debit = opening + totals.debit
      const credit = totals.credit
      return {
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        accountType: acc.accountType,
        debit: debit > credit ? debit - credit : 0,
        credit: credit > debit ? credit - debit : 0,
      }
    })

    const totalDebit = result.reduce((s, r) => s + r.debit, 0)
    const totalCredit = result.reduce((s, r) => s + r.credit, 0)

    return { accounts: result, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 }
  }

  /**
   * قائمة الدخل
   */
  async getIncomeStatement(companyId: number, from: Date, to: Date) {
    const accounts = await prisma.account.findMany({
      where: {
        companyId,
        accountType: { in: ['revenue', 'expense'] },
        isActive: true,
      },
      orderBy: { accountCode: 'asc' },
    })

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId,
          isPosted: true,
          entryDate: { gte: from, lte: to },
        },
      },
    })

    const map = new Map<number, { debit: number; credit: number }>()
    for (const line of lines) {
      const current = map.get(line.accountId) || { debit: 0, credit: 0 }
      current.debit += line.debit.toNumber()
      current.credit += line.credit.toNumber()
      map.set(line.accountId, current)
    }

    const revenues = accounts
      .filter((a) => a.accountType === 'revenue')
      .map((a) => {
        const t = map.get(a.id) || { debit: 0, credit: 0 }
        return { code: a.accountCode, name: a.accountName, amount: t.credit - t.debit }
      })

    const expenses = accounts
      .filter((a) => a.accountType === 'expense')
      .map((a) => {
        const t = map.get(a.id) || { debit: 0, credit: 0 }
        return { code: a.accountCode, name: a.accountName, amount: t.debit - t.credit }
      })

    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0)
    const totalExpense = expenses.reduce((s, r) => s + r.amount, 0)

    return {
      revenues,
      expenses,
      totalRevenue,
      totalExpense,
      netIncome: totalRevenue - totalExpense,
    }
  }

  /**
   * الميزانية العمومية
   */
  async getBalanceSheet(companyId: number, asOf?: Date) {
    const accounts = await prisma.account.findMany({
      where: {
        companyId,
        accountType: { in: ['asset', 'liability', 'equity'] },
        isActive: true,
      },
      orderBy: { accountCode: 'asc' },
    })

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId,
          isPosted: true,
          ...(asOf ? { entryDate: { lte: asOf } } : {}),
        },
      },
    })

    const map = new Map<number, { debit: number; credit: number }>()
    for (const line of lines) {
      const current = map.get(line.accountId) || { debit: 0, credit: 0 }
      current.debit += line.debit.toNumber()
      current.credit += line.credit.toNumber()
      map.set(line.accountId, current)
    }

    const assets = accounts
      .filter((a) => a.accountType === 'asset')
      .map((a) => {
        const t = map.get(a.id) || { debit: 0, credit: 0 }
        return { code: a.accountCode, name: a.accountName, balance: a.openingBalance.toNumber() + t.debit - t.credit }
      })

    const liabilities = accounts
      .filter((a) => a.accountType === 'liability')
      .map((a) => {
        const t = map.get(a.id) || { debit: 0, credit: 0 }
        return { code: a.accountCode, name: a.accountName, balance: t.credit - t.debit + a.openingBalance.toNumber() }
      })

    const equity = accounts
      .filter((a) => a.accountType === 'equity')
      .map((a) => {
        const t = map.get(a.id) || { debit: 0, credit: 0 }
        return { code: a.accountCode, name: a.accountName, balance: t.credit - t.debit + a.openingBalance.toNumber() }
      })

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
    const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0)
    const totalEquity = equity.reduce((s, e) => s + e.balance, 0)

    return {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    }
  }
}

export const accountingService = new AccountingService()
