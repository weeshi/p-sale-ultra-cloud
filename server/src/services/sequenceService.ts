import { prisma } from '../config/database'
import { Prisma } from '@prisma/client'

// خدمة التسلسلات: توليد أرقام فواتير آمنة ضد التكرار عند الحفظ المتزامن
// يستخدم SELECT ... FOR UPDATE (MariaDB 10.4 لا يدعم RETURNING)
export class SequenceService {
  /**
   * القيمة التالية للتسلسل مع قفل على مستوى السطر (Row-level lock)
   * يضمن عدم تكرار الأرقام عند الحفظ المتزامن من عدة جلسات
   */
  async next(companyId: number, prefix: string, txClient?: Prisma.TransactionClient): Promise<number> {
    const run = async (tx: Prisma.TransactionClient) => {
      // ضمان وجود صف التسلسل (INSERT ... ON DUPLICATE KEY عبر upsert)
      await tx.sequence.upsert({
        where: { companyId_prefix: { companyId, prefix } },
        update: {},
        create: { companyId, prefix, currentValue: 0 },
      })

      // قراءة القيمة الحالية مع قفل السطر (ينتظر انتهاء المعاملة الأخرى)
      const rows = await tx.$queryRaw<Array<{ current_value: number }>>`
        SELECT current_value FROM sequences
        WHERE company_id = ${companyId} AND prefix = ${prefix}
        FOR UPDATE
      `

      const nextValue = (rows[0]?.current_value ?? 0) + 1

      await tx.$executeRaw`
        UPDATE sequences
        SET current_value = ${nextValue}, updated_at = NOW()
        WHERE company_id = ${companyId} AND prefix = ${prefix}
      `

      return nextValue
    }

    if (txClient) return run(txClient)
    return prisma.$transaction((tx) => run(tx), { timeout: 30000 })
  }

  /**
   * ضمان وجود تسلسل (يُستخدم عند تهيئة الشركة)
   */
  async ensure(companyId: number, prefix: string, txClient?: Prisma.TransactionClient): Promise<void> {
    const upsert = async (tx: Prisma.TransactionClient) => {
      await tx.sequence.upsert({
        where: { companyId_prefix: { companyId, prefix } },
        update: {},
        create: { companyId, prefix, currentValue: 0 },
      })
    }
    if (txClient) return upsert(txClient)
    return prisma.$transaction((tx) => upsert(tx))
  }

  /**
   * القيمة الحالية دون زيادة
   */
  async current(companyId: number, prefix: string): Promise<number> {
    const seq = await prisma.sequence.findUnique({
      where: { companyId_prefix: { companyId, prefix } },
    })
    return seq?.currentValue ?? 0
  }
}

export const sequenceService = new SequenceService()
