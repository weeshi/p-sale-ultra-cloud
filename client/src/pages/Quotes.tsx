import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal'
import Pagination, { DEFAULT_PAGE_SIZE, usePaginate } from '@/components/Pagination'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { fmt, fmtDate, fmtMoney, toNum } from '@/lib/format'
import { mailLink, printQuote, quoteText, waLink } from '@/lib/print'
import type { Quote, Treasury, Warehouse } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة',
  sent: 'مُرسل',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  converted: 'محوّل',
}

export default function Quotes() {
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [treasuries, setTreasuries] = useState<Treasury[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [viewQuote, setViewQuote] = useState<Quote | null>(null)
  const [converting, setConverting] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Quote | null>(null)
  const [warehouseId, setWarehouseId] = useState('')
  const [treasuryId, setTreasuryId] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)

  const loadQuotes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await cachedRead<Quote[]>('quotes:list', () =>
        api.get('/sales/quotes/list').then((r) => r.data), 'sales'
      )
      setQuotes(res.data ?? [])
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadQuotes()
;(async () => {
        try {
          const [w, t] = await Promise.all([
            cachedRead<Warehouse[]>('warehouses:list', () => api.get('/warehouses').then((r) => r.data), 'warehouses'
            ),
            cachedRead<Treasury[]>('treasuries:list', () => api.get('/treasury').then((r) => r.data), 'treasuries'
            ),
          ])
          setWarehouses(w.data ?? [])
          setTreasuries(t.data ?? [])
        } catch {
        // تُترك القوائم فارغة
      }
    })()
  }, [loadQuotes])

  const { paginated, total } = usePaginate(quotes, limit, page)

  const openConvert = (q: Quote) => {
    setConvertTarget(q)
    setWarehouseId('')
    setTreasuryId('')
    setConvertOpen(true)
  }

  const handleConvert = async () => {
    if (!convertTarget) return
    if (!warehouseId) {
      setError('المخزن مطلوب للتحويل')
      return
    }
    setConverting(true)
    setError('')
    try {
      const res = await api.post<{ invoiceNumber: string }>(`/sales/quotes/${convertTarget.id}/convert`, {
        warehouseId: Number(warehouseId),
        treasuryId: treasuryId ? Number(treasuryId) : undefined,
      })
      setConvertOpen(false)
      setViewQuote(null)
      window.alert(`تم تحويل العرض إلى فاتورة ${res.data.invoiceNumber}`)
      await loadQuotes()
      navigate('/sales')
    } catch (err) {
      setError(extractError(err))
    } finally {
      setConverting(false)
    }
  }

  const shareWhatsApp = (q: Quote) => {
    const phone = q.party?.whatsapp || q.party?.mobile
    const link = waLink(phone, quoteText(q))
    if (link) window.open(link, '_blank')
    else setError('لا يوجد رقم واتساب لهذا العميل')
  }

  const shareEmail = (q: Quote) => {
    const link = mailLink(q.party?.email, `عرض سعر ${q.quoteNumber}`, quoteText(q))
    if (link) window.location.href = link
    else setError('لا يوجد بريد إلكتروني لهذا العميل')
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">عروض الأسعار</h1>
          <p className="text-sm text-slate-500">إدارة العروض وتحويلها إلى فواتير</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/sales')} className="btn-secondary">🧾 شاشة البيع</button>
          <button onClick={() => navigate('/sales')} className="btn-primary">+ عرض سعر جديد</button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل العروض...</p>
      ) : quotes.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد عروض أسعار</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>العميل</th>
                <th>صالحة حتى</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((q) => (
                <tr key={q.id}>
                  <td className="font-mono text-xs">{q.quoteNumber}</td>
                  <td>{fmtDate(q.quoteDate)}</td>
                  <td>{q.party?.partyName ?? '—'}</td>
                  <td>{fmtDate(q.validUntil)}</td>
                  <td className="font-semibold">{fmtMoney(q.total)}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        q.status === 'converted'
                          ? 'bg-green-100 text-green-700'
                          : q.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {STATUS_LABEL[q.status] ?? q.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setViewQuote(q)} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">
                        عرض
                      </button>
                      {q.status !== 'converted' && (
                        <button onClick={() => openConvert(q)} className="rounded px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                          تحويل
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      )}

      {/* تفاصيل العرض */}
      <Modal open={viewQuote !== null} title="تفاصيل عرض السعر" onClose={() => setViewQuote(null)} wide>
        {viewQuote ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-800">{viewQuote.quoteNumber}</p>
                <p className="text-xs text-slate-500">{fmtDate(viewQuote.quoteDate)} — صالحة حتى {fmtDate(viewQuote.validUntil)}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {STATUS_LABEL[viewQuote.status] ?? viewQuote.status}
              </span>
            </div>
            <p className="mb-2 text-sm text-slate-600">العميل: <b>{viewQuote.party?.partyName ?? '—'}</b></p>
            <div className="max-h-64 overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewQuote.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td>{i.item?.itemName ?? '—'}</td>
                      <td>{fmt(i.quantity)}</td>
                      <td>{fmtMoney(i.unitPrice)}</td>
                      <td className="font-semibold">{fmtMoney(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-between rounded-lg bg-slate-50 p-3">
              <span className="text-slate-600">الإجمالي</span>
              <span className="text-lg font-bold text-brand-700">{fmtMoney(viewQuote.total)}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => printQuote(viewQuote, undefined)} className="btn-primary flex-1">🖨️ طباعة</button>
              <button onClick={() => shareWhatsApp(viewQuote)} className="btn-secondary">💬 واتساب</button>
              <button onClick={() => shareEmail(viewQuote)} className="btn-secondary">✉️ بريد</button>
              {viewQuote.status !== 'converted' && (
                <button onClick={() => openConvert(viewQuote)} className="btn-secondary">🔄 تحويل إلى فاتورة</button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* نافذة التحويل */}
      <Modal open={convertOpen} title={`تحويل عرض ${convertTarget?.quoteNumber ?? ''} إلى فاتورة`} onClose={() => setConvertOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="label">المخزن *</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— اختر —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">الخزينة</label>
            <select className="input" value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
              <option value="">—</option>
              {treasuries.map((t) => (
                <option key={t.id} value={t.id}>{t.treasuryName}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500">الإجمالي: <b>{fmtMoney(toNum(convertTarget?.total))}</b></p>
          <div className="flex gap-2">
            <button onClick={handleConvert} disabled={converting} className="btn-primary flex-1">
              {converting ? 'جارٍ التحويل...' : 'تحويل إلى فاتورة'}
            </button>
            <button onClick={() => setConvertOpen(false)} className="btn-secondary flex-1">إلغاء</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
