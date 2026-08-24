import { prisma } from '../config/database'
import { sequenceService } from './sequenceService'

jest.mock('../config/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    sequence: { upsert: jest.fn(), findUnique: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('SequenceService', () => {
  const fakeTx = {
    sequence: { upsert: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([{ current_value: 5 }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(fakeTx)
    )
  })

  it('next() يزيد القيمة الحالية ويرجع التالي', async () => {
    const value = await sequenceService.next(1, 'INV')
    expect(value).toBe(6)
    expect(fakeTx.sequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_prefix: { companyId: 1, prefix: 'INV' } },
        create: { companyId: 1, prefix: 'INV', currentValue: 0 },
      })
    )
    expect(fakeTx.$queryRaw).toHaveBeenCalled()
    expect(fakeTx.$executeRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('SET current_value')]),
      6,
      1,
      'INV'
    )
  })

  it('next() مع txClient يستخدم التراكشن مباشرة دون $transaction', async () => {
    const value = await sequenceService.next(1, 'INV', fakeTx as never)
    expect(value).toBe(6)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('next() يبدأ من 1 عند غياب الصف', async () => {
    fakeTx.$queryRaw.mockResolvedValue([])
    const value = await sequenceService.next(1, 'INV')
    expect(value).toBe(1)
  })

  it('ensure() ينشئ الصف دون زيادة القيمة', async () => {
    await sequenceService.ensure(1, 'JRN')
    expect(fakeTx.sequence.upsert).toHaveBeenCalled()
    expect(fakeTx.$queryRaw).not.toHaveBeenCalled()
    expect(fakeTx.$executeRaw).not.toHaveBeenCalled()
  })

  it('current() يرجع القيمة المخزنة أو صفر', async () => {
    mockPrisma.sequence.findUnique.mockResolvedValue({ currentValue: 7 } as never)
    await expect(sequenceService.current(1, 'INV')).resolves.toBe(7)

    mockPrisma.sequence.findUnique.mockResolvedValue(null)
    await expect(sequenceService.current(1, 'INV')).resolves.toBe(0)
  })
})
