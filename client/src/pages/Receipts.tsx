import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmtDate, fmtMoney, toNum } from '@/lib/format'
import { printDocument } from '@/lib/print'
import type { ExchangeRateResponse, Party, Receipt, ReceiptsResponse, Treasury } from '@/types'

const today = () => new Date().toISOString().slice(0, 10)
const LIMIT = 20

const TYPE_LABEL: Record<string, string> = { receipt: 'قبض', payment: 'صرف' }
const PAYMENT_LABEL: Record<string, string> = {
  cash: 'نقدي',
  check: 'شيك',
  transfer: 'تحويل بنكي',
  card: 'بطاقة',
}
const CURRENCY_LABEL: Record<string, string> = { LYD: 'د.ل', USD: '$' }

interface ReceiptForm {
  receiptDate: string
  receiptType: string
  partyId: number | null
  treasuryId: number | null
  currency: string
  exchangeRate: number | string
  amount: number
  paymentMethod: string
  checkNumber: string
  bankName: string
  referenceNo: string
  saleInvoiceId: string
  purchaseInvoiceId: string
  notes: string
}

const emptyForm = (): ReceiptForm => ({
  receiptDate: today(),
  receiptType: 'receipt',
  partyId: null,
  treasuryId: null,
  currency: 'LYD',
  exchangeRate: 1,
  amount: 0,
  paymentMethod: 'cash',
  checkNumber: '',
  bankName: '',
  referenceNo: '',
  saleInvoiceId: '',
  purchaseInvoiceId: '',
  notes: '',
})

export default function Receipts() {
  const { selectedBranchId } = useBranchFilter()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState('')
  const [treasuryId, setTreasuryId] = useState(0)
  const [partyId, setPartyId] = useState(0)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ReceiptsResponse | null>(null)
  const [treasuries, setTreasuries] = useState<Treasury[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [view, setView] = useState<Receipt | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<ReceiptForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    const br = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
    Promise.all([api.get(`/treasury${br}`), api.get('/parties')])
      .then(([t, p]) => {
        if (!cancelled) {
          setTreasuries(t.data)
          setParties(p.data.parties ?? p.data)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(extractError(err))
      })
    return () => {
      cancelled = true
    }
  }, [selectedBranchId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string | number> = { page, limit: LIMIT }
      if (selectedBranchId) params.branchId = selectedBranchId
      if (from) params.from = from
      if (to) params.to = to
      if (type) params.type = type
      if (treasuryId) params.treasuryId = treasuryId
      if (partyId) params.partyId = partyId
      const key = `receipts:${selectedBranchId ?? 'all'}:${page}:${from}:${to}:${type}:${treasuryId}:${partyId}:${version}`
      const res = await cachedRead<ReceiptsResponse>(key, () =>
        api.get('/treasury/receipts', { params }).then((r) => r.data), 'treasuries'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [page, from, to, type, treasuryId, partyId, version, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const pageCount = useMemo(() => (data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1), [data])
  const countReceipt = useMemo(() => (data?.receipts ?? []).filter((r) => r.receiptType === 'receipt').length, [data])
  const countPayment = useMemo(() => (data?.receipts ?? []).filter((r) => r.receiptType === 'payment').length, [data])

  const openCreate = async () => {
    setForm(emptyForm())
    setFormError('')
    setShowCreate(true)
    try {
      const res = await api.get<ExchangeRateResponse>('/exchange/rate/USD/LYD')
      setForm((f) => ({ ...f, exchangeRate: res.data.rate ?? 1 }))
    } catch {
      // يبقى 1
    }
  }

  const amountUsd = useMemo(() => {
    const rate = toNum(form.exchangeRate)
    return form.currency === 'USD' ? form.amount : form.amount / (rate || 1)
  }, [form.currency, form.amount, form.exchangeRate])

  const amountLyd = useMemo(() => {
    const rate = toNum(form.exchangeRate)
    return form.currency === 'LYD' ? form.amount : form.amount * (rate || 1)
  }, [form.currency, form.amount, form.exchangeRate])

  const handleSave = async () => {
    if (!form.treasuryId) {
      setFormError('الخزينة مطلوبة')
      return
    }
    if (form.amount <= 0) {
      setFormError('المبلغ غير صالح')
      return
    }
    if (form.currency === 'USD' && toNum(form.exchangeRate) <= 0) {
      setFormError('سعر الصرف غير صالح')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await offlineWrite<Receipt>(
        '/treasury/receipts',
        'POST',
        {
          receiptDate: form.receiptDate,
          receiptType: form.receiptType,
          partyId: form.partyId,
          treasuryId: form.treasuryId,
          currency: form.currency,
          exchangeRate: toNum(form.exchangeRate),
          amount: form.amount,
          paymentMethod: form.paymentMethod,
          checkNumber: form.checkNumber.trim() || undefined,
          bankName: form.bankName.trim() || undefined,
          referenceNo: form.referenceNo.trim() || undefined,
          saleInvoiceId: form.saleInvoiceId ? Number(form.saleInvoiceId) : undefined,
          purchaseInvoiceId: form.purchaseInvoiceId ? Number(form.purchaseInvoiceId) : undefined,
          notes: form.notes.trim() || undefined,
        },
        { entity: 'receipt' }
      )
      setShowCreate(false)
      setVersion((v) => v + 1)
      setPage(1)
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = (r: Receipt) => {
    const body = `
    <div class="doc">
      <div class="head">
        <div>
          <h1>سند ${TYPE_LABEL[r.receiptType] ?? r.receiptType}</h1>
          <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
        </div>
        <div class="meta">
          <div><b>رقم السند:</b> ${r.receiptNumber}</div>
          <div><b>التاريخ:</b> ${fmtDate(r.receiptDate)}</div>
        </div>
      </div>
      <table class="totals">
        <tr><td>الطرف</td><td>${r.party?.partyName ?? '—'}</td></tr>
        <tr><td>الخزينة</td><td>${r.treasury?.treasuryName ?? '—'}</td></tr>
        <tr><td>العملة</td><td>${CURRENCY_LABEL[r.currency] ?? r.currency} (سعر الصرف ${toNum(r.exchangeRate)})</td></tr>
        <tr><td>طريقة الدفع</td><td>${PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod}${r.checkNumber ? ` — شيك ${r.checkNumber}` : ''}</td></tr>
        <tr class="grand"><td>المبلغ (${CURRENCY_LABEL[r.currency] ?? r.currency})</td><td>${fmtMoney(r.currency === 'USD' ? toNum(r.amountUsd) : toNum(r.amount))}</td></tr>
        ${r.currency !== 'LYD' ? `<tr><td>المبلغ المعادل (د.ل)</td><td>${fmtMoney(r.amount)}</td></tr>` : ''}
        ${r.notes ? `<tr><td>ملاحظات</td><td>${r.notes}</td></tr>` : ''}
      </table>
      <div class="footer">سند ${TYPE_LABEL[r.receiptType] ?? r.receiptType} — P-Sale Ultra Cloud</div>
    </div>`
    printDocument(`سند ${TYPE_LABEL[r.receiptType] ?? r.receiptType} ${r.receiptNumber}`, body)
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">سندات القبض والصرف</h1>
          <p className="text-sm text-slate-500">
            إجمالي {data?.total ?? 0} سند — قبض {countReceipt} • صرف {countPayment}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">＋ سند جديد</button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="label">من تاريخ</label>
          <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label className="label">إلى تاريخ</label>
          <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label className="label">النوع</label>
          <select className="input" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
            <option value="">الكل</option>
            <option value="receipt">قبض</option>
            <option value="payment">صرف</option>
          </select>
        </div>
        <div>
          <label className="label">الخزينة</label>
          <select className="input" value={treasuryId} onChange={(e) => { setTreasuryId(Number(e.target.value)); setPage(1) }}>
            <option value={0}>الكل</option>
            {treasuries.map((t) => (
              <option key={t.id} value={t.id}>{t.treasuryName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">الطرف</label>
          <select className="input" value={partyId} onChange={(e) => { setPartyId(Number(e.target.value)); setPage(1) }}>
            <option value={0}>الكل</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.partyName}</option>
            ))}
          </select>
        </div>
        {(from || to || type || treasuryId || partyId) && (
          <button
            className="btn-secondary"
            onClick={() => { setFrom(''); setTo(''); setType(''); setTreasuryId(0); setPartyId(0); setPage(1) }}
          >
            ✕ مسح الفلاتر
          </button>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل السندات...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>الطرف</th>
                <th>الخزينة</th>
                <th>المبلغ</th>
                <th>طريقة الدفع</th>
                <th className="text-right">عرض</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.receipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">لا توجد سندات في هذه الفلاتر</td>
                </tr>
              ) : (
                data.receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="font-mono text-xs">{r.receiptNumber}</td>
                    <td>{fmtDate(r.receiptDate)}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.receiptType === 'receipt' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                        {TYPE_LABEL[r.receiptType]}
                      </span>
                    </td>
                    <td>{r.party?.partyName ?? '—'}</td>
                    <td>{r.treasury?.treasuryName ?? '—'}</td>
                    <td className="font-semibold">{fmtMoney(r.currency === 'USD' ? toNum(r.amountUsd) : toNum(r.amount))}</td>
                    <td>
                      <span className="text-xs text-slate-500">{PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod}</span>
                      {r.checkNumber && <span className="block text-xs text-slate-400">شيك {r.checkNumber}</span>}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setView(r)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="التفاصيل"
                      >
                        👁️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                → السابق
              </button>
              <span className="text-sm text-slate-500">صفحة {page} من {pageCount}</span>
              <button
                className="btn-secondary"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي ←
              </button>
            </div>
          )}
        </div>
      )}

      <Modal open={!!view} title={view ? `سند ${TYPE_LABEL[view.receiptType] ?? ''} ${view.receiptNumber}` : ''} onClose={() => setView(null)}>
        {view && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">التاريخ:</span> <b>{fmtDate(view.receiptDate)}</b></div>
              <div><span className="text-slate-500">النوع:</span> <b>{TYPE_LABEL[view.receiptType]}</b></div>
              <div><span className="text-slate-500">الطرف:</span> <b>{view.party?.partyName ?? '—'}</b></div>
              <div><span className="text-slate-500">الخزينة:</span> <b>{view.treasury?.treasuryName ?? '—'}</b></div>
              <div>
                <span className="text-slate-500">العملة:</span>{' '}
                <b>{CURRENCY_LABEL[view.currency] ?? view.currency}</b> (سعر الصرف {toNum(view.exchangeRate)})
              </div>
              <div><span className="text-slate-500">المبلغ:</span> <b>{fmtMoney(view.currency === 'USD' ? toNum(view.amountUsd) : toNum(view.amount))}</b></div>
              {view.currency !== 'LYD' && (
                <div><span className="text-slate-500">المعادل (د.ل):</span> <b>{fmtMoney(view.amount)}</b></div>
              )}
              <div><span className="text-slate-500">طريقة الدفع:</span> <b>{PAYMENT_LABEL[view.paymentMethod] ?? view.paymentMethod}</b></div>
              {view.checkNumber && <div><span className="text-slate-500">رقم الشيك:</span> <b>{view.checkNumber}</b></div>}
              {view.bankName && <div><span className="text-slate-500">البنك:</span> <b>{view.bankName}</b></div>}
              {view.referenceNo && <div><span className="text-slate-500">رقم مرجعي:</span> <b>{view.referenceNo}</b></div>}
              {view.journalEntry && (
                <div><span className="text-slate-500">القيد المحاسبي:</span> <b>JRN-{view.journalEntry.entryNumber}</b></div>
              )}
            </div>
            {view.notes && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">📝 {view.notes}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => handlePrint(view)} className="btn-primary">🖨️ طباعة</button>
              <button onClick={() => setView(null)} className="btn-secondary">إغلاق</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showCreate} title="سند قبض / صرف جديد" onClose={() => setShowCreate(false)} wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">نوع السند</label>
              <select className="input" value={form.receiptType} onChange={(e) => setForm({ ...form, receiptType: e.target.value })}>
                <option value="receipt">قبض</option>
                <option value="payment">صرف</option>
              </select>
            </div>
            <div>
              <label className="label">التاريخ</label>
              <input type="date" className="input" value={form.receiptDate} onChange={(e) => setForm({ ...form, receiptDate: e.target.value })} />
            </div>
            <div>
              <label className="label">الخزينة</label>
              <select className="input" value={form.treasuryId ?? ''} onChange={(e) => setForm({ ...form, treasuryId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— اختر الخزينة —</option>
                {treasuries.map((t) => (
                  <option key={t.id} value={t.id}>{t.treasuryName} ({CURRENCY_LABEL[t.currency] ?? t.currency})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">الطرف (اختياري)</label>
              <select className="input" value={form.partyId ?? ''} onChange={(e) => setForm({ ...form, partyId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— بلا طرف —</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.partyName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">العملة</label>
              <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="LYD">دينار ليبي (د.ل)</option>
                <option value="USD">دولار ($)</option>
              </select>
            </div>
            <div>
              <label className="label">المبلغ</label>
              <input type="number" step="0.001" min={0} className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            {form.currency === 'USD' && (
              <div>
                <label className="label">سعر الصرف (USD → LYD)</label>
                <input type="number" step="0.000001" className="input" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">طريقة الدفع</label>
              <select className="input" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="cash">نقدي</option>
                <option value="check">شيك</option>
                <option value="transfer">تحويل بنكي</option>
                <option value="card">بطاقة</option>
              </select>
            </div>
          </div>

          {form.currency === 'USD' && (
            <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
              المعادل: {fmtMoney(amountLyd)} د.ل — بالدولار: {fmtMoney(amountUsd).replace('د.ل', '$')}
            </div>
          )}

          {(form.paymentMethod === 'check' || form.paymentMethod === 'transfer') && (
            <div className="grid grid-cols-2 gap-3">
              {form.paymentMethod === 'check' && (
                <div>
                  <label className="label">رقم الشيك</label>
                  <input className="input" value={form.checkNumber} onChange={(e) => setForm({ ...form, checkNumber: e.target.value })} />
                </div>
              )}
              <div>
                <label className="label">البنك</label>
                <input className="input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
              </div>
            </div>
          )}

          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-600">⚙️ خيارات متقدمة</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">رقم مرجعي</label>
                <input className="input" value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} placeholder="رقم الفاتورة/المرجع الخارجي" />
              </div>
              <div>
                <label className="label">ربط فاتورة بيع (معرف)</label>
                <input type="number" className="input" value={form.saleInvoiceId} onChange={(e) => setForm({ ...form, saleInvoiceId: e.target.value })} placeholder="saleInvoiceId" />
              </div>
              <div>
                <label className="label">ربط فاتورة شراء (معرف)</label>
                <input type="number" className="input" value={form.purchaseInvoiceId} onChange={(e) => setForm({ ...form, purchaseInvoiceId: e.target.value })} placeholder="purchaseInvoiceId" />
              </div>
              <div className="col-span-2">
                <label className="label">ملاحظات</label>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </details>

          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">إلغاء</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'جارٍ الحفظ...' : 'حفظ السند'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
