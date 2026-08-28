import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { fmt, fmtMoney, toNum } from '@/lib/format'
import { searchMatch, buildSearchHaystack } from '@/lib/search'
import type { StockValuationResponse, Warehouse } from '@/types'

export default function StockValuation() {
  const { selectedBranchId } = useBranchFilter()
  const [data, setData] = useState<StockValuationResponse>({ items: [], totalValue: 0 })
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const res = await cachedRead<StockValuationResponse>(`stock-valuation:${params.toString()}`, () =>
        api.get(`/reports/stock-valuation?${params.toString()}`).then((r) => r.data), 'reports'
      )
      setData(res.data ?? { items: [], totalValue: 0 })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [warehouseId, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const branchParam = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
    cachedRead<Warehouse[]>(`warehouses:list:${selectedBranchId ?? 'all'}`, () =>
      api.get(`/warehouses${branchParam}`).then((r) => r.data), 'warehouses'
    )
      .then((res) => setWarehouses(res.data ?? []))
      .catch(() => {})
  }, [selectedBranchId])

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return data.items
    return data.items.filter((it) => {
      const haystack = buildSearchHaystack(it.itemCode, it.itemName)
      return searchMatch(haystack, q)
    })
  }, [data.items, search])

  const totalValue = useMemo(() => filtered.reduce((s, it) => s + toNum(it.totalValue), 0), [filtered])

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">تقييم المخزون</h1>
          <p className="text-sm text-slate-500">قيمة المخزون = الكمية × متوسط التكلفة</p>
        </div>
        <div className="flex gap-2">
          <input
            className="input w-56"
            placeholder="🔍 بحث بالكود أو الاسم"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">كل المخازن</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل التقييم...</p>
      ) : data.items.length === 0 ? (
        <div className="card text-center text-slate-400">لا يوجد مخزون</div>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الصنف</th>
                  <th>المخزن</th>
                  <th>الكمية</th>
                  <th>التالف</th>
                  <th>الصالح</th>
                  <th>متوسط التكلفة</th>
                  <th>القيمة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, idx) => (
                  <tr key={idx}>
                    <td className="font-mono text-xs">{it.itemCode}</td>
                    <td>{it.itemName}</td>
                    <td>{it.warehouseName}</td>
                    <td>{fmt(it.quantity)}</td>
                    <td className="text-red-600">{toNum(it.damagedStock) > 0 ? fmt(it.damagedStock) : '—'}</td>
                    <td className="text-slate-700">{fmt(it.validStock ?? it.quantity)}</td>
                    <td>{fmtMoney(it.costPrice)}</td>
                    <td className="font-semibold text-slate-800">{fmtMoney(it.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
            <span className="text-sm font-semibold text-brand-800">القيمة الإجمالية</span>
            <span className="text-xl font-extrabold text-brand-900">{fmtMoney(totalValue)}</span>
          </div>
        </>
      )}
    </div>
  )
}
