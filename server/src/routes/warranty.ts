import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate, authorize } from '../middleware/auth'
import { generateNumber } from '../../../shared/utils'
import { sequenceService } from '../services/sequenceService'
import { RMA_STATUS } from '../../../shared/constants'

const router = Router()
router.use(authenticate)

// ============ الضمانات ============

// قائمة الضمانات
router.get('/', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query
    const where: any = { companyId: req.companyId }
    if (status) where.status = String(status)
    if (search) {
      where.OR = [
        { serial: { serialNumber: { contains: String(search) } } },
        { party: { partyName: { contains: String(search) } } },
        { warrantyNumber: { contains: String(search) } },
      ]
    }

    const [warranties, total] = await Promise.all([
      prisma.warranty.findMany({
        where,
        include: {
          serial: { include: { item: true } },
          party: true,
          saleInvoice: true,
        },
        orderBy: { endDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.warranty.count({ where }),
    ])

    return res.json({ warranties, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ضمان واحد
router.get('/:id', async (req, res) => {
  try {
    const warranty = await prisma.warranty.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        serial: { include: { item: true } },
        party: true,
        saleInvoice: { include: { items: true } },
        rmas: true,
      },
    })
    if (!warranty) return res.status(404).json({ error: 'الضمان غير موجود' })
    return res.json(warranty)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء ضمان
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { serialId, partyId, saleInvoiceId, startDate, endDate, warrantyType } = req.body
    if (!serialId) return res.status(400).json({ error: 'الرقم التسلسلي مطلوب' })

    const warranty = await prisma.warranty.create({
      data: {
        companyId: req.companyId!,
        warrantyNumber: generateNumber('WRN', await sequenceService.next(req.companyId!, 'WRN')),
        serialId,
        saleInvoiceId,
        partyId,
        startDate: new Date(startDate || Date.now()),
        endDate: new Date(endDate || Date.now() + 365 * 24 * 60 * 60 * 1000),
        warrantyType: warrantyType || 'store',
      },
    })

    return res.status(201).json(warranty)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ============ الصيانة (RMA) ============

// قائمة RMA
router.get('/rma/list', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query
    const where: any = { companyId: req.companyId }
    if (status) where.status = String(status)
    if (search) {
      where.OR = [
        { rmaNumber: { contains: String(search) } },
        { party: { partyName: { contains: String(search) } } },
        { items: { some: { serial: { serialNumber: { contains: String(search) } } } } },
      ]
    }

    const [rmas, total] = await Promise.all([
      prisma.rma.findMany({
        where,
        include: {
          party: true,
          items: { include: { item: true, serial: true } },
          warranty: true,
        },
        orderBy: { rmaDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.rma.count({ where }),
    ])

    return res.json({ rmas, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// RMA واحد
router.get('/rma/:id', async (req, res) => {
  try {
    const rma = await prisma.rma.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        party: true,
        items: { include: { item: true, serial: true } },
        warranty: true,
      },
    })
    if (!rma) return res.status(404).json({ error: 'طلب الصيانة غير موجود' })
    return res.json(rma)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء RMA
router.post('/rma', authorize('admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const {
      rmaDate,
      partyId,
      warrantyId,
      rmaType,
      issueDescription,
      items,
      notes,
    } = req.body

    if (!partyId) return res.status(400).json({ error: 'العميل مطلوب' })
    if (!items || items.length === 0) return res.status(400).json({ error: 'لا توجد أصناف' })

    const rma = await prisma.rma.create({
      data: {
        companyId: req.companyId!,
        rmaNumber: generateNumber('RMA', await sequenceService.next(req.companyId!, 'RMA')),
        rmaDate: new Date(rmaDate || Date.now()),
        partyId,
        warrantyId,
        rmaType: rmaType || 'repair',
        status: RMA_STATUS.OPEN,
        issueDescription,
        notes,
        createdBy: req.user!.id,
        items: {
          create: items.map((item: any) => ({
            itemId: item.itemId,
            serialId: item.serialId,
            quantity: item.quantity || 1,
          })),
        },
      },
      include: { items: true, party: true },
    })

    // تحديث حالة الأرقام التسلسلية
    for (const item of items) {
      if (item.serialId) {
        await prisma.serial.update({
          where: { id: item.serialId },
          data: { status: 'warranty' },
        })
      }
    }

    return res.status(201).json(rma)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// تحديث حالة RMA
router.put('/rma/:id/status', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { status, diagnosis, actionTaken, repairCost, partsCost, technicianId } = req.body
    if (!status) return res.status(400).json({ error: 'الحالة مطلوبة' })

    const data: any = { status }
    if (diagnosis !== undefined) data.diagnosis = diagnosis
    if (actionTaken !== undefined) data.actionTaken = actionTaken
    if (repairCost !== undefined) data.repairCost = repairCost
    if (partsCost !== undefined) data.partsCost = partsCost
    if (technicianId !== undefined) data.technicianId = technicianId

    if (status === 'received' && !data.receivedAt) data.receivedAt = new Date()
    if (['closed', 'repaired', 'replaced', 'refunded'].includes(status) && !data.returnedAt) {
      data.returnedAt = new Date()
    }

    const rma = await prisma.rma.update({
      where: { id: Number(req.params.id) },
      data,
      include: { items: true },
    })

    // عند الإغلاق: إعادة حالة الرقم التسلسلي
    if (['closed', 'repaired', 'replaced', 'refunded'].includes(status)) {
      for (const item of rma.items) {
        if (item.serialId && status !== 'replaced') {
          await prisma.serial.update({
            where: { id: item.serialId },
            data: { status: 'in_stock' },
          })
        }
      }
    }

    return res.json(rma)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

export default router
