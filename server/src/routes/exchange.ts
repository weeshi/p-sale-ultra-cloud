import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import { exchangeRateService } from '../services/exchangeRateService'

const router = Router()
router.use(authenticate)

// السعر الحالي
router.get('/rate/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params
    const { date } = req.query
    const rate = await exchangeRateService.getRate(
      req.companyId!,
      from.toUpperCase(),
      to.toUpperCase(),
      date ? new Date(String(date)) : undefined
    )
    return res.json({ from: from.toUpperCase(), to: to.toUpperCase(), rate })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تحديث تلقائي
router.post('/update', authorize('admin'), async (req, res) => {
  try {
    const result = await exchangeRateService.updateRates(req.companyId!)
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تحديث يدوي
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { fromCurrency, toCurrency, rate, date } = req.body
    if (!fromCurrency || !toCurrency || !rate) {
      return res.status(400).json({ error: 'العملتان والسعر مطلوبان' })
    }
    const result = await exchangeRateService.setManualRate(
      req.companyId!,
      fromCurrency,
      toCurrency,
      rate,
      date ? new Date(date) : undefined
    )
    return res.status(201).json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// سجل الأسعار
router.get('/history/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params
    const { limit } = req.query
    const history = await exchangeRateService.getRatesHistory(
      req.companyId!,
      from.toUpperCase(),
      to.toUpperCase(),
      limit ? Number(limit) : 30
    )
    return res.json(history)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
