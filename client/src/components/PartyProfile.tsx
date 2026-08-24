import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { fmtDate, fmtMoney, toNum } from '@/lib/format'
import type { Party, SaleInvoice, PurchaseInvoice, Receipt } from '@/types'

interface Props {
  partyId: number | null
  onClose: () => void
}

export default function PartyProfile({ partyId, onClose }: Props) {
  const [party, setParty] = useState<Party | null>(null)
  const [saleInvoices, setSaleInvoices] = useState<SaleInvoice[]>([])
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!partyId) return
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      api.get<Party>(`/parties/${partyId}`),
      api.get(`/sales?partyId=${partyId}&limit=99999`),
      api.get(`/purchases?partyId=${partyId}&limit=99999`),
      api.get(`/treasury/receipts?partyId=${partyId}&limit=99999`),
    ])
      .then(([partyRes, salesRes, purchasesRes, receiptsRes]) => {
        if (cancelled) return
        setParty(partyRes.data)
        setSaleInvoices(salesRes.data.invoices ?? [])
        setPurchaseInvoices(
          (purchasesRes.data.purchases ?? [])
            .filter((p: any) => p.type === 'local')
            .map((p: any) => p.raw as PurchaseInvoice)
        )
        setReceipts(receiptsRes.data.receipts ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(extractError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [partyId])

  const totalSales = useMemo(() => saleInvoices.reduce((s, i) => s + toNum(i.total), 0), [saleInvoices])
  const totalPurchases = useMemo(() => purchaseInvoices.reduce((s, i) => s + toNum(i.total), 0), [purchaseInvoices])
  const totalReceiptsIn = useMemo(() => receipts.filter((r) => r.receiptType === 'receipt').reduce((s, r) => s + toNum(r.amount), 0), [receipts])
  const totalPaymentsOut = useMemo(() => receipts.filter((r) => r.receiptType === 'payment').reduce((s, r) => s + toNum(r.amount), 0), [receipts])

  const TYPE_LABEL: Record<string, string> = { receipt: 'قبض', payment: 'صرف' }
  const PAYMENT_STATUS_LABEL: Record<string, string> = { paid: 'مدفوعة', partial: 'جزئي', unpaid: 'غير مدفوعة' }
  const PAYMENT_STATUS_STYLE: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
    unpaid: 'bg-red-100 text-red-700',
  }

  if (!partyId) return null

  return (
    <Modal open={!!partyId} title="بروفايل الطرف" onClose={onClose} wide>
      {loading ? (
        <p className="py-6 text-center text-slate-400">جارٍ تحميل البيانات...</p>
      ) : error ? (
        <p className="py-6 text-center text-red-500">{error}</p>
      ) : party ? (
        <div className="space-y-4">
          {/* ملخص الطرف */}
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{party.partyName}</h3>
                <p className="text-xs text-slate-500">{party.partyCode} — {party.partyType === 'vendor' ? 'مورد' : 'عميل'}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toNum(party.currentBalance) < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                الرصيد: {fmtMoney(party.currentBalance)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
              {party.phone && <span>📞 {party.phone}</span>}
              {party.mobile && <span>📱 {party.mobile}</span>}
              {party.email && <span>✉️ {party.email}</span>}
              {party.address && <span>📍 {party.address}</span>}
            </div>
          </div>

          {/* إحصائيات سريعة */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
              <p className="text-xs text-blue-600">مبيعات</p>
              <p className="text-lg font-bold text-blue-700">{fmtMoney(totalSales)}</p>
              <p className="text-[10px] text-slate-400">{saleInvoices.length} فاتورة</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-center">
              <p className="text-xs text-orange-600">مشتريات</p>
              <p className="text-lg font-bold text-orange-700">{fmtMoney(totalPurchases)}</p>
              <p className="text-[10px] text-slate-400">{purchaseInvoices.length} فاتورة</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
              <p className="text-xs text-green-600">قبض</p>
              <p className="text-lg font-bold text-green-700">{fmtMoney(totalReceiptsIn)}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-xs text-red-600">صرف</p>
              <p className="text-lg font-bold text-red-700">{fmtMoney(totalPaymentsOut)}</p>
            </div>
          </div>

          {/* فواتير البيع */}
          {saleInvoices.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">🧾 فواتير البيع ({saleInvoices.length})</h4>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>الرقم</th>
                      <th>التاريخ</th>
                      <th>الإجمالي</th>
                      <th>المدفوع</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleInvoices.slice(0, 50).map((inv) => (
                      <tr key={inv.id}>
                        <td className="font-mono">{inv.invoiceNumber}</td>
                        <td>{fmtDate(inv.invoiceDate)}</td>
                        <td className="font-semibold">{fmtMoney(inv.total)}</td>
                        <td>{fmtMoney(inv.paidAmount)}</td>
                        <td>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${PAYMENT_STATUS_STYLE[inv.paymentStatus] ?? ''}`}>
                            {PAYMENT_STATUS_LABEL[inv.paymentStatus] ?? inv.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* فواتير الشراء */}
          {purchaseInvoices.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">📦 فواتير الشراء ({purchaseInvoices.length})</h4>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>الرقم</th>
                      <th>التاريخ</th>
                      <th>الإجمالي</th>
                      <th>المدفوع</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseInvoices.slice(0, 50).map((inv) => (
                      <tr key={inv.id}>
                        <td className="font-mono">{inv.invoiceNumber}</td>
                        <td>{fmtDate(inv.invoiceDate)}</td>
                        <td className="font-semibold">{fmtMoney(inv.total)}</td>
                        <td>{fmtMoney(toNum(inv.paidAmount))}</td>
                        <td>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${PAYMENT_STATUS_STYLE[inv.paymentStatus] ?? ''}`}>
                            {PAYMENT_STATUS_LABEL[inv.paymentStatus] ?? inv.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* السندات */}
          {receipts.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">💰 السندات ({receipts.length})</h4>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>الرقم</th>
                      <th>التاريخ</th>
                      <th>النوع</th>
                      <th>المبلغ</th>
                      <th>العملة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.slice(0, 50).map((r) => (
                      <tr key={r.id}>
                        <td className="font-mono">{r.receiptNumber}</td>
                        <td>{fmtDate(r.receiptDate)}</td>
                        <td>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.receiptType === 'receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {TYPE_LABEL[r.receiptType] ?? r.receiptType}
                          </span>
                        </td>
                        <td className="font-semibold">{fmtMoney(toNum(r.amount))}</td>
                        <td>{r.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {saleInvoices.length === 0 && purchaseInvoices.length === 0 && receipts.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">لا توجد معاملات مسجلة لهذا الطرف</p>
          )}
        </div>
      ) : null}
    </Modal>
  )
}
