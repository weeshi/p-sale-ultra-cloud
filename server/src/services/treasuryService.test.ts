import { prisma } from '../config/database'
import { treasuryService } from './treasuryService'
import { accountingService } from './accountingService'
import { sequenceService } from './sequenceService'
import { Prisma } from '@prisma/client'

jest.mock('../config/database', () => ({
  prisma: { $transaction: jest.fn() },
}))
jest.mock('./accountingService', () => ({
  accountingService: { createJournalEntry: jest.fn() },
}))
jest.mock('./sequenceService', () => ({
  sequenceService: { next: jest.fn(), ensure: jest.fn(), current: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockNext = sequenceService.next as jest.Mock
const mockCreateEntry = accountingService.createJournalEntry as jest.Mock

describe('TreasuryService.createReceipt', () => {
  let tx: any

  const baseData = {
    companyId: 1,
    receiptDate: new Date('2026-02-01'),
    receiptType: 'receipt' as 'receipt' | 'payment',
    treasuryId: 10,
    currency: 'LYD',
    exchangeRate: 1,
    amount: 500,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockResolvedValue(1)
    mockCreateEntry.mockResolvedValue({ id: 99 })

    const receiptRecord = {
      id: 1,
      receiptNumber: 'RCV-000001',
      receiptType: 'receipt',
      amount: new Prisma.Decimal(500),
      amountUsd: new Prisma.Decimal(500),
    }

    tx = {
      receipt: {
        create: jest.fn().mockResolvedValue(receiptRecord),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(receiptRecord),
      },
      treasury: {
        findUnique: jest.fn().mockResolvedValue({ id: 10, accountId: 100 }),
        update: jest.fn().mockResolvedValue({}),
      },
      account: {
        findUnique: jest.fn().mockResolvedValue({ id: 100, accountType: 'asset' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      party: {
        findUnique: jest.fn().mockResolvedValue({ id: 5, partyName: 'عميل تجريبي', accountId: 200 }),
      },
      saleInvoice: {
        findUnique: jest.fn().mockResolvedValue({ paidAmount: new Prisma.Decimal(0), total: new Prisma.Decimal(1000) }),
        update: jest.fn().mockResolvedValue({}),
      },
      purchaseInvoice: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  })

  it('ينشئ سند قبض ويزيد رصيد الخزينة', async () => {
    const result = await treasuryService.createReceipt({
      ...baseData,
      receiptType: 'receipt',
      partyId: 5,
      saleInvoiceId: 30,
    })

    expect(result?.receiptNumber).toBe('RCV-000001')
    expect(tx.receipt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ receiptNumber: 'RCV-000001', amount: 500 }) })
    )
    // قبض → زيادة رصيد الخزينة
    expect(tx.treasury.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentBalance: { increment: 500 } } })
    )
    // قيد: خزينة مدين 500 + طرف دائن 500
    expect(mockCreateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: expect.any(String),
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 100, debit: 500 }),
          expect.objectContaining({ accountId: 200, credit: 500, partyId: 5 }),
        ]),
      }),
      tx
    )
    expect(tx.receipt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ journalEntryId: 99 }) })
    )
  })

  it('ينشئ سند صرف وينقص رصيد الخزينة ويحدّث رصيد الفاتورة', async () => {
    mockNext.mockResolvedValue(2)
    await treasuryService.createReceipt({
      ...baseData,
      receiptType: 'payment',
      partyId: 5,
      purchaseInvoiceId: 40,
    })

    // صرف → إنقاص رصيد الخزينة
    expect(tx.treasury.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentBalance: { increment: -500 } } })
    )
    expect(tx.receipt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ receiptNumber: 'PAY-000002' }) })
    )
    expect(mockCreateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 100, credit: 500 }),
          expect.objectContaining({ accountId: 200, debit: 500, partyId: 5 }),
        ]),
      }),
      tx
    )
  })

  it('يحسب المبالغ المزدوجة عند العملة USD', async () => {
    await treasuryService.createReceipt({
      ...baseData,
      amount: 100,
      currency: 'USD',
      exchangeRate: 8.5,
      receiptType: 'receipt',
    })

    expect(tx.receipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 850, amountUsd: 100 }),
      })
    )
    // قبض → زيادة بالدينار المحسوب
    expect(tx.treasury.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentBalance: { increment: 850 } } })
    )
  })

  it('يحدّث حالة الفاتورة المرتبطة إلى paid عند اكتمال السداد', async () => {
    tx.saleInvoice.findUnique.mockResolvedValue({ paidAmount: new Prisma.Decimal(0), total: new Prisma.Decimal(500) })
    await treasuryService.createReceipt({
      ...baseData,
      receiptType: 'receipt',
      partyId: 5,
      saleInvoiceId: 30,
    })

    expect(tx.saleInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentStatus: 'paid', paidAmount: 500 }),
      })
    )
  })
})
