import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { fmtDate, fmtMoney, toNum } from '@/lib/format'
import type { Party, SaleInvoice, PurchaseInvoice, Receipt } from '@/types'

interface Props {
  partyId: number | null
  onClose: () => void
}

const TYPE_LABEL: Record<string, string> = { receipt: 'قبض', payment: 'صرف' }
const PAYMENT_STATUS_LABEL: Record<string, string> = { paid: 'مدفوعة', partial: 'جزئي', unpaid: 'غير مدفوعة' }
const PAYMENT_STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  unpaid: 'bg-red-100 text-red-700',
}
const PAY_TYPE_LABEL: Record<string, string> = { cash: 'كاش', credit: 'آجل', banking: 'مصرفي' }

type Tab = 'summary' | 'sales' | 'purchases' | 'receipts'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'summary', label: 'ملخص' },
  { key: 'sales', label: 'فواتير البيع' },
  { key: 'purchases', label: 'فواتير الشراء' },
  { key: 'receipts', label: 'السندات' },
]

export default function PartyProfile({ partyId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('summary')
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
    setTab('summary')
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

  // الديون حسب طريقة الدفع (لفواتير البيع غير المسددة)
  const debtByPayType = useMemo(() => {
    const map: Record<string, { due: number; count: number }> = {}
    for (const inv of saleInvoices) {
      const due = toNum(inv.total) - toNum(inv.paidAmount)
      if (due <= 0.001) continue
      const k = inv.payType || 'credit'
      if (!map[k]) map[k] = { due: 0, count: 0 }
      map[k].due += due
      map[k].count += 1
    }
    return map
  }, [saleInvoices])

  const totalDebt = useMemo(() => Object.values(debtByPayType).reduce((s, d) => s + d.due, 0), [debtByPayType])

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

          {/* تبويبات */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  tab === t.key ? 'bg-white text-brand-700 shadow' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
                {t.key === 'sales' && ` (${saleInvoices.length})`}
                {t.key === 'purchases' && ` (${purchaseInvoices.length})`}
                {t.key === 'receipts' && ` (${receipts.length})`}
              </button>
            ))}
          </div>

          {tab === 'summary' && (
            <>
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

              {/* الديون حسب طريقة الدفع */}
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-700">💳 الديون حسب طريقة الدفع</h4>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${totalDebt > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    إجمالي المستحق: {fmtMoney(totalDebt)}
                  </span>
                </div>
                {Object.keys(debtByPayType).length === 0 ? (
                  <p className="py-2 text-center text-sm text-slate-400">لا توجد ديون مستحقة — جميع الفواتير مسددة</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {Object.entries(debtByPayType).map(([k, d]) => (
                      <div key={k} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                        <p className="text-xs text-slate-500">{PAY_TYPE_LABEL[k] ?? k} ({d.count} فاتورة)</p>
                        <p className={`mt-1 text-lg font-bold ${d.due > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                          {fmtMoney(d.due)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'sales' && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">🧾 فواتير البيع ({saleInvoices.length})</h4>
              {saleInvoices.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">لا توجد فواتير بيع لهذا الطرف</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>الرقم</th>
                        <th>التاريخ</th>
                        <th>طريقة الدفع</th>
                        <th>الإجمالي</th>
                        <th>المدفوع</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saleInvoices.slice(0, 200).map((inv) => (
                        <tr key={inv.id}>
                          <td className="font-mono">{inv.invoiceNumber}</td>
                          <td>{fmtDate(inv.invoiceDate)}</td>
                          <td>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {PAY_TYPE_LABEL[inv.payType || 'credit'] ?? inv.payType}
                            </span>
                          </td>
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
              )}
            </div>
          )}

          {tab === 'purchases' && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">📦 فواتير الشراء ({purchaseInvoices.length})</h4>
              {purchaseInvoices.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">لا توجد فواتير شراء لهذا الطرف</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>الرقم</th>
                        <th>التاريخ</th>
                        <th>طريقة الدفع</th>
                        <th>الإجمالي</th>
                        <th>المدفوع</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseInvoices.slice(0, 200).map((inv) => (
                        <tr key={inv.id}>
                          <td className="font-mono">{inv.invoiceNumber}</td>
                          <td>{fmtDate(inv.invoiceDate)}</td>
                          <td>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {PAY_TYPE_LABEL[inv.payType || 'credit'] ?? inv.payType}
                            </span>
                          </td>
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
              )}
            </div>
          )}

          {tab === 'receipts' && (
            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">💰 السندات ({receipts.length})</h4>
              {receipts.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">لا توجد سندات لهذا الطرف</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>الرقم</th>
                        <th>التاريخ</th>
                        <th>النوع</th>
                        <th>طريقة الدفع</th>
                        <th>المبلغ</th>
                        <th>العملة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.slice(0, 200).map((r) => (
                        <tr key={r.id}>
                          <td className="font-mono">{r.receiptNumber}</td>
                          <td>{fmtDate(r.receiptDate)}</td>
                          <td>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.receiptType === 'receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {TYPE_LABEL[r.receiptType] ?? r.receiptType}
                            </span>
                          </td>
                          <td>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {r.paymentMethod}
                            </span>
                          </td>
                          <td className="font-semibold">{fmtMoney(toNum(r.amount))}</td>
                          <td>{r.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  )
}