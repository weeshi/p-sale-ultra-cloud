import { prisma } from '../config/database'
import { accountingService } from './accountingService'
import { sequenceService } from './sequenceService'
import { Prisma } from '@prisma/client'

jest.mock('../config/database', () => ({
  prisma: { $transaction: jest.fn() },
}))
jest.mock('./sequenceService', () => ({
  sequenceService: { next: jest.fn(), ensure: jest.fn(), current: jest.fn() },
}))
jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockNext = sequenceService.next as jest.Mock

describe('AccountingService.createJournalEntry', () => {
  let tx: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockResolvedValue(2)
    tx = {
      journalEntry: { create: jest.fn().mockResolvedValue({ id: 10, entryNumber: 'JRN-000002' }) },
      account: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, currentBalance: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      party: {
        findUnique: jest.fn().mockResolvedValue({ id: 5, currentBalance: new Prisma.Decimal(0) }),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  it('يرفض القيد غير المتوازن', async () => {
    await expect(
      accountingService.createJournalEntry({
        companyId: 1,
        entryDate: new Date(),
        entryType: 'adjusting',
        lines: [{ accountId: 1, debit: 100 }, { accountId: 2, credit: 50 }],
      })
    ).rejects.toThrow('القيد غير متوازن')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('ينشئ القيد المتوازن ويحدّث أرصدة الحسابات والأطراف', async () => {
    const result = await accountingService.createJournalEntry({
      companyId: 1,
      entryDate: new Date('2026-01-15'),
      entryType: 'sale',
      referenceType: 'saleInvoice',
      referenceId: 7,
      description: 'فاتورة بيع',
      currency: 'LYD',
      exchangeRate: 1,
      lines: [
        { accountId: 1, debit: 100, description: 'نقدي' },
        { accountId: 2, credit: 100, partyId: 5, description: 'عميل' },
      ],
    })

    expect(result.id).toBe(10)
    expect(tx.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryNumber: 2,
          totalDebit: 100,
          totalCredit: 100,
          lines: { create: expect.arrayContaining([expect.objectContaining({ debit: 100 }), expect.objectContaining({ credit: 100 })]) },
        }),
      })
    )
    // تحديث حساب السطر الأول (مدين 100 → 200) والثاني (دائن 100 → 0)
    expect(tx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentBalance: 200 } })
    )
    expect(tx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentBalance: 0 } })
    )
    // تحديث رصيد الطرف (دائن 100 → -100)
    expect(tx.party.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentBalance: -100 } })
    )
  })

  it('يستخدم ترانزاكشن خارجي عند تمرير txClient', async () => {
    const externalTx = {
      journalEntry: { create: jest.fn().mockResolvedValue({ id: 11 }) },
      account: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      party: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    }
    await accountingService.createJournalEntry(
      {
        companyId: 1,
        entryDate: new Date(),
        entryType: 'adjusting',
        lines: [{ accountId: 1, debit: 50 }, { accountId: 2, credit: 50 }],
      },
      externalTx
    )
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(externalTx.journalEntry.create).toHaveBeenCalled()
  })
})

describe('AccountingService.reverseJournalEntry', () => {
  let tx: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockResolvedValue(4)
    tx = {
      journalEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 20, entryNumber: 'JRN-000004' }),
        update: jest.fn().mockResolvedValue({}),
      },
      account: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, currentBalance: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      party: {
        findUnique: jest.fn().mockResolvedValue({ id: 5, currentBalance: new Prisma.Decimal(0) }),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  const makeEntry = () => ({
    id: 3,
    companyId: 1,
    entryNumber: 'JRN-000003',
    entryType: 'sale',
    currency: 'LYD',
    exchangeRate: 1,
    isReversed: false,
    totalDebit: new Prisma.Decimal(100),
    totalCredit: new Prisma.Decimal(100),
    lines: [
      { accountId: 1, description: 'نقدي', debit: new Prisma.Decimal(100), credit: new Prisma.Decimal(0), partyId: null, currency: 'LYD', currencyAmount: null },
      { accountId: 2, description: 'عميل', debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(100), partyId: 5, currency: 'LYD', currencyAmount: null },
    ],
  })

  it('يرفض عكس قيد غير موجود', async () => {
    tx.journalEntry.findUnique.mockResolvedValue(null)
    await expect(accountingService.reverseJournalEntry(999, 1)).rejects.toThrow('القيد غير موجود')
  })

  it('يرفض عكس قيد معكوس مسبقاً', async () => {
    tx.journalEntry.findUnique.mockResolvedValue({ ...makeEntry(), isReversed: true })
    await expect(accountingService.reverseJournalEntry(3, 1)).rejects.toThrow('معكوس مسبقاً')
  })

  it('ينشئ قيد عكسي ويعلّم القيد الأصلي كمعكوس', async () => {
    tx.journalEntry.findUnique.mockResolvedValue(makeEntry())

    const result = await accountingService.reverseJournalEntry(3, 1)

    expect(tx.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryNumber: 4,
          description: 'عكس القيد رقم JRN-000003',
          totalDebit: 100,
          totalCredit: 100,
          lines: {
            create: [
              expect.objectContaining({ debit: 0, credit: 100 }),
              expect.objectContaining({ debit: 100, credit: 0, partyId: 5 }),
            ],
          },
        }),
      })
    )
    expect(tx.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: expect.objectContaining({ isReversed: true }) })
    )
    expect(result.id).toBe(20)
  })
})
