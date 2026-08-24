import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate } from '../middleware/auth'
import { accountingService } from '../services/accountingService'

const router = Router()
router.use(authenticate)

// دليل الحسابات
router.get('/', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { companyId: req.companyId },
      include: { children: { where: { isActive: true } } },
      orderBy: { accountCode: 'asc' },
    })
    return res.json(accounts)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء حساب
router.post('/', async (req, res) => {
  try {
    const {
      accountCode,
      accountName,
      accountType,
      parentId,
      isTerminal,
      openingBalance,
    } = req.body

    if (!accountCode || !accountName) {
      return res.status(400).json({ error: 'كود الحساب واسم الحساب مطلوبان' })
    }

    const account = await prisma.account.create({
      data: {
        companyId: req.companyId!,
        accountCode,
        accountName,
        accountType,
        parentId,
        isTerminal: isTerminal ?? true,
        openingBalance: openingBalance || 0,
        currentBalance: openingBalance || 0,
      },
    })

    return res.status(201).json(account)
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'كود الحساب مكرر' })
    }
    return res.status(500).json({ error: error.message })
  }
})

// تعديل حساب
router.put('/:id', async (req, res) => {
  try {
    const { ...data } = req.body
    delete data.companyId

    const account = await prisma.account.update({
      where: { id: Number(req.params.id) },
      data,
    })
    return res.json(account)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// دفتر أستاذ حساب
router.get('/:id/ledger', async (req, res) => {
  try {
    const { from, to } = req.query
    const ledger = await accountingService.getAccountLedger(
      Number(req.params.id),
      req.companyId!,
      from ? new Date(String(from)) : undefined,
      to ? new Date(String(to)) : undefined
    )
    return res.json(ledger)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// كشف حساب عميل/مورد
router.get('/party/:partyId/ledger', async (req, res) => {
  try {
    const { from, to } = req.query
    const ledger = await accountingService.getPartyLedger(
      Number(req.params.partyId),
      req.companyId!,
      from ? new Date(String(from)) : undefined,
      to ? new Date(String(to)) : undefined
    )
    return res.json(ledger)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
