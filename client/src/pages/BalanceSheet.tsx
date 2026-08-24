import { useCallback, useEffect, useState } from 'react'
import AccountingTabs from '@/components/AccountingTabs'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { fmtDate, fmtMoney } from '@/lib/format'
import { printDocument } from '@/lib/print'
import type { BalanceSheetResponse, BalanceSheetSectionRow } from '@/types'

const today = () => new Date().toISOString().slice(0, 10)

function sectionRows(
  title: string,
  color: string,
  rows: BalanceSheetSectionRow[],
  total: number
) {
  return (
    <div className="card overflow-x-auto p-0">
      <div className={`border-b border-slate-100 px-4 py-3 font-bold ${color}`}>{title}</div>
      <table className="table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>البيان</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-4 text-center text-slate-400">لا توجد حسابات</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.code}>
                <td className="font-mono text-xs">{r.code}</td>
                <td>{r.name}</td>
                <td className="font-semibold">{fmtMoney(r.balance)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={2}>إجمالي {title}</td>
            <td>{fmtMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function BalanceSheet() {
  const [asOf, setAsOf] = useState(today)
  const [data, setData] = useState<BalanceSheetResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = { asOf }
      const key = `balance-sheet:${asOf}`
      const res = await cachedRead<BalanceSheetResponse>(key, () =>
        api.get('/journal/reports/balance-sheet', { params }).then((r) => r.data), 'journal'
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

  const totalLiabilitiesEquity = (data?.totalLiabilities ?? 0) + (data?.totalEquity ?? 0)

  const handlePrint = () => {
    if (!data) return
    const buildRows = (rows: BalanceSheetSectionRow[]) =>
      rows.map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${fmtMoney(r.balance)}</td></tr>`).join('')
    const body = `
    <div class="doc">
      <div class="head">
        <div>
          <h1>الميزانية العمومية</h1>
          <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
        </div>
        <div class="meta"><div><b>حتى تاريخ:</b> ${fmtDate(asOf)}</div></div>
      </div>
      <h3 style="margin:10px 0 4px;font-size:14px;color:#1e3a8a">الأصول</h3>
      <table><thead><tr><th>الكود</th><th>البيان</th><th>الرصيد</th></tr></thead><tbody>${buildRows(data.assets)}</tbody></table>
      <h3 style="margin:10px 0 4px;font-size:14px;color:#1e3a8a">الخصوم</h3>
      <table><thead><tr><th>الكود</th><th>البيان</th><th>الرصيد</th></tr></thead><tbody>${buildRows(data.liabilities)}</tbody></table>
      <h3 style="margin:10px 0 4px;font-size:14px;color:#1e3a8a">حقوق الملكية</h3>
      <table><thead><tr><th>الكود</th><th>البيان</th><th>الرصيد</th></tr></thead><tbody>${buildRows(data.equity)}</tbody></table>
      <table class="totals">
        <tr><td>إجمالي الأصول</td><td>${fmtMoney(data.totalAssets)}</td></tr>
        <tr><td>إجمالي الخصوم</td><td>${fmtMoney(data.totalLiabilities)}</td></tr>
        <tr><td>إجمالي حقوق الملكية</td><td>${fmtMoney(data.totalEquity)}</td></tr>
        <tr class="grand"><td>الخصوم + حقوق الملكية</td><td>${fmtMoney(totalLiabilitiesEquity)}</td></tr>
      </table>
      <div class="footer">ميزانية عمومية — P-Sale Ultra Cloud</div>
    </div>`
    printDocument('الميزانية العمومية', body)
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">الميزانية العمومية</h1>
          <p className="text-sm text-slate-500">الأصول والخصوم وحقوق الملكية في تاريخ محدد</p>
        </div>
        <button onClick={handlePrint} disabled={!data} className="btn-primary">
          🖨️ طباعة
        </button>
      </div>

      <AccountingTabs />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="label">حتى تاريخ</label>
          <input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        <button onClick={() => setAsOf(today())} className="btn-secondary">✕ تاريخ اليوم</button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل الميزانية العمومية...</p>
      ) : data ? (
        <div>
          <div className="grid gap-4 lg:grid-cols-3">
            {sectionRows('الأصول', 'text-sky-800', data.assets, data.totalAssets)}
            {sectionRows('الخصوم', 'text-amber-800', data.liabilities, data.totalLiabilities)}
            {sectionRows('حقوق الملكية', 'text-violet-800', data.equity, data.totalEquity)}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm text-slate-600">
              إجمالي الخصوم + حقوق الملكية (مقابل الأصول)
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xl font-extrabold text-slate-800">{fmtMoney(totalLiabilitiesEquity)}</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  data.balanced ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                }`}
              >
                {data.balanced ? '✓ الميزانية متوازنة' : '⚠️ الميزانية غير متوازنة'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
