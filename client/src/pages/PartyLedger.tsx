import { useCallback, useEffect, useMemo, useState } from 'react'
import AccountingTabs from '@/components/AccountingTabs'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { fmtDate, fmtMoney, toNum } from '@/lib/format'
import { printDocument } from '@/lib/print'
import type { Party, PartyLedgerResponse } from '@/types'

const yearStart = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)

const PARTY_TYPE_LABEL: Record<string, string> = {
  customer: 'عميل',
  vendor: 'مورد',
}

export default function PartyLedger() {
  const [parties, setParties] = useState<Party[]>([])
  const [partyId, setPartyId] = useState(0)
  const [from, setFrom] = useState(yearStart)
  const [to, setTo] = useState(today)
  const [data, setData] = useState<PartyLedgerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .get('/parties?limit=99999')
      .then((r) => {
        if (!cancelled) setParties(r.data.parties ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(extractError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    if (!partyId) {
      setLoading(false)
      setData(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      const key = `party-ledger:${partyId}:${from}:${to}`
      const res = await cachedRead<PartyLedgerResponse>(key, () =>
        api.get(`/accounts/party/${partyId}/ledger`, { params }).then((r) => r.data), 'parties'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [partyId, from, to])

  useEffect(() => {
    load()
  }, [load])

  const totalDebit = useMemo(() => data?.lines.reduce((s, l) => s + toNum(l.debit), 0) ?? 0, [data])
  const totalCredit = useMemo(() => data?.lines.reduce((s, l) => s + toNum(l.credit), 0) ?? 0, [data])

  const handlePrint = () => {
    if (!data) return
    const rows = data.lines
      .map(
        (l) =>
          `<tr><td>${l.entryNumber}</td><td>${fmtDate(l.entryDate)}</td><td>${l.description}</td><td>${fmtMoney(l.debit)}</td><td>${fmtMoney(l.credit)}</td><td>${fmtMoney(l.balance)}</td></tr>`
      )
      .join('')
    const body = `
    <div class="doc">
      <div class="head">
        <div>
          <h1>كشف حساب طرف</h1>
          <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
        </div>
        <div class="meta">
          <div><b>الطرف:</b> ${data.party?.partyName ?? ''} (${PARTY_TYPE_LABEL[data.party?.partyType ?? ''] ?? ''})</div>
          <div><b>الفترة:</b> ${fmtDate(from)} — ${fmtDate(to)}</div>
        </div>
      </div>
      <table><thead><tr><th>الرقم</th><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="totals">
        <tr><td>الرصيد الافتتاحي</td><td>${fmtMoney(data.openingBalance)}</td></tr>
        <tr><td>إجمالي المدين</td><td>${fmtMoney(totalDebit)}</td></tr>
        <tr><td>إجمالي الدائن</td><td>${fmtMoney(totalCredit)}</td></tr>
        <tr class="grand"><td>الرصيد الختامي</td><td>${fmtMoney(data.closingBalance)}</td></tr>
      </table>
      <div class="footer">كشف حساب — P-Sale Ultra Cloud</div>
    </div>`
    printDocument(`كشف حساب ${data.party?.partyName ?? ''}`, body)
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">كشف حساب طرف</h1>
          <p className="text-sm text-slate-500">حركات وأرصدة عميل أو مورد خلال فترة</p>
        </div>
        <button onClick={handlePrint} disabled={!data} className="btn-primary">
          🖨️ طباعة
        </button>
      </div>

      <AccountingTabs />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="w-72">
          <label className="label">الطرف (عميل/مورد)</label>
          <select
            className="input"
            value={partyId || ''}
            onChange={(e) => setPartyId(Number(e.target.value))}
          >
            <option value="">— اختر طرفاً —</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.partyName} ({PARTY_TYPE_LABEL[p.partyType] ?? ''})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">من تاريخ</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">إلى تاريخ</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={() => { setFrom(yearStart()); setTo(today()) }} className="btn-secondary">
          ✕ إعادة للفترة الحالية
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل كشف الحساب...</p>
      ) : !partyId ? (
        <p className="py-16 text-center text-slate-400">اختر طرفاً لعرض كشف حسابه</p>
      ) : data ? (
        <div>
          {data.party && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div>
                <span className="text-lg font-bold text-slate-800">{data.party.partyName}</span>
                <span className="mr-2 font-mono text-sm text-slate-500">{data.party.partyCode}</span>
                <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {PARTY_TYPE_LABEL[data.party.partyType] ?? data.party.partyType}
                </span>
              </div>
              <div className="text-sm text-slate-500">
                الافتتاحي: <b className="text-slate-700">{fmtMoney(data.openingBalance)}</b> — الختامي:{' '}
                <b className="text-slate-700">{fmtMoney(data.closingBalance)}</b>
              </div>
            </div>
          )}

          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">لا توجد حركات في هذه الفترة</td>
                  </tr>
                ) : (
                  data.lines.map((l, i) => (
                    <tr key={`${l.entryNumber}-${i}`} className="hover:bg-slate-50">
                      <td className="font-mono text-xs">{l.entryNumber}</td>
                      <td>{fmtDate(l.entryDate)}</td>
                      <td>{l.description}</td>
                      <td className="text-emerald-700">{toNum(l.debit) ? fmtMoney(l.debit) : '—'}</td>
                      <td className="text-red-700">{toNum(l.credit) ? fmtMoney(l.credit) : '—'}</td>
                      <td className="font-semibold">{fmtMoney(l.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.lines.length > 0 && (
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={3}>الإجمالي</td>
                    <td className="text-emerald-700">{fmtMoney(totalDebit)}</td>
                    <td className="text-red-700">{fmtMoney(totalCredit)}</td>
                    <td>{fmtMoney(data.closingBalance)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
