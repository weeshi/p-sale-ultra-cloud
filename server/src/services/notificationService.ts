import nodemailer from 'nodemailer'
import axios from 'axios'
import { CONFIG } from '../config'
import logger from '../config/logger'

// خدمة الإشعارات: إرسال الفواتير عبر البريد والواتساب
export class NotificationService {
  private transporter: nodemailer.Transporter | null = null

  private getTransporter() {
    if (this.transporter) return this.transporter
    if (!CONFIG.smtp.user || !CONFIG.smtp.pass) {
      logger.warn('SMTP not configured')
      return null
    }
    this.transporter = nodemailer.createTransport({
      host: CONFIG.smtp.host,
      port: CONFIG.smtp.port,
      secure: CONFIG.smtp.port === 465,
      auth: {
        user: CONFIG.smtp.user,
        pass: CONFIG.smtp.pass,
      },
    })
    return this.transporter
  }

  /**
   * إرسال فاتورة عبر البريد الإلكتروني
   */
  async sendEmail(data: {
    to: string
    subject: string
    html: string
    attachments?: Array<{ filename: string; content: Buffer | string }>
  }) {
    const transporter = this.getTransporter()
    if (!transporter) throw new Error('البريد الإلكتروني غير مهيأ')

    try {
      await transporter.sendMail({
        from: CONFIG.smtp.from,
        to: data.to,
        subject: data.subject,
        html: data.html,
        attachments: data.attachments,
      })
      return { success: true }
    } catch (error) {
      logger.error('Email send failed:', error)
      throw new Error('فشل إرسال البريد الإلكتروني')
    }
  }

  /**
   * إرسال فاتورة عبر واتساب
   */
  async sendWhatsApp(data: {
    to: string // رقم الهاتف بصيغة دولية
    message: string
    mediaUrl?: string // رابط PDF الفاتورة
  }) {
    if (!CONFIG.whatsapp.phoneNumberId || !CONFIG.whatsapp.accessToken) {
      throw new Error('واتساب غير مهيأ')
    }

    try {
      const url = `${CONFIG.whatsapp.apiUrl}/${CONFIG.whatsapp.phoneNumberId}/messages`

      const payload: any = {
        messaging_product: 'whatsapp',
        to: data.to,
        type: data.mediaUrl ? 'document' : 'text',
      }

      if (data.mediaUrl) {
        payload.document = {
          link: data.mediaUrl,
          caption: data.message,
        }
      } else {
        payload.text = { body: data.message }
      }

      await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${CONFIG.whatsapp.accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      return { success: true }
    } catch (error) {
      logger.error('WhatsApp send failed:', error)
      throw new Error('فشل إرسال واتساب')
    }
  }

  /**
   * توليد رسالة HTML لفاتورة
   */
  buildInvoiceEmail(invoice: {
    invoiceNumber: string
    invoiceDate: Date
    partyName?: string
    items: Array<{ itemName: string; quantity: number; unitPrice: number; total: number }>
    subtotal: number
    discount: number
    tax: number
    total: number
    companyName: string
  }) {
    const itemsRows = invoice.items
      .map(
        (item) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${item.itemName}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.unitPrice.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:left">${item.total.toFixed(2)}</td>
        </tr>`
      )
      .join('')

    return `
      <div dir="rtl" style="font-family:Tahoma,Arial;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
        <div style="background:#1e3a5f;color:#fff;padding:20px;text-align:center">
          <h2 style="margin:0">${invoice.companyName}</h2>
          <p style="margin:5px 0 0;opacity:0.9">فاتورة رقم: ${invoice.invoiceNumber}</p>
        </div>
        <div style="padding:20px">
          <p><strong>التاريخ:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString('ar-LY')}</p>
          ${invoice.partyName ? `<p><strong>العميل:</strong> ${invoice.partyName}</p>` : ''}
          <table style="width:100%;border-collapse:collapse;margin-top:15px">
            <thead>
              <tr style="background:#f5f5f5">
                <th style="padding:8px;text-align:right">الصنف</th>
                <th style="padding:8px">الكمية</th>
                <th style="padding:8px">السعر</th>
                <th style="padding:8px">الإجمالي</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>
          <div style="margin-top:15px;text-align:left">
            <p>المجموع الفرعي: ${invoice.subtotal.toFixed(2)}</p>
            ${invoice.discount ? `<p>الخصم: -${invoice.discount.toFixed(2)}</p>` : ''}
            ${invoice.tax ? `<p>الضريبة: ${invoice.tax.toFixed(2)}</p>` : ''}
            <h3 style="border-top:2px solid #1e3a5f;padding-top:10px">الإجمالي: ${invoice.total.toFixed(2)}</h3>
          </div>
        </div>
        <div style="background:#f5f5f5;padding:10px;text-align:center;font-size:12px;color:#666">
          شكراً لتعاملكم معنا
        </div>
      </div>`
  }
}

export const notificationService = new NotificationService()
