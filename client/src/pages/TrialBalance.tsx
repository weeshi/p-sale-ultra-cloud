import { useCallback, useEffect, useMemo, useState } from 'react'
import AccountingTabs from '@/components/AccountingTabs'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { fmtDate, fmtMoney } from '@/lib/format'
import { printDocument } from '@/lib/print'
import { ACCOUNT_TYPE_LABEL } from '@/lib/accounting'
import type { TrialBalanceResponse } from '@/types'

export default function TrialBalance() {
  const [asOf, setAsOf] = useState('')
  const [data, setData] = useState<TrialBalanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = {}
      if (asOf) params.asOf = asOf
      const key = `trial-balance:${asOf || 'now'}`
      const res = await cachedRead<TrialBalanceResponse>(key, () =>
        api.get('/journal/reports/trial-balance', { params }).then((r) => r.data), 'journal'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [asOf])

  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(
    () => (data?.accounts ?? []).filter((a) => a.debit > 0 || a.credit > 0),
    [data]
  )

  const handlePrint = () => {
    if (!data) return
    const trs = rows
      .map(
        (a) => `<tr>
          <td>${a.accountCode}</td>
          <td>${a.accountName}</td>
          <td>${ACCOUNT_TYPE_LABEL[a.accountType] ?? a.accountType}</td>
          <td>${fmtMoney(a.debit)}</td>
          <td>${fmtMoney(a.credit)}</td>
        </tr>`
      )
      .join('')
    const body = `
    <div class="doc">
      <div class="head">
        <div>
          <h1>ميزان المراجعة</h1>
          <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
        </div>
        <div class="meta"><div><b>حتى تاريخ:</b> ${asOf ? fmtDate(asOf) : 'اليوم'}</div></div>
      </div>
      <table>
        <thead><tr><th>الكود</th><th>الحساب</th><th>النوع</th><th>مدين</th><th>دائن</th></tr></thead>
        <tbody>${trs}</tbody>
        <tfoot><tr><td colspan="3"><b>الإجمالي</b></td><td><b>${fmtMoney(data.totalDebit)}</b></td><td><b>${fmtMoney(data.totalCredit)}</b></td></tr></tfoot>
      </table>
      <div class="footer">${data.balanced ? 'الميزان متوازن ✓' : '⚠️ الميزان غير متوازن'} — P-Sale Ultra Cloud</div>
    </div>`
    printDocument('ميزان المراجعة', body)
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">ميزان المراجعة</h1>
          <p className="text-sm text-slate-500">أرصدة الحسابات حتى تاريخ محدد</p>
        </div>
        <button onClick={handlePrint} disabled={!data || rows.length === 0} className="btn-primary">
          🖨️ طباعة
        </button>
      </div>

      <AccountingTabs />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="label">حتى تاريخ</label>
          <input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        {asOf && (
          <button onClick={() => setAsOf('')} className="btn-secondary">✕ مسح</button>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل الميزان...</p>
      ) : data && rows.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد أرصدة حتى هذا التاريخ</div>
      ) : data ? (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الكود</th>
                <th>الحساب</th>
                <th>النوع</th>
                <th>مدين</th>
                <th>دائن</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.accountCode}>
                  <td className="font-mono text-xs">{a.accountCode}</td>
                  <td>{a.accountName}</td>
                  <td className="text-xs">{ACCOUNT_TYPE_LABEL[a.accountType] ?? a.accountType}</td>
                  <td className="text-emerald-700">{fmtMoney(a.debit)}</td>
                  <td className="text-red-700">{fmtMoney(a.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={3}>الإجمالي</td>
                <td className="text-emerald-700">{fmtMoney(data.totalDebit)}</td>
                <td className="text-red-700">{fmtMoney(data.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="flex items-center justify-end border-t border-slate-100 px-4 py-3">
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                data.balanced ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {data.balanced ? '✓ الميزان متوازن' : '⚠️ الميزان غير متوازن'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
