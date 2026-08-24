import { useCallback, useEffect, useState } from 'react'
import AccountingTabs from '@/components/AccountingTabs'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { fmtDate, fmtMoney } from '@/lib/format'
import { printDocument } from '@/lib/print'
import type { IncomeStatementResponse } from '@/types'

const yearStart = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)

export default function IncomeStatement() {
  const [from, setFrom] = useState(yearStart)
  const [to, setTo] = useState(today)
  const [data, setData] = useState<IncomeStatementResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = { from, to }
      const key = `income-statement:${from}:${to}`
      const res = await cachedRead<IncomeStatementResponse>(key, () =>
        api.get('/journal/reports/income-statement', { params }).then((r) => r.data), 'journal'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const netPositive = (data?.netIncome ?? 0) >= 0

  const handlePrint = () => {
    if (!data) return
    const revRows = data.revenues
      .map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${fmtMoney(r.amount)}</td></tr>`)
      .join('')
    const expRows = data.expenses
      .map((e) => `<tr><td>${e.code}</td><td>${e.name}</td><td>${fmtMoney(e.amount)}</td></tr>`)
      .join('')
    const body = `
    <div class="doc">
      <div class="head">
        <div>
          <h1>قائمة الدخل</h1>
          <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
        </div>
        <div class="meta"><div><b>الفترة:</b> ${fmtDate(from)} — ${fmtDate(to)}</div></div>
      </div>
      <h3 style="margin:10px 0 4px;font-size:14px;color:#1e3a8a">الإيرادات</h3>
      <table><thead><tr><th>الكود</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${revRows}</tbody></table>
      <h3 style="margin:10px 0 4px;font-size:14px;color:#1e3a8a">المصروفات</h3>
      <table><thead><tr><th>الكود</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${expRows}</tbody></table>
      <table class="totals">
        <tr><td>إجمالي الإيرادات</td><td>${fmtMoney(data.totalRevenue)}</td></tr>
        <tr><td>إجمالي المصروفات</td><td>${fmtMoney(data.totalExpense)}</td></tr>
        <tr class="grand"><td>صافي الربح</td><td>${fmtMoney(data.netIncome)}</td></tr>
      </table>
      <div class="footer">قائمة دخل — P-Sale Ultra Cloud</div>
    </div>`
    printDocument('قائمة الدخل', body)
  }

  const resetPeriod = () => {
    setFrom(yearStart())
    setTo(today())
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">قائمة الدخل</h1>
          <p className="text-sm text-slate-500">الإيرادات والمصروفات وصافي الربح خلال فترة</p>
        </div>
        <button onClick={handlePrint} disabled={!data} className="btn-primary">
          🖨️ طباعة
        </button>
      </div>

      <AccountingTabs />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="label">من تاريخ</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">إلى تاريخ</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={resetPeriod} className="btn-secondary">✕ إعادة للفترة الحالية</button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل قائمة الدخل...</p>
      ) : data ? (
        <div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card overflow-x-auto p-0">
              <div className="border-b border-slate-100 px-4 py-3 font-bold text-emerald-800">
                📈 الإيرادات
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>الكود</th>
                    <th>البيان</th>
                    <th>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenues.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-center text-slate-400">لا توجد إيرادات</td></tr>
                  ) : (
                    data.revenues.map((r) => (
                      <tr key={r.code}>
                        <td className="font-mono text-xs">{r.code}</td>
                        <td>{r.name}</td>
                        <td className="text-emerald-700">{fmtMoney(r.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={2}>إجمالي الإيرادات</td>
                    <td className="text-emerald-700">{fmtMoney(data.totalRevenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="card overflow-x-auto p-0">
              <div className="border-b border-slate-100 px-4 py-3 font-bold text-red-800">
                📉 المصروفات
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>الكود</th>
                    <th>البيان</th>
                    <th>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expenses.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-center text-slate-400">لا توجد مصروفات</td></tr>
                  ) : (
                    data.expenses.map((e) => (
                      <tr key={e.code}>
                        <td className="font-mono text-xs">{e.code}</td>
                        <td>{e.name}</td>
                        <td className="text-red-700">{fmtMoney(e.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={2}>إجمالي المصروفات</td>
                    <td className="text-red-700">{fmtMoney(data.totalExpense)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm text-slate-600">صافي الربح (الإيرادات − المصروفات)</span>
            <span className={`text-xl font-extrabold ${netPositive ? 'text-emerald-700' : 'text-red-700'}`}>
              {fmtMoney(data.netIncome)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
