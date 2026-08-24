import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmtDate, fmtMoney, toNum } from '@/lib/format'
import type {
  BankReconciliation,
  BankTransactionRow,
  BankTransactionsResponse,
  Treasury,
} from '@/types'

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة',
  matched: 'مطابقة',
  completed: 'مكتملة',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800',
  matched: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-sky-100 text-sky-800',
}
const SIGN_LABEL: Record<string, string> = { receipt: 'قبض', payment: 'صرف' }

interface ReconForm {
  treasuryId: number | null
  from: string
  statementDate: string
  openingBalance: number | string
  statementBalance: number | string
  notes: string
}

const emptyForm = (): ReconForm => ({
  treasuryId: null,
  from: monthStart(),
  statementDate: today(),
  openingBalance: '',
  statementBalance: '',
  notes: '',
})

export default function BankReconciliation() {
  const [list, setList] = useState<BankReconciliation[]>([])
  const [treasuries, setTreasuries] = useState<Treasury[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<ReconForm>(emptyForm)
  const [txData, setTxData] = useState<BankTransactionsResponse | null>(null)
  const [loadingTx, setLoadingTx] = useState(false)
  const [matched, setMatched] = useState<Record<number, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [view, setView] = useState<BankReconciliation | null>(null)

  useEffect(() => {
    api
      .get<Treasury[]>('/treasury')
      .then((res) => setTreasuries(res.data.filter((t) => t.treasuryType === 'bank' && t.isActive !== false)))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const key = `bankReconciliations:${version}`
      const res = await cachedRead<BankReconciliation[]>(key, () =>
        api.get('/treasury/reconciliations').then((r) => r.data), 'treasuries'
      )
      setList(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    load()
  }, [load])

  const loadTx = useCallback(async () => {
    if (!form.treasuryId) {
      setFormError('اختر الخزينة البنكية')
      return
    }
    setLoadingTx(true)
    setFormError('')
    try {
      const params: Record<string, string> = { from: form.from, to: form.statementDate }
      const res = await api.get<BankTransactionsResponse>(
        `/treasury/reconciliations/${form.treasuryId}/transactions`,
        { params }
      )
      setTxData(res.data)
      setForm((f) => ({ ...f, openingBalance: f.openingBalance === '' ? res.data.openingBalance : f.openingBalance }))
      setMatched(Object.fromEntries(res.data.transactions.map((t) => [t.id, true])))
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setLoadingTx(false)
    }
  }, [form.treasuryId, form.from, form.statementDate])

  const matchedSignedTotal = useMemo(() => {
    const open = toNum(form.openingBalance)
    const sum = (txData?.transactions ?? []).reduce(
      (s, t) => (matched[t.id] ? s + toNum(t.signed) : s),
      0
    )
    return open + sum
  }, [txData, matched, form.openingBalance])

  const difference = useMemo(() => {
    return toNum(form.statementBalance) - matchedSignedTotal
  }, [form.statementBalance, matchedSignedTotal])

  const matchedCount = useMemo(
    () => (txData?.transactions ?? []).filter((t) => matched[t.id]).length,
    [txData, matched]
  )

  const openCreate = () => {
    setForm(emptyForm())
    setTxData(null)
    setMatched({})
    setFormError('')
    setShowCreate(true)
  }

  const handleSave = async () => {
    if (!form.treasuryId) {
      setFormError('الخزينة البنكية مطلوبة')
      return
    }
    if (form.statementBalance === '' || form.statementBalance === null) {
      setFormError('رصيد كشف البنك مطلوب')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await offlineWrite<BankReconciliation>(
        '/treasury/reconciliations',
        'POST',
        {
          treasuryId: form.treasuryId,
          from: form.from,
          statementDate: form.statementDate,
          openingBalance: toNum(form.openingBalance),
          statementBalance: toNum(form.statementBalance),
          matchedReceiptIds: (txData?.transactions ?? [])
            .filter((t) => matched[t.id])
            .map((t) => t.id),
          notes: form.notes.trim() || undefined,
        },
        { entity: 'bankReconciliation' }
      )
      setShowCreate(false)
      setVersion((v) => v + 1)
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const openView = async (r: BankReconciliation) => {
    try {
      const res = await api.get<BankReconciliation>(`/treasury/reconciliations/${r.id}`)
      setView(res.data)
    } catch (err) {
      setError(extractError(err))
    }
  }

  const handleComplete = async () => {
    if (!view) return
    try {
      const res = await api.post<BankReconciliation>(`/treasury/reconciliations/${view.id}/complete`)
      setView(res.data)
      setVersion((v) => v + 1)
    } catch (err) {
      setFormError(extractError(err))
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">التسوية البنكية</h1>
          <p className="text-sm text-slate-500">مطابقة سندات القبض والصرف مع كشف حساب المصرف</p>
        </div>
        <button onClick={openCreate} className="btn-primary">＋ تسوية جديدة</button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل التسويات...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>الخزينة</th>
                <th>رصيد كشف البنك</th>
                <th>رصيد النظام</th>
                <th>الفرق</th>
                <th>الحالة</th>
                <th>عدد السندات</th>
                <th className="text-right">عرض</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">لا توجد تسويات بعد</td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="font-mono text-xs">{r.reconNumber}</td>
                    <td>{fmtDate(r.statementDate)}</td>
                    <td>{r.treasury?.treasuryName ?? '—'}</td>
                    <td>{fmtMoney(r.statementBalance)}</td>
                    <td>{fmtMoney(r.systemBalance)}</td>
                    <td className={toNum(r.difference) < 0 ? 'text-red-600' : 'text-emerald-600'}>
                      {fmtMoney(r.difference)}
                    </td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td>{r._count?.lines ?? 0}</td>
                    <td className="text-right">
                      <button
                        onClick={() => openView(r)}
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
        </div>
      )}

      <Modal open={showCreate} title="تسوية بنكية جديدة" onClose={() => setShowCreate(false)} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="label">الخزينة البنكية</label>
              <select
                className="input"
                value={form.treasuryId ?? ''}
                onChange={(e) => setForm({ ...form, treasuryId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— اختر الخزينة —</option>
                {treasuries.map((t) => (
                  <option key={t.id} value={t.id}>{t.treasuryName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">من تاريخ</label>
              <input type="date" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </div>
            <div>
              <label className="label">تاريخ الكشف</label>
              <input type="date" className="input" value={form.statementDate} onChange={(e) => setForm({ ...form, statementDate: e.target.value })} />
            </div>
            <div className="flex items-end">
              <button onClick={loadTx} disabled={loadingTx || !form.treasuryId} className="btn-primary w-full">
                {loadingTx ? 'جارٍ الجلب...' : 'جلب السندات'}
              </button>
            </div>
          </div>

          {txData && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="label">رصيد افتتاحي</label>
                  <input type="number" step="0.001" className="input" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
                </div>
                <div>
                  <label className="label">رصيد كشف البنك</label>
                  <input type="number" step="0.001" className="input" value={form.statementBalance} onChange={(e) => setForm({ ...form, statementBalance: e.target.value })} />
                </div>
                <div>
                  <label className="label">رصيد النظام (المطابق)</label>
                  <div className="input bg-slate-50 font-semibold">{fmtMoney(matchedSignedTotal)}</div>
                </div>
                <div>
                  <label className="label">الفرق</label>
                  <div className={`input bg-slate-50 font-bold ${difference < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {fmtMoney(difference)}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-700">
                    سندات الفترة ({txData.transactions.length}) — مطابق {matchedCount}
                  </span>
                  <span className="text-xs text-slate-500">
                    رصيد النظام الختامي (كل السندات): {fmtMoney(txData.closingSystemBalance)}
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="w-10">✓</th>
                        <th>الرقم</th>
                        <th>التاريخ</th>
                        <th>النوع</th>
                        <th>الطرف</th>
                        <th>المبلغ</th>
                        <th>الرصيد التراكمي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txData.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">لا توجد سندات في هذه الفترة</td>
                        </tr>
                      ) : (
                        txData.transactions.map((t: BankTransactionRow) => (
                          <tr key={t.id} className={matched[t.id] ? '' : 'bg-slate-50 text-slate-400'}>
                            <td>
                              <input
                                type="checkbox"
                                checked={!!matched[t.id]}
                                onChange={(e) => setMatched((m) => ({ ...m, [t.id]: e.target.checked }))}
                                className="h-4 w-4 accent-brand-600"
                              />
                            </td>
                            <td className="font-mono text-xs">{t.receiptNumber}</td>
                            <td>{fmtDate(t.receiptDate)}</td>
                            <td>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${t.receiptType === 'receipt' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                                {SIGN_LABEL[t.receiptType]}
                              </span>
                            </td>
                            <td>{t.party?.partyName ?? '—'}</td>
                            <td className="font-semibold">{fmtMoney(t.signed)}</td>
                            <td>{fmtMoney(t.runningBalance)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className="label">ملاحظات</label>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              {Math.abs(difference) < 0.01 && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ التسوية متوازنة (الفرق صفر)</p>
              )}
            </>
          )}

          {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">إلغاء</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'جارٍ الحفظ...' : 'حفظ التسوية'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!view} title={view ? `تسوية ${view.reconNumber}` : ''} onClose={() => setView(null)} wide>
        {view && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><span className="text-slate-500">التاريخ:</span> <b>{fmtDate(view.statementDate)}</b></div>
              <div><span className="text-slate-500">الخزينة:</span> <b>{view.treasury?.treasuryName ?? '—'}</b></div>
              <div>
                <span className="text-slate-500">الحالة:</span>{' '}
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_COLOR[view.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABEL[view.status] ?? view.status}
                </span>
              </div>
              <div><span className="text-slate-500">رصيد كشف البنك:</span> <b>{fmtMoney(view.statementBalance)}</b></div>
              <div><span className="text-slate-500">رصيد النظام:</span> <b>{fmtMoney(view.systemBalance)}</b></div>
              <div className={toNum(view.difference) < 0 ? 'text-red-600' : 'text-emerald-600'}>
                <span className="text-slate-500">الفرق:</span> <b>{fmtMoney(view.difference)}</b>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10">✓</th>
                    <th>الرقم</th>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>الطرف</th>
                    <th>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {!view.lines || view.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">لا توجد سندات</td>
                    </tr>
                  ) : (
                    view.lines.map((l) => (
                      <tr key={l.id} className={l.isMatched ? '' : 'bg-slate-50 text-slate-400'}>
                        <td>{l.isMatched ? '✓' : '—'}</td>
                        <td className="font-mono text-xs">{l.receipt?.receiptNumber ?? '—'}</td>
                        <td>{l.receipt ? fmtDate(l.receipt.receiptDate) : '—'}</td>
                        <td>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${l.receipt?.receiptType === 'receipt' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                            {l.receipt ? SIGN_LABEL[l.receipt.receiptType] : '—'}
                          </span>
                        </td>
                        <td>{l.receipt?.party?.partyName ?? '—'}</td>
                        <td className="font-semibold">{l.receipt ? fmtMoney(l.receipt.receiptType === 'receipt' ? toNum(l.receipt.amount) : -toNum(l.receipt.amount)) : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {view.notes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">📝 {view.notes}</p>}

            <div className="flex justify-end gap-2 pt-1">
              {view.status !== 'completed' && (
                <button onClick={handleComplete} className="btn-primary">🔒 تأكيد الإغلاق</button>
              )}
              <button onClick={() => setView(null)} className="btn-secondary">إغلاق</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
