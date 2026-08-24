import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { fmt, toNum } from '@/lib/format'
import type { LowStockItem, Warehouse } from '@/types'

export default function LowStock() {
  const navigate = useNavigate()
  const { selectedBranchId } = useBranchFilter()
  const [items, setItems] = useState<LowStockItem[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const branchParam = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
      const [lowRes, whs] = await Promise.all([
        cachedRead<LowStockItem[]>(`low-stock:${params.toString()}`, () =>
          api.get(`/reports/low-stock?${params.toString()}`).then((r) => r.data), 'reports'
        ),
        cachedRead<Warehouse[]>(`warehouses:list:${selectedBranchId ?? 'all'}`, () =>
          api.get(`/warehouses${branchParam}`).then((r) => r.data), 'warehouses'
        ),
      ])
      setItems(lowRes.data ?? [])
      setWarehouses(whs.data ?? [])
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [warehouseId, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const shortageTotal = items.reduce((s, it) => s + Math.max(0, toNum(it.minStock) - toNum(it.quantity)), 0)

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">مخزون منخفض</h1>
          <p className="text-sm text-slate-500">أصناف بلغت أو انخفضت عن الحد الأدنى — تحتاج إعادة طلب</p>
        </div>
        <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">كل المخازن</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ التحميل...</p>
      ) : items.length === 0 ? (
        <div className="card text-center text-slate-400">🎉 لا توجد أصناف تحت الحد الأدنى</div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="text-sm text-amber-800">
              ⚠️ <b>{items.length}</b> صنف تحت الحد الأدنى — العجز التقديري: <b>{fmt(shortageTotal)}</b> قطعة
            </span>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الصنف</th>
                  <th>المخزن</th>
                  <th>الكمية الحالية</th>
                  <th>الحد الأدنى</th>
                  <th>العجز</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const shortage = Math.max(0, toNum(it.minStock) - toNum(it.quantity))
                  return (
                    <tr key={idx}>
                      <td className="font-mono text-xs">{it.itemCode}</td>
                      <td>{it.itemName}</td>
                      <td>{it.warehouse}</td>
                      <td className="font-semibold text-red-700">{fmt(it.quantity)}</td>
                      <td>{fmt(it.minStock)}</td>
                      <td className="text-amber-700">{shortage > 0 ? fmt(shortage) : '—'}</td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => navigate('/purchases')}
                            className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                          >
                            🛒 طلب شراء
                          </button>
                          <button
                            onClick={() => navigate('/inventory/transfers')}
                            className="rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                          >
                            🔁 تحويل
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
