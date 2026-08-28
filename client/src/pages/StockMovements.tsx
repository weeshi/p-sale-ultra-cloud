import { useCallback, useEffect, useMemo, useState } from 'react'
import DataList, { type DataListColumn } from '@/components/DataList'
import Pagination, { DEFAULT_PAGE_SIZE, usePaginate } from '@/components/Pagination'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { fmt, fmtDate, fmtMoney, toNum } from '@/lib/format'
import type { Item, StockMovement, StockMovementsResponse, Warehouse } from '@/types'

const MOVEMENT_LABEL: Record<string, string> = {
  purchase: 'شراء',
  sale: 'بيع',
  opening: 'رصيد افتتاحي',
  adjustment: 'تسوية',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  return: 'مرتجع',
  count_adjustment: 'تسوية جرد',
  damaged: 'تالف',
  return_damaged: 'مرتجع كتالف',
  damage_reversal: 'عكس تالف',
  inventory_adjustment_good: 'تعديل جرد (صالح)',
  inventory_adjustment_damaged: 'تعديل جرد (تالف)',
}

const MOVEMENT_STYLE: Record<string, string> = {
  purchase: 'bg-emerald-100 text-emerald-700',
  sale: 'bg-red-100 text-red-700',
  opening: 'bg-slate-200 text-slate-600',
  adjustment: 'bg-amber-100 text-amber-700',
  transfer_in: 'bg-blue-100 text-blue-700',
  transfer_out: 'bg-indigo-100 text-indigo-700',
  return: 'bg-orange-100 text-orange-700',
  count_adjustment: 'bg-purple-100 text-purple-700',
  damaged: 'bg-rose-100 text-rose-700',
  return_damaged: 'bg-rose-100 text-rose-700',
  damage_reversal: 'bg-teal-100 text-teal-700',
  inventory_adjustment_good: 'bg-purple-100 text-purple-700',
  inventory_adjustment_damaged: 'bg-rose-100 text-rose-700',
}

export default function StockMovements() {
  const { selectedBranchId } = useBranchFilter()
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [summary, setSummary] = useState<StockMovementsResponse['summary']>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [itemId, setItemId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [movementType, setMovementType] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)

  const loadBase = useCallback(async () => {
    try {
      const branchParam = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
      const [itemsRes, whs] = await Promise.all([
        cachedRead<{ items: Item[]; total: number }>('items:list', () =>
          api.get('/items?limit=99999').then((r) => r.data), 'inventory'
        ),
        cachedRead<Warehouse[]>(`warehouses:list:${selectedBranchId ?? 'all'}`, () =>
          api.get(`/warehouses${branchParam}`).then((r) => r.data), 'warehouses'
        ),
      ])
      setItems(itemsRes.data.items ?? [])
      setWarehouses(whs.data ?? [])
    } catch {
      // لا نوقف الصفحة — بيانات القاعدة اختيارية للفلاتر
    }
  }, [selectedBranchId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', new Date(from + 'T00:00:00').toISOString())
      if (to) params.set('to', new Date(to + 'T23:59:59').toISOString())
      if (itemId) params.set('itemId', itemId)
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (movementType) params.set('movementType', movementType)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const res = await cachedRead<StockMovementsResponse>(`stock-movements:${params.toString()}`, () =>
        api.get(`/reports/stock-movements?${params.toString()}`).then((r) => r.data), 'reports'
      )
      setMovements(res.data.movements ?? [])
      setSummary(res.data.summary ?? [])
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [from, to, itemId, warehouseId, movementType, selectedBranchId])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  useEffect(() => {
    load()
  }, [load])

  const { paginated, total } = usePaginate(movements, limit, page)

  const totals = useMemo(
    () =>
      summary.reduce(
        (acc, s) => ({ in: acc.in + s.in, out: acc.out + s.out, net: acc.net + s.net, damaged: acc.damaged + (s.damaged ?? 0) }),
        { in: 0, out: 0, net: 0, damaged: 0 }
      ),
    [summary]
  )

  const [reversing, setReversing] = useState(false)
  const reverseMovement = async (mv: StockMovement) => {
    const qty = Math.abs(toNum(mv.quantity))
    if (!mv.warehouseId) {
      setError('لا يمكن عكس التالف دون مخزن')
      return
    }
    if (!confirm(`عكس ${qty} وحدة من التالف إلى الصالح للصنف ${mv.item?.itemName ?? `#${mv.itemId}`}؟`)) return
    setReversing(true)
    setError('')
    try {
      const res = await offlineWrite<{ movement: StockMovement }>(
        `/items/${mv.itemId}/damaged-reverse`,
        'POST',
        { movementType: 'damage_reversal', itemId: mv.itemId, warehouseId: mv.warehouseId, quantity: qty },
        { entity: 'stockMovement', recordId: mv.itemId }
      )
      if (!res.queued) await load()
      else setError('لا يوجد اتصال — سيُعالج العكس عند المزامنة')
    } catch (err) {
      setError(extractError(err))
    } finally {
      setReversing(false)
    }
  }

  const movementColumns: DataListColumn<StockMovement>[] = [
    {
      key: 'date',
      label: 'التاريخ',
      render: (mv) => fmtDate(mv.movementDate),
    },
    {
      key: 'item',
      label: 'الصنف',
      render: (mv) => <span className="text-sm font-medium text-slate-800">{mv.item?.itemName ?? `#${mv.itemId}`}</span>,
      mobileLabel: 'الصنف',
    },
    {
      key: 'warehouse',
      label: 'المخزن',
      render: (mv) => mv.warehouse?.name ?? '—',
      mobileHidden: true,
    },
    {
      key: 'type',
      label: 'النوع',
      render: (mv) => (
        <span className={`rounded-full px-2 py-0.5 text-xs ${MOVEMENT_STYLE[mv.movementType] ?? ''}`}>
          {MOVEMENT_LABEL[mv.movementType] ?? mv.movementType}
        </span>
      ),
    },
    {
      key: 'quantity',
      label: 'الكمية',
      render: (mv) => (
        <span className={`font-semibold ${toNum(mv.quantity) > 0 ? 'text-green-700' : 'text-red-700'}`}>
          {toNum(mv.quantity) > 0 ? `+${fmt(mv.quantity)}` : fmt(mv.quantity)}
        </span>
      ),
    },
    {
      key: 'cost',
      label: 'التكلفة',
      render: (mv) => <span className="text-xs">{mv.totalCost != null ? fmtMoney(mv.totalCost) : '—'}</span>,
      mobileHidden: true,
    },
    {
      key: 'balance',
      label: 'الرصيد بعد',
      render: (mv) => <span className="text-xs">{mv.balanceAfter != null ? fmt(mv.balanceAfter) : '—'}</span>,
      mobileHidden: true,
    },
    {
      key: 'reference',
      label: 'المرجع',
      render: (mv) => (
        <span className="text-xs text-slate-500">
          {mv.referenceType ? `${mv.referenceType}${mv.referenceId ? ` #${mv.referenceId}` : ''}` : '—'}
        </span>
      ),
      mobileHidden: true,
    },
    {
      key: 'actions',
      label: 'إجراءات',
      render: (mv) => (
        (mv.movementType === 'damaged' || mv.movementType === 'return_damaged') ? (
          <button
            onClick={(e) => { e.stopPropagation(); reverseMovement(mv) }}
            disabled={reversing}
            className="whitespace-nowrap rounded px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50"
            title="عكس التالف إلى الصالح"
          >
            ↩ عكس
          </button>
        ) : null
      ),
      mobileHidden: true,
    },
  ]

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">حركات المخزون</h1>
        <p className="text-sm text-slate-500">سجل واردات وصادرات الأصناف عبر المخازن</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <div>
          <label className="label">من</label>
          <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label className="label">إلى</label>
          <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label className="label">الصنف</label>
          <select className="input" value={itemId} onChange={(e) => { setItemId(e.target.value); setPage(1) }}>
            <option value="">الكل</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">المخزن</label>
          <select className="input" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1) }}>
            <option value="">الكل</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">نوع الحركة</label>
          <select className="input" value={movementType} onChange={(e) => { setMovementType(e.target.value); setPage(1) }}>
            <option value="">الكل</option>
            {Object.entries(MOVEMENT_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={load}
            className="btn-secondary w-full"
          >
            🔄 تحديث
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {summary.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
            <p className="text-xs text-green-700">وارد (صالح)</p>
            <p className="text-lg font-bold text-green-800">{fmt(totals.in)}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-xs text-red-700">صادر (صالح)</p>
            <p className="text-lg font-bold text-red-800">{fmt(totals.out)}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
            <p className="text-xs text-rose-700">التالف</p>
            <p className={`text-lg font-bold ${totals.damaged > 0 ? 'text-rose-700' : 'text-rose-400'}`}>
              {fmt(totals.damaged)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <p className="text-xs text-slate-600">صافي (صالح)</p>
            <p className={`text-lg font-bold ${totals.net >= 0 ? 'text-slate-800' : 'text-red-700'}`}>
              {fmt(totals.net)}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل الحركات...</p>
      ) : (
        <DataList
          data={paginated}
          columns={movementColumns}
          emptyText="لا توجد حركات مطابقة"
          keyFn={(mv) => mv.id}
        />
      )}

      {!loading && (
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      )}
    </div>
  )
}
