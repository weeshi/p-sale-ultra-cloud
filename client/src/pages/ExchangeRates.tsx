import { useCallback, useEffect, useState } from 'react'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmt, fmtDate, toNum } from '@/lib/format'
import type { ExchangeRateEntry, ExchangeRateResponse } from '@/types'

const CURRENCIES = [
  { key: 'USD', label: 'دولار أمريكي ($)' },
  { key: 'LYD', label: 'دينار ليبي (د.ل)' },
  { key: 'EUR', label: 'يورو (€)' },
  { key: 'CNY', label: 'يوان صيني (¥)' },
]

export default function ExchangeRates() {
  const [current, setCurrent] = useState<number>(0)
  const [history, setHistory] = useState<ExchangeRateEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const [fromCurrency, setFromCurrency] = useState('USD')
  const [toCurrency, setToCurrency] = useState('LYD')
  const [rate, setRate] = useState('')
  const [rateDate, setRateDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [note, setNote] = useState('')
  const [updating, setUpdating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [r, h] = await Promise.all([
        cachedRead<ExchangeRateResponse>(`exchange:current:${version}`, () =>
          api.get('/exchange/rate/USD/LYD').then((res) => res.data), 'settings'
        ),
        cachedRead<ExchangeRateEntry[]>(`exchange:history:${version}`, () =>
          api.get('/exchange/history/USD/LYD').then((res) => res.data), 'settings'
        ),
      ])
      setCurrent(toNum(r.data.rate))
      setHistory(h.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    load()
  }, [load])

  const refresh = () => setVersion((v) => v + 1)

  const handleManual = async () => {
    const rateNum = toNum(rate)
    if (!rateNum || rateNum <= 0) {
      setFormError('أدخل سعر صرف صحيحاً')
      return
    }
    if (fromCurrency === toCurrency) {
      setFormError('يجب اختيار عملتين مختلفتين')
      return
    }
    setSaving(true)
    setFormError('')
    setNote('')
    try {
      await offlineWrite<ExchangeRateEntry>(
        '/exchange',
        'POST',
        {
          fromCurrency,
          toCurrency,
          rate: rateNum,
          date: rateDate ? new Date(rateDate).toISOString() : undefined,
        },
        { entity: 'exchangeRate' }
      )
      setNote('✓ تم تحديث سعر الصرف')
      setRate('')
      refresh()
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleAutoUpdate = async () => {
    setUpdating(true)
    setError('')
    try {
      const res = await api.post('/exchange/update')
      setNote(
        res.data?.updated
          ? `✓ تم التحديث التلقائي — السعر ${fmt(res.data.rate)}`
          : (res.data?.message ?? 'لا يوجد تحديث')
      )
      refresh()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">أسعار الصرف</h1>
        <p className="text-sm text-slate-500">سعر صرف الدولار مقابل الدينار وتحديثه يدوياً أو تلقائياً</p>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {note && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{note}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل أسعار الصرف...</p>
      ) : (
        <div className="space-y-6">
          <div className="card flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">السعر الحالي — الدولار مقابل الدينار</p>
              <p className="text-4xl font-extrabold text-brand-700">
                {fmt(current, 3)} <span className="text-lg text-slate-400">د.ل / $</span>
              </p>
            </div>
            <button onClick={handleAutoUpdate} disabled={updating} className="btn-primary">
              {updating ? 'جارٍ التحديث...' : '⟳ تحديث تلقائي'}
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-lg font-bold text-slate-800">تحديث يدوي</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">من عملة</label>
                  <select className="input" value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">إلى عملة</label>
                  <select className="input" value={toCurrency} onChange={(e) => setToCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">السعر</label>
                  <input
                    className="input"
                    dir="ltr"
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="مثال: 8.5"
                  />
                </div>
                <div>
                  <label className="label">التاريخ (اختياري)</label>
                  <input type="date" className="input" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
                </div>
              </div>
              {formError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}
              <div className="mt-3 flex justify-end">
                <button onClick={handleManual} disabled={saving} className="btn-primary">
                  {saving ? 'جارٍ الحفظ...' : 'حفظ السعر'}
                </button>
              </div>
            </div>

            <div className="card overflow-hidden p-0">
              <div className="border-b border-slate-100 p-4">
                <h2 className="text-lg font-bold text-slate-800">سجل الأسعار (USD → LYD)</h2>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="table">
                  <thead className="sticky top-0">
                    <tr>
                      <th>التاريخ</th>
                      <th className="text-right">السعر</th>
                      <th className="text-right">المصدر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-400">لا يوجد سجل</td>
                      </tr>
                    ) : (
                      history.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="text-xs text-slate-500">{fmtDate(h.rateDate)}</td>
                          <td className="text-right font-bold text-slate-800">{fmt(h.rate, 3)}</td>
                          <td className="text-right">
                            {h.isAuto ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">تلقائي</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">يدوي</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
