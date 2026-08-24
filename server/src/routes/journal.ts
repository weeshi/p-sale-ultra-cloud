import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize } from '../middleware/auth'
import { accountingService } from '../services/accountingService'

const router = Router()
router.use(authenticate)

// القيود المحاسبية (دفتر اليومية)
router.get('/', async (req, res) => {
  try {
    const { from, to, type, page = 1, limit = 50 } = req.query
    const where: any = { companyId: req.companyId, isPosted: true }

    if (from || to) {
      where.entryDate = {}
      if (from) where.entryDate.gte = new Date(String(from))
      if (to) where.entryDate.lte = new Date(String(to))
    }
    if (type) where.entryType = String(type)

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: true } }, creator: true },
        orderBy: { entryDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.journalEntry.count({ where }),
    ])

    return res.json({ entries, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// قيد واحد
router.get('/:id', async (req, res) => {
  try {
    const entry = await prisma.journalEntry.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: { lines: { include: { account: true } }, creator: true },
    })
    if (!entry) return res.status(404).json({ error: 'القيد غير موجود' })
    return res.json(entry)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء قيد يدوي
router.post('/', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const { entryDate, entryType, description, lines } = req.body

    if (!entryDate || !lines || lines.length < 2) {
      return res.status(400).json({ error: 'تاريخ القيد وسطرين على الأقل مطلوبان' })
    }

    const entry = await accountingService.createJournalEntry({
      companyId: req.companyId!,
      entryDate: new Date(entryDate),
      entryType: entryType || 'adjusting',
      description,
      createdBy: req.user!.id,
      branchId: req.branchId,
      lines,
    })

    return res.status(201).json(entry)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// عكس قيد
router.post('/:id/reverse', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const entry = await accountingService.reverseJournalEntry(
      Number(req.params.id),
      req.user!.id
    )
    return res.status(201).json(entry)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// ميزان المراجعة
router.get('/reports/trial-balance', async (req, res) => {
  try {
    const { asOf } = req.query
    const result = await accountingService.getTrialBalance(
      req.companyId!,
      asOf ? new Date(String(asOf)) : undefined
    )
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// قائمة الدخل
router.get('/reports/income-statement', async (req, res) => {
  try {
    const { from, to } = req.query
    const result = await accountingService.getIncomeStatement(
      req.companyId!,
      from ? new Date(String(from)) : new Date(new Date().getFullYear(), 0, 1),
      to ? new Date(String(to)) : new Date()
    )
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// الميزانية العمومية
router.get('/reports/balance-sheet', async (req, res) => {
  try {
    const { asOf } = req.query
    const result = await accountingService.getBalanceSheet(
      req.companyId!,
      asOf ? new Date(String(asOf)) : undefined
    )
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
