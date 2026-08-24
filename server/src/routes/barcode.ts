import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate } from '../middleware/auth'
import { barcodeService } from '../services/barcodeService'

const router = Router()
router.use(authenticate)

// البحث بالباركود
router.get('/lookup/:barcode', async (req, res) => {
  try {
    const item = await barcodeService.findByBarcode(req.params.barcode, req.companyId!)
    if (!item) return res.status(404).json({ error: 'لا يوجد صنف بهذا الباركود' })
    return res.json(item)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// البحث برقم تسلسلي
router.get('/serial/:serialNumber', async (req, res) => {
  try {
    const serial = await barcodeService.findBySerial(req.params.serialNumber, req.companyId!)
    if (!serial) return res.status(404).json({ error: 'لا يوجد رقم تسلسلي مطابق' })

    const warranties = await prisma.warranty.findMany({
      where: { serialId: serial.id },
      include: { party: true },
    })

    return res.json({ serial, warranties })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
