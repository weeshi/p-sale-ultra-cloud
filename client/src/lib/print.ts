import { fmt, fmtMoney, fmtDate, toNum } from './format'
import type { PurchaseInvoice, PurchaseOrder, Quote, SaleInvoice } from '@/types'

// أدوات الطباعة والمشاركة (WhatsApp / Email) للفواتير وعروض الأسعار

function openPrintWindow(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=820,height=640')
  if (!win) {
    alert('يُرجى السماح بالنوافذ المنبثقة لاستخدام الطباعة')
    return
  }
  win.document.write(`<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; color: #0f172a; margin: 0; padding: 24px; }
  .doc { max-width: 720px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; }
  .head h1 { margin: 0; font-size: 20px; color: #1e3a8a; }
  .head .meta { text-align: left; font-size: 12px; color: #475569; }
  .party { margin: 14px 0; font-size: 13px; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th { background: #eff6ff; border: 1px solid #cbd5e1; padding: 7px; text-align: right; }
  td { border: 1px solid #e2e8f0; padding: 7px; }
  .totals { width: 42%; margin-right: auto; font-size: 13px; }
  .totals tr td { border: none; padding: 4px 7px; }
  .totals .grand { font-weight: 700; font-size: 15px; color: #1e3a8a; }
  .notes { margin-top: 16px; font-size: 12px; color: #475569; white-space: pre-wrap; }
  .footer { margin-top: 28px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { body { padding: 8px; } }
</style>
</head>
<body>${bodyHtml}</body>
</html>`)
  win.document.close()
  win.focus()
  win.print()
}

export function printDocument(title: string, bodyHtml: string): void {
  openPrintWindow(title, bodyHtml)
}

export function printInvoice(inv: SaleInvoice, companyName?: string): void {
  const items = inv.items ?? []
  const rows = items
    .map(
      (i) =>
        `<tr>
          <td>${i.item?.itemCode ?? '—'}</td>
          <td>${i.item?.itemName ?? '—'}</td>
          <td>${fmt(i.quantity)}</td>
          <td>${fmt(i.unitPrice)}</td>
          <td>${fmt(i.discount ?? 0)}</td>
          <td>${fmtMoney(i.total)}</td>
        </tr>`
    )
    .join('')

  const body = `
  <div class="doc">
    <div class="head">
      <div>
        <h1>${companyName ? `${companyName} — ` : ''}فاتورة ${inv.invoiceType === 'return' ? 'مرتجع' : 'بيع'}</h1>
        <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
      </div>
      <div class="meta">
        <div><b>رقم الفاتورة:</b> ${inv.invoiceNumber}</div>
        <div><b>التاريخ:</b> ${fmtDate(inv.invoiceDate)}</div>
        <div><b>الحالة:</b> ${inv.paymentStatus}</div>
      </div>
    </div>
    <div class="party">
      <b>العميل:</b> ${inv.party?.partyName ?? 'نقدي'}${inv.party?.mobile ? ` — ${inv.party.mobile}` : ''}
      ${inv.warehouse ? `<div><b>المخزن:</b> ${inv.warehouse.name}</div>` : ''}
    </div>
    <table>
      <thead>
        <tr><th>الكود</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>المجموع الفرعي</td><td>${fmtMoney(inv.subtotal)}</td></tr>
      ${toNum(inv.taxAmount) ? `<tr><td>الضريبة</td><td>${fmtMoney(inv.taxAmount)}</td></tr>` : ''}
      ${toNum(inv.discount) ? `<tr><td>الخصم</td><td>${fmtMoney(inv.discount)}</td></tr>` : ''}
      <tr class="grand"><td>الإجمالي</td><td>${fmtMoney(inv.total)}</td></tr>
      <tr><td>المدفوع</td><td>${fmtMoney(inv.paidAmount)}</td></tr>
    </table>
    ${inv.notes ? `<div class="notes"><b>ملاحظات:</b> ${inv.notes}</div>` : ''}
    <div class="footer">شكراً لتعاملكم معنا — P-Sale Ultra Cloud</div>
  </div>`
  openPrintWindow(`فاتورة ${inv.invoiceNumber}`, body)
}

export function printQuote(q: Quote, companyName?: string): void {
  const items = q.items ?? []
  const rows = items
    .map(
      (i) =>
        `<tr>
          <td>${i.item?.itemCode ?? '—'}</td>
          <td>${i.item?.itemName ?? '—'}</td>
          <td>${fmt(i.quantity)}</td>
          <td>${fmt(i.unitPrice)}</td>
          <td>${fmtMoney(i.total)}</td>
        </tr>`
    )
    .join('')

  const body = `
  <div class="doc">
    <div class="head">
      <div>
        <h1>${companyName ? `${companyName} — ` : ''}عرض سعر</h1>
        <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
      </div>
      <div class="meta">
        <div><b>رقم العرض:</b> ${q.quoteNumber}</div>
        <div><b>التاريخ:</b> ${fmtDate(q.quoteDate)}</div>
        <div><b>صالحة حتى:</b> ${fmtDate(q.validUntil)}</div>
      </div>
    </div>
    <div class="party">
      <b>العميل:</b> ${q.party?.partyName ?? '—'}${q.party?.mobile ? ` — ${q.party.mobile}` : ''}
    </div>
    <table>
      <thead>
        <tr><th>الكود</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr class="grand"><td>الإجمالي</td><td>${fmtMoney(q.total)}</td></tr>
    </table>
    ${q.notes ? `<div class="notes"><b>ملاحظات:</b> ${q.notes}</div>` : ''}
    <div class="footer">عرض أسعار قابل للتحويل إلى فاتورة بيع — P-Sale Ultra Cloud</div>
  </div>`
  openPrintWindow(`عرض سعر ${q.quoteNumber}`, body)
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const clean = (phone ?? '').replace(/[^\d]/g, '')
  if (!clean) return null
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`
}

export function mailLink(email: string | null | undefined, subject: string, body: string): string | null {
  const clean = (email ?? '').trim()
  if (!clean) return null
  return `mailto:${clean}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function invoiceText(inv: SaleInvoice): string {
  const lines = [
    `فاتورة ${inv.invoiceType === 'return' ? 'مرتجع' : 'بيع'} رقم: ${inv.invoiceNumber}`,
    `التاريخ: ${fmtDate(inv.invoiceDate)}`,
    `العميل: ${inv.party?.partyName ?? 'نقدي'}`,
    '—————————————',
    ...(inv.items ?? []).map((i) => `${i.item?.itemName ?? '—'} × ${fmt(i.quantity)} = ${fmtMoney(i.total)}`),
    '—————————————',
    `المجموع: ${fmtMoney(inv.subtotal)}`,
    toNum(inv.taxAmount) ? `الضريبة: ${fmtMoney(inv.taxAmount)}` : '',
    toNum(inv.discount) ? `الخصم: ${fmtMoney(inv.discount)}` : '',
    `الإجمالي: ${fmtMoney(inv.total)}`,
  ]
  return lines.filter(Boolean).join('\n')
}

export function quoteText(q: Quote): string {
  const lines = [
    `عرض سعر رقم: ${q.quoteNumber}`,
    `التاريخ: ${fmtDate(q.quoteDate)}`,
    `العميل: ${q.party?.partyName ?? '—'}`,
    '—————————————',
    ...(q.items ?? []).map((i) => `${i.item?.itemName ?? '—'} × ${fmt(i.quantity)} = ${fmtMoney(i.total)}`),
    '—————————————',
    `الإجمالي: ${fmtMoney(q.total)}`,
  ]
  return lines.filter(Boolean).join('\n')
}

export function printPurchaseOrder(po: PurchaseOrder, companyName?: string): void {
  const items = po.items ?? []
  const rows = items
    .map(
      (i) =>
        `<tr>
          <td>${i.item?.itemCode ?? '—'}</td>
          <td>${i.item?.itemName ?? '—'}</td>
          <td>${fmt(i.quantity)}</td>
          <td>${fmt(i.unitPriceUsd)} $</td>
          <td>${fmt(i.totalUsd)} $</td>
        </tr>`
    )
    .join('')

  const body = `
  <div class="doc">
    <div class="head">
      <div>
        <h1>${companyName ? `${companyName} — ` : ''}أمر شراء</h1>
        <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
      </div>
      <div class="meta">
        <div><b>الرقم:</b> ${po.poNumber}</div>
        <div><b>التاريخ:</b> ${fmtDate(po.poDate)}</div>
        <div><b>الحالة:</b> ${po.status}</div>
      </div>
    </div>
    <div class="party">
      <b>المورد:</b> ${po.party?.partyName ?? '—'}${po.party?.mobile ? ` — ${po.party.mobile}` : ''}
      <div><b>العملة:</b> ${po.currency} — <b>سعر الصرف:</b> ${fmt(po.exchangeRate, 4)}</div>
      ${po.lcNumber ? `<div><b>اعتماد بنكي:</b> ${po.lcNumber}${po.lcBank ? ` (${po.lcBank})` : ''}</div>` : ''}
      ${po.expectedArrival ? `<div><b>الوصول المتوقع:</b> ${fmtDate(po.expectedArrival)}</div>` : ''}
    </div>
    <table>
      <thead>
        <tr><th>الكود</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>المجموع الفرعي</td><td>${fmt(po.subtotal)} $</td></tr>
      ${toNum(po.shippingCost) ? `<tr><td>الشحن</td><td>${fmt(po.shippingCost)} $</td></tr>` : ''}
      ${toNum(po.customsCost) ? `<tr><td>الجمارك</td><td>${fmt(po.customsCost)} $</td></tr>` : ''}
      ${toNum(po.insuranceCost) ? `<tr><td>التأمين</td><td>${fmt(po.insuranceCost)} $</td></tr>` : ''}
      ${toNum(po.otherCosts) ? `<tr><td>تكاليف أخرى</td><td>${fmt(po.otherCosts)} $</td></tr>` : ''}
      ${toNum(po.discount) ? `<tr><td>الخصم</td><td>- ${fmt(po.discount)} $</td></tr>` : ''}
      <tr class="grand"><td>الإجمالي</td><td>${fmt(po.totalAmount)} $</td></tr>
    </table>
    ${po.notes ? `<div class="notes"><b>ملاحظات:</b> ${po.notes}</div>` : ''}
    <div class="footer">أمر شراء — P-Sale Ultra Cloud</div>
  </div>`
  openPrintWindow(`أمر شراء ${po.poNumber}`, body)
}

export function printPurchaseInvoice(inv: PurchaseInvoice, companyName?: string): void {
  const items = inv.items ?? []
  const rows = items
    .map(
      (i) =>
        `<tr>
          <td>${i.item?.itemCode ?? '—'}</td>
          <td>${i.item?.itemName ?? '—'}</td>
          <td>${fmt(i.quantity)}</td>
          <td>${fmt(i.unitPriceUsd)} $</td>
          <td>${fmt(i.unitPrice)} د.ل</td>
          <td>${fmt(i.unitCost)} د.ل</td>
          <td>${fmtMoney(i.total)}</td>
        </tr>`
    )
    .join('')

  const body = `
  <div class="doc">
    <div class="head">
      <div>
        <h1>${companyName ? `${companyName} — ` : ''}فاتورة شراء</h1>
        <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
      </div>
      <div class="meta">
        <div><b>رقم الفاتورة:</b> ${inv.invoiceNumber}</div>
        <div><b>التاريخ:</b> ${fmtDate(inv.invoiceDate)}</div>
        <div><b>الحالة:</b> ${inv.paymentStatus}</div>
      </div>
    </div>
    <div class="party">
      <b>المورد:</b> ${inv.party?.partyName ?? '—'}${inv.party?.mobile ? ` — ${inv.party.mobile}` : ''}
      <div><b>العملة:</b> ${inv.currency} — <b>سعر الصرف:</b> ${fmt(inv.exchangeRate, 4)}</div>
      ${inv.warehouse ? `<div><b>المخزن:</b> ${inv.warehouse.name}</div>` : ''}
    </div>
    <table>
      <thead>
        <tr><th>الكود</th><th>الصنف</th><th>الكمية</th><th>سعر $</th><th>سعر د.ل</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>المجموع الفرعي</td><td>${inv.currency === 'USD' ? `${fmt(inv.subtotal)} $` : fmtMoney(inv.subtotal)}</td></tr>
      ${toNum(inv.shippingCost) ? `<tr><td>الشحن</td><td>${inv.currency === 'USD' ? `${fmt(inv.shippingCost)} $` : fmtMoney(inv.shippingCost)}</td></tr>` : ''}
      ${toNum(inv.customsCost) ? `<tr><td>الجمارك</td><td>${inv.currency === 'USD' ? `${fmt(inv.customsCost)} $` : fmtMoney(inv.customsCost)}</td></tr>` : ''}
      <tr class="grand"><td>الإجمالي</td><td>${fmtMoney(inv.total)}</td></tr>
      <tr><td>المدفوع</td><td>${fmtMoney(inv.paidAmount)}</td></tr>
    </table>
    ${inv.notes ? `<div class="notes"><b>ملاحظات:</b> ${inv.notes}</div>` : ''}
    <div class="footer">فاتورة شراء — P-Sale Ultra Cloud</div>
  </div>`
  openPrintWindow(`فاتورة شراء ${inv.invoiceNumber}`, body)
}

export function purchaseOrderText(po: PurchaseOrder): string {
  const lines = [
    `أمر شراء رقم: ${po.poNumber}`,
    `التاريخ: ${fmtDate(po.poDate)}`,
    `المورد: ${po.party?.partyName ?? '—'}`,
    `العملة: ${po.currency} — سعر الصرف: ${fmt(po.exchangeRate, 4)}`,
    '—————————————',
    ...(po.items ?? []).map((i) => `${i.item?.itemName ?? '—'} × ${fmt(i.quantity)} = ${fmt(i.totalUsd)} $`),
    '—————————————',
    `الإجمالي: ${fmt(po.totalAmount)} $`,
  ]
  return lines.filter(Boolean).join('\n')
}

export function purchaseInvoiceText(inv: PurchaseInvoice): string {
  const lines = [
    `فاتورة شراء رقم: ${inv.invoiceNumber}`,
    `التاريخ: ${fmtDate(inv.invoiceDate)}`,
    `المورد: ${inv.party?.partyName ?? '—'}`,
    '—————————————',
    ...(inv.items ?? []).map((i) => `${i.item?.itemName ?? '—'} × ${fmt(i.quantity)} = ${fmt(i.unitPriceUsd)} $ / ${fmtMoney(i.total)}`),
    '—————————————',
    `المجموع: ${inv.currency === 'USD' ? `${fmt(inv.subtotal)} $` : fmtMoney(inv.subtotal)}`,
    `الإجمالي: ${fmtMoney(inv.total)}`,
  ]
  return lines.filter(Boolean).join('\n')
}

export function printInventoryCountSheet(params: {
  countNumber: string
  warehouseName: string
  countDate: string
  items: Array<{
    index: number
    itemCode: string
    itemName: string
    systemQty: string
  }>
}): void {
  const { countNumber, warehouseName, countDate, items } = params
  const rows = items
    .map(
      (it) =>
        `<tr>
          <td>${it.index}</td>
          <td>${it.itemCode}</td>
          <td>${it.itemName}</td>
          <td>${it.systemQty}</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>`
    )
    .join('')

  const body = `
  <div class="doc">
    <div class="head">
      <div>
        <h1>ورقة جرد مخزون</h1>
        <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
      </div>
      <div class="meta">
        <div><b>رقم الجرد:</b> ${countNumber}</div>
        <div><b>المخزن:</b> ${warehouseName}</div>
        <div><b>التاريخ:</b> ${countDate}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>#</th><th>كود الصنف</th><th>اسم الصنف</th><th>الكمية النظامية</th><th>المعدود (صالح)</th><th>المعدود (تالف)</th><th>ملاحظات</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:20px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;color:#475569">
      <b>تعليمات:</b> يرجى عد الكميات الفعلية في المخزن وتعبئة عمود «المعدود (صالح)» و «المعدود (تالف)». 
      قم بتسليم هذه الورقة للمحاسب لإدخال البيانات في النظام.
    </div>
    <div class="footer">P-Sale Ultra Cloud — ورقة جرد</div>
  </div>`
  openPrintWindow(`ورقة جرد — ${countNumber}`, body)
}
