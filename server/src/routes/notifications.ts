import { Router } from 'express'
import { prisma } from '../config/database'
import { authenticate } from '../middleware/auth'
import { notificationService } from '../services/notificationService'

const router = Router()
router.use(authenticate)

// إرسال فاتورة بيع عبر البريد/الواتساب
router.post('/sale-invoice/:id/send', async (req, res) => {
  try {
    const { method, to } = req.body
    if (!method || !['email', 'whatsapp'].includes(method)) {
      return res.status(400).json({ error: 'طريقة الإرسال غير صالحة' })
    }
    if (!to) return res.status(400).json({ error: 'المرسل إليه مطلوب' })

    const invoice = await prisma.saleInvoice.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        items: { include: { item: true } },
        party: true,
        company: true,
      },
    })
    if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' })

    const html = notificationService.buildInvoiceEmail({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      partyName: invoice.party?.partyName,
      companyName: invoice.company.name,
      items: invoice.items.map((i) => ({
        itemName: i.item.itemName,
        quantity: i.quantity.toNumber(),
        unitPrice: i.unitPrice.toNumber(),
        total: i.total.toNumber(),
      })),
      subtotal: invoice.subtotal.toNumber(),
      discount: invoice.discount.toNumber(),
      tax: invoice.taxAmount.toNumber(),
      total: invoice.total.toNumber(),
    })

    let result
    if (method === 'email') {
      result = await notificationService.sendEmail({
        to,
        subject: `فاتورة ${invoice.invoiceNumber}`,
        html,
      })
    } else {
      result = await notificationService.sendWhatsApp({
        to,
        message: `فاتورة ${invoice.invoiceNumber} بمبلغ ${invoice.total.toNumber()}`,
      })
    }

    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إرسال عرض سعر عبر البريد/الواتساب
router.post('/quote/:id/send', async (req, res) => {
  try {
    const { method, to } = req.body
    if (!method || !['email', 'whatsapp'].includes(method)) {
      return res.status(400).json({ error: 'طريقة الإرسال غير صالحة' })
    }
    if (!to) return res.status(400).json({ error: 'المرسل إليه مطلوب' })

    const quote = await prisma.quote.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: { items: { include: { item: true } }, party: true, company: true },
    })
    if (!quote) return res.status(404).json({ error: 'عرض السعر غير موجود' })

    const html = notificationService.buildInvoiceEmail({
      invoiceNumber: quote.quoteNumber,
      invoiceDate: quote.quoteDate,
      partyName: quote.party?.partyName,
      companyName: quote.company.name,
      items: quote.items.map((i) => ({
        itemName: i.item.itemName,
        quantity: i.quantity.toNumber(),
        unitPrice: i.unitPrice.toNumber(),
        total: i.total.toNumber(),
      })),
      subtotal: quote.subtotal.toNumber(),
      discount: quote.discount.toNumber(),
      tax: quote.taxAmount.toNumber(),
      total: quote.total.toNumber(),
    })

    let result
    if (method === 'email') {
      result = await notificationService.sendEmail({
        to,
        subject: `عرض سعر ${quote.quoteNumber}`,
        html,
      })
    } else {
      result = await notificationService.sendWhatsApp({
        to,
        message: `عرض سعر ${quote.quoteNumber} بمبلغ ${quote.total.toNumber()}`,
      })
    }

    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
