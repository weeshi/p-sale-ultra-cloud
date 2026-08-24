import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate } from '../middleware/auth'
import { sequenceService } from '../services/sequenceService'
import { generateNumber } from '../../../shared/utils'

const router = Router()
router.use(authenticate)

// قائمة الحسابات/العملاء والموردين
router.get('/', async (req, res) => {
  try {
    const { type, search, page = 1, limit = 50 } = req.query
    const where: any = { companyId: req.companyId }
    if (type) where.partyType = String(type)
    if (search) {
      where.OR = [
        { partyName: { contains: String(search) } },
        { partyCode: { contains: String(search) } },
        { mobile: { contains: String(search) } },
        { phone: { contains: String(search) } },
      ]
    }

    const [parties, total] = await Promise.all([
      prisma.party.findMany({
        where,
        include: { account: true },
        orderBy: { partyName: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.party.count({ where }),
    ])

    return res.json({ parties, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// حساب واحد
router.get('/:id', async (req, res) => {
  try {
    const party = await prisma.party.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        account: true,
        saleInvoices: { orderBy: { invoiceDate: 'desc' }, take: 20 },
        purchaseInvoices: { orderBy: { invoiceDate: 'desc' }, take: 20 },
        receipts: { orderBy: { receiptDate: 'desc' }, take: 20 },
      },
    })
    if (!party) return res.status(404).json({ error: 'الحساب غير موجود' })
    return res.json(party)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء حساب
router.post('/', async (req, res) => {
  try {
    const {
      partyName,
      partyType,
      address,
      phone,
      mobile,
      email,
      whatsapp,
      taxNumber,
      creditLimit,
      openingBalance,
      accountId,
      notes,
    } = req.body

    if (!partyName) {
      return res.status(400).json({ error: 'اسم الحساب مطلوب' })
    }

    // توليد كود الحساب تلقائياً عبر SequenceService
    const nextSeq = await sequenceService.next(req.companyId!, 'PTY')
    const autoPartyCode = generateNumber('PTY', nextSeq)

    const party = await prisma.party.create({
      data: {
        companyId: req.companyId!,
        partyCode: autoPartyCode,
        partyName,
        partyType: partyType || 'customer',
        address,
        phone,
        mobile,
        email,
        whatsapp,
        taxNumber,
        creditLimit: creditLimit || 0,
        openingBalance: openingBalance || 0,
        currentBalance: openingBalance || 0,
        accountId,
        notes,
      },
      include: { account: true },
    })

    return res.status(201).json(party)
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
    delete data.createdAt
    delete data.updatedAt
    delete data.partyCode // الكود تلقائي ولا يُعدّل يدوياً

    const existing = await prisma.party.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
    })
    if (!existing) return res.status(404).json({ error: 'الحساب غير موجود' })

    const party = await prisma.party.update({
      where: { id: existing.id },
      data,
      include: { account: true },
    })

    return res.json(party)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// حذف حساب (تعطيل)
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.party.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
    })
    if (!existing) return res.status(404).json({ error: 'الحساب غير موجود' })

    await prisma.party.update({
      where: { id: existing.id },
      data: { isActive: false },
    })

    return res.json({ success: true })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
