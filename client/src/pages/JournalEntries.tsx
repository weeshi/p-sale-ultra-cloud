import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmtDate, fmtMoney, toNum } from '@/lib/format'
import { JOURNAL_TYPE_LABEL } from '@/lib/accounting'
import type { Account, JournalEntriesResponse, JournalEntry, JournalLineInput } from '@/types'

const LIMIT = 20

const ENTRY_TYPE_OPTIONS = Object.entries(JOURNAL_TYPE_LABEL)

const blankLine = (): JournalLineInput => ({ accountId: '', description: '', debit: '', credit: '' })

export default function JournalEntries() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [total, setTotal] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offlineNote, setOfflineNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [page, setPage] = useState(1)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [entryType, setEntryType] = useState('adjusting')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<JournalLineInput[]>([])

  const accountOptions = useMemo(
    () =>
      accounts
        .flatMap((a) => [a, ...(a.children ?? [])])
        .sort((x, y) => x.accountCode.localeCompare(y.accountCode)),
    [accounts]
  )

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string | number> = { page, limit: LIMIT }
      if (from) params.from = from
      if (to) params.to = to
      if (type) params.type = type
      const key = `journal:list:${page}:${from}:${to}:${type}`
      const res = await cachedRead<JournalEntriesResponse>(key, () =>
        api.get('/journal', { params }).then((r) => r.data), 'journal'
      )
      setEntries(res.data.entries ?? [])
      setTotal(res.data.total ?? 0)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [page, from, to, type])

  const loadAccounts = useCallback(async () => {
    try {
      const res = await cachedRead<Account[]>('accounts:list', () =>
        api.get('/accounts').then((r) => r.data), 'accounts'
      )
      setAccounts(res.data ?? [])
    } catch {
      setAccounts([])
    }
  }, [])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const totals = useMemo(() => {
    const totalDebit = lines.reduce((s, l) => s + toNum(l.debit), 0)
    const totalCredit = lines.reduce((s, l) => s + toNum(l.credit), 0)
    return { totalDebit, totalCredit, diff: totalDebit - totalCredit }
  }, [lines])

  const balanced = Math.abs(totals.diff) < 0.001
  const canSave = lines.length >= 2 && balanced && lines.every((l) => l.accountId)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const openCreate = () => {
    setEntryDate(new Date().toISOString().slice(0, 10))
    setEntryType('adjusting')
    setDescription('')
    setLines([blankLine(), blankLine()])
    setError('')
    setOfflineNote('')
    setCreateOpen(true)
  }

  const updateLine = (idx: number, patch: Partial<JournalLineInput>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleCreate = async () => {
    setError('')
    setOfflineNote('')
    if (lines.length < 2) {
      setError('أدخل سطرين على الأقل في القيد')
      return
    }
    if (!balanced) {
      setError('القيد غير متوازن — مجموع المدين يجب أن يساوي مجموع الدائن')
      return
    }
    for (const l of lines) {
      if (!l.accountId) {
        setError('اختر حساباً لكل سطر')
        return
      }
      if (toNum(l.debit) <= 0 && toNum(l.credit) <= 0) {
        setError('أدخل مبلغاً مديناً أو دائناً لكل سطر')
        return
      }
    }
    setSaving(true)
    const payload = {
      entryDate: new Date(entryDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
      entryType,
      description: description.trim() || undefined,
      lines: lines.map((l) => ({
        accountId: Number(l.accountId),
        description: l.description.trim() || undefined,
        debit: toNum(l.debit) || undefined,
        credit: toNum(l.credit) || undefined,
      })),
    }
    try {
      const res = await offlineWrite<JournalEntry>('/journal', 'POST', payload, {
        entity: 'journalEntry',
      })
      if (res.queued) {
        setOfflineNote('لا يوجد اتصال — حُفظ القيد محلياً وستُزامن لاحقاً')
      }
      setCreateOpen(false)
      await loadEntries()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const openView = async (id: number) => {
    setViewLoading(true)
    setError('')
    try {
      const res = await api.get<JournalEntry>(`/journal/${id}`)
      setViewEntry(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setViewLoading(false)
    }
  }

  const reverseEntry = async (id: number) => {
    if (!confirm('عكس القيد؟ سيُنشأ قيد مقابل بعكس الأرصدة ولا يمكن التراجع عن هذه العملية.')) return
    setSaving(true)
    setError('')
    try {
      await api.post(`/journal/${id}/reverse`)
      await loadEntries()
      if (viewEntry?.id === id) await openView(id)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">دفتر اليومية</h1>
          <p className="text-sm text-slate-500">القيود المحاسبية المسجلة على النظام</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ قيد جديد</button>
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
            <option value="">كل الأنواع</option>
            {ENTRY_TYPE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        {(from || to || type) && (
          <button
            onClick={() => { setFrom(''); setTo(''); setType(''); setPage(1) }}
            className="btn-secondary"
          >
            ✕ مسح الفلاتر
          </button>
        )}
      </div>

      {offlineNote && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">📴 {offlineNote}</p>
      )}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل القيود...</p>
      ) : entries.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد قيود مطابقة</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>رقم القيد</th>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>الوصف</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs">#{e.entryNumber}</td>
                  <td>{fmtDate(e.entryDate)}</td>
                  <td>{JOURNAL_TYPE_LABEL[e.entryType] ?? e.entryType}</td>
                  <td className="max-w-xs truncate" title={e.description ?? ''}>{e.description || '—'}</td>
                  <td className="text-emerald-700">{fmtMoney(e.totalDebit)}</td>
                  <td className="text-red-700">{fmtMoney(e.totalCredit)}</td>
                  <td>
                    {e.isReversed && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        معكوس
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openView(e.id)}
                        className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                      >
                        عرض
                      </button>
                      {!e.isReversed && (
                        <button
                          onClick={() => reverseEntry(e.id)}
                          className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          عكس
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>إجمالي القيود: <b>{total}</b></span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary px-3 py-1 disabled:opacity-40"
              >
                السابق
              </button>
              <span>صفحة {page} من {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary px-3 py-1 disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={createOpen} title="قيد محاسبي جديد" onClose={() => setCreateOpen(false)} wide>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">تاريخ القيد *</label>
            <input type="date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div>
            <label className="label">نوع القيد</label>
            <select className="input" value={entryType} onChange={(e) => setEntryType(e.target.value)}>
              {ENTRY_TYPE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="label">الوصف</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف مختصر للقيد" />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0">القيود</label>
            <button onClick={() => setLines((prev) => [...prev, blankLine()])} className="btn-secondary px-3 py-1 text-xs">
              + إضافة سطر
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>الحساب *</th>
                  <th>الوصف</th>
                  <th className="w-32">مدين</th>
                  <th className="w-32">دائن</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        className="input px-2 py-1 text-xs"
                        value={l.accountId}
                        onChange={(e) => updateLine(i, { accountId: e.target.value })}
                      >
                        <option value="">— اختر حساباً —</option>
                        {accountOptions.map((a) => (
                          <option key={a.id} value={a.id}>[{a.accountCode}] {a.accountName}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input px-2 py-1 text-xs"
                        value={l.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input px-2 py-1 text-xs text-emerald-700"
                        value={l.debit}
                        onChange={(e) => updateLine(i, { debit: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input px-2 py-1 text-xs text-red-700"
                        value={l.credit}
                        onChange={(e) => updateLine(i, { credit: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => removeLine(i)}
                        disabled={lines.length <= 1}
                        className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
                        title="حذف السطر"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-lg bg-emerald-50 p-2">
            <p className="text-xs text-emerald-700">إجمالي المدين</p>
            <p className="text-lg font-bold text-emerald-800">{fmtMoney(totals.totalDebit)}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-2">
            <p className="text-xs text-red-700">إجمالي الدائن</p>
            <p className="text-lg font-bold text-red-800">{fmtMoney(totals.totalCredit)}</p>
          </div>
          <div className={`rounded-lg p-2 ${balanced ? 'bg-green-100' : 'bg-amber-100'}`}>
            <p className={`text-xs ${balanced ? 'text-green-700' : 'text-amber-700'}`}>الفرق</p>
            <p className={`text-lg font-bold ${balanced ? 'text-green-800' : 'text-amber-800'}`}>
              {balanced ? '✓ متوازن' : fmtMoney(totals.diff)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={handleCreate} disabled={saving || !canSave} className="btn-primary flex-1">
            {saving ? 'جارٍ الحفظ...' : '💾 حفظ القيد'}
          </button>
          <button onClick={() => setCreateOpen(false)} className="btn-secondary flex-1">إلغاء</button>
        </div>
        {!canSave && lines.length >= 2 && (
          <p className="mt-2 text-xs text-amber-600">
            يجب أن يكون مجموع المدين = مجموع الدائن وأن تُختار الحسابات لحفظ القيد.
          </p>
        )}
      </Modal>

      <Modal open={viewEntry !== null} title="تفاصيل القيد" onClose={() => setViewEntry(null)} wide>
        {viewLoading ? (
          <p className="py-6 text-center text-slate-400">جارٍ التحميل...</p>
        ) : viewEntry ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-800">قيد #{viewEntry.entryNumber}</p>
                <p className="text-xs text-slate-500">
                  {fmtDate(viewEntry.entryDate)} — {JOURNAL_TYPE_LABEL[viewEntry.entryType] ?? viewEntry.entryType}
                  {viewEntry.creator?.fullName ? ` — بواسطة ${viewEntry.creator.fullName}` : ''}
                </p>
              </div>
              {viewEntry.isReversed && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">معكوس</span>
              )}
            </div>
            {viewEntry.description && <p className="mb-3 text-sm text-slate-600">{viewEntry.description}</p>}
            <div className="max-h-64 overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الحساب</th>
                    <th>الوصف</th>
                    <th>مدين</th>
                    <th>دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewEntry.lines ?? []).map((line) => (
                    <tr key={line.id}>
                      <td className="text-xs">
                        <span className="font-mono">{line.account?.accountCode}</span>
                        {' '}
                        {line.account?.accountName ?? `#${line.accountId}`}
                      </td>
                      <td className="text-xs">{line.description || '—'}</td>
                      <td className="text-xs text-emerald-700">{fmtMoney(line.debit)}</td>
                      <td className="text-xs text-red-700">{fmtMoney(line.credit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={2}>الإجمالي</td>
                    <td className="text-emerald-700">{fmtMoney(viewEntry.totalDebit)}</td>
                    <td className="text-red-700">{fmtMoney(viewEntry.totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {!viewEntry.isReversed && (
              <div className="mt-4">
                <button
                  onClick={() => reverseEntry(viewEntry.id)}
                  disabled={saving}
                  className="btn-secondary w-full"
                >
                  {saving ? 'جارٍ العكس...' : '↩️ عكس القيد'}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
