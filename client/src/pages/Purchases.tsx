import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DataList, { type DataListColumn } from '@/components/DataList'
import Modal from '@/components/Modal'
import Pagination, { DEFAULT_PAGE_SIZE, usePaginate } from '@/components/Pagination'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { onRealtimeEvent, REALTIME_TRANSFER_EVENTS } from '@/lib/realtime'
import { fmt, fmtDate, fmtMoney, fmtUsd, toNum } from '@/lib/format'
import { searchMatch, buildSearchHaystack } from '@/lib/search'
import type {
  Party,
  PurchaseInvoice,
  PurchaseOrder,
  PurchaseTrack,
  StockTransfer,
  UnifiedPurchase,
  UnifiedPurchasesResponse,
  Warehouse,
} from '@/types'

type TabKey = 'all' | PurchaseTrack

const TAB_LABEL: Record<TabKey, string> = {
  all: 'الكل',
  import: 'استيراد (خارجي)',
  local: 'محلي (سوق)',
  internal: 'طلبات داخلية',
}

const STATUS_MAP: Record<string, { label: string; style: string }> = {
  draft: { label: 'مسودة', style: 'bg-slate-200 text-slate-600' },
  sent: { label: 'مُرسل', style: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'مؤكد', style: 'bg-blue-100 text-blue-700' },
  partially_received: { label: 'استلام جزئي', style: 'bg-indigo-100 text-indigo-700' },
  received: { label: 'مستلم', style: 'bg-green-100 text-green-700' },
  in_transit: { label: 'قيد الشحن', style: 'bg-indigo-100 text-indigo-700' },
  pending: { label: 'قيد الاعتماد', style: 'bg-amber-100 text-amber-700' },
  approved: { label: 'معتمد', style: 'bg-blue-100 text-blue-700' },
  paid: { label: 'مدفوعة', style: 'bg-green-100 text-green-700' },
  partial: { label: 'جزئي الدفع', style: 'bg-amber-100 text-amber-700' },
  unpaid: { label: 'غير مدفوعة', style: 'bg-red-100 text-red-700' },
  rejected: { label: 'مرفوض', style: 'bg-red-100 text-red-700' },
  cancelled: { label: 'ملغي', style: 'bg-slate-200 text-slate-600' },
}

const statusInfo = (status: string): { label: string; style: string } =>
  STATUS_MAP[status] ?? { label: status, style: 'bg-slate-200 text-slate-600' }

export default function Purchases() {
  const navigate = useNavigate()
  const { selectedBranchId } = useBranchFilter()

  const [records, setRecords] = useState<UnifiedPurchase[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [tab, setTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')
  const [partyId, setPartyId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)

  const [viewRecord, setViewRecord] = useState<UnifiedPurchase | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const branchQs = selectedBranchId != null ? `&branchId=${selectedBranchId}` : ''
      const branchQsFirst = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
      const [purRes, partiesRes, whs] = await Promise.all([
        cachedRead<UnifiedPurchasesResponse>(`purchases:unified:${selectedBranchId ?? 'all'}`, () =>
          api.get(`/purchases?limit=99999${branchQs}`).then((r) => r.data), 'purchases'
        ),
        cachedRead<{ parties: Party[]; total: number }>('parties:list', () =>
          api.get('/parties?limit=99999').then((r) => r.data), 'parties'
        ),
        cachedRead<Warehouse[]>(`warehouses:list:${selectedBranchId ?? 'all'}`, () =>
          api.get(`/warehouses${branchQsFirst}`).then((r) => r.data), 'warehouses'
        ),
      ])

      setRecords(purRes.data.purchases ?? [])
      setParties((partiesRes.data.parties ?? []).filter((p) => p.partyType === 'vendor'))
      setWarehouses(whs.data ?? [])
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [selectedBranchId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // إعادة تعيين فلتر المخزن عند تغيير الفرع (مخازن الفرع الجديد فقط)
  useEffect(() => {
    setWarehouseId('')
  }, [selectedBranchId])

  useEffect(() => {
    const offs = REALTIME_TRANSFER_EVENTS.map((event) => onRealtimeEvent(event, () => loadAll()))
    return () => offs.forEach((off) => off())
  }, [loadAll])

  const counts = useMemo(
    () => ({
      all: records.length,
      import: records.filter((r) => r.type === 'import').length,
      local: records.filter((r) => r.type === 'local').length,
      internal: records.filter((r) => r.type === 'internal').length,
    }),
    [records]
  )

  const filtered = useMemo(() => {
    const q = search.trim()
    return records.filter((r) => {
      if (tab !== 'all' && r.type !== tab) return false
      if (status && r.status !== status) return false
      if (partyId && r.type !== 'internal' && String((r.raw as PurchaseInvoice).partyId) !== partyId) return false
      if (warehouseId) {
        const raw = r.raw as any
        const whId = String(raw.warehouseId ?? raw.targetWarehouseId ?? '')
        const fromId = String(raw.fromWarehouseId ?? '')
        const toId = String(raw.toWarehouseId ?? '')
        if (whId !== warehouseId && fromId !== warehouseId && toId !== warehouseId) return false
      }
      if (dateFrom && new Date(r.date) < new Date(dateFrom + 'T00:00:00')) return false
      if (dateTo && new Date(r.date) > new Date(dateTo + 'T23:59:59')) return false
      if (q) {
        const haystack = buildSearchHaystack(r.number, r.partyName, r.direction, r.warehouseName, r.notes)
        if (!searchMatch(haystack, q)) return false
      }
      return true
    })
  }, [records, tab, search, partyId, warehouseId, status, dateFrom, dateTo])

  const { paginated, total } = usePaginate(filtered, limit, page)

  const typeLabel = (t: PurchaseTrack) => TAB_LABEL[t]

  const purchaseColumns: DataListColumn<UnifiedPurchase>[] = [
    {
      key: 'type',
      label: 'النوع',
      render: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          r.type === 'import' ? 'bg-purple-100 text-purple-700'
            : r.type === 'local' ? 'bg-emerald-100 text-emerald-700'
            : 'bg-cyan-100 text-cyan-700'
        }`}>{typeLabel(r.type)}</span>
      ),
    },
    {
      key: 'number',
      label: 'الرقم',
      render: (r) => <span className="font-mono text-xs">{r.number}</span>,
    },
    {
      key: 'date',
      label: 'التاريخ',
      render: (r) => fmtDate(r.date),
    },
    {
      key: 'party',
      label: 'الطرف',
      render: (r) => (
        <div>
          <div className="text-sm font-medium text-slate-800">
            {r.type === 'internal' ? r.direction : r.partyName}
          </div>
          {r.type === 'internal' && r.partyName && (
            <div className="text-xs text-slate-500">{r.partyName}</div>
          )}
        </div>
      ),
      mobileLabel: 'الطرف',
    },
    {
      key: 'warehouse',
      label: 'المخزن',
      render: (r) => <span className="text-xs text-slate-600">{r.warehouseName}</span>,
      mobileHidden: true,
    },
    {
      key: 'total',
      label: 'الإجمالي',
      render: (r) => (
        <span className="font-semibold">
          {r.currency === 'USD' ? fmtUsd(r.total) : fmtMoney(r.total)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'الحالة',
      render: (r) => {
        const st = statusInfo(r.status)
        return <span className={`rounded-full px-2 py-0.5 text-xs ${st.style}`}>{st.label}</span>
      },
    },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); setViewRecord(r) }}
          className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
        >
          عرض
        </button>
      ),
      mobileHidden: true,
    },
  ]

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">المشتريات</h1>
          <p className="text-sm text-slate-500">سجل موحد لكل عمليات التوريد — استيراد، محلي، طلبات داخلية</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/purchases/local')} className="btn-primary">
            🧾 فاتورة محلية
          </button>
          <button onClick={() => navigate('/purchases/import')} className="btn-secondary">
            📦 أمر استيراد
          </button>
          <button onClick={() => navigate('/inventory/transfers?tab=create')} className="btn-secondary">
            🔁 طلب داخلي
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* ===== التبويبات ===== */}
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(TAB_LABEL) as TabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => { setTab(k); setPage(1) }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === k
                ? 'bg-brand-600 text-white shadow'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {TAB_LABEL[k]}
            <span className={`ml-1 text-xs ${tab === k ? 'text-brand-100' : 'text-slate-400'}`}>
              {counts[k]}
            </span>
          </button>
        ))}
      </div>

      {/* ===== الفلاتر ===== */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <input
          className="input"
          placeholder="🔍 رقم / مورد / مخزن"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select className="input" value={partyId} onChange={(e) => { setPartyId(e.target.value); setPage(1) }}>
          <option value="">كل الموردين</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>{p.partyName}</option>
          ))}
        </select>
        <select className="input" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1) }}>
          <option value="">كل المخازن</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">كل الحالات</option>
          <option value="paid">مدفوعة</option>
          <option value="partial">جزئي الدفع</option>
          <option value="unpaid">غير مدفوعة</option>
          <option value="received">مستلم</option>
          <option value="pending">قيد الاعتماد</option>
          <option value="approved">معتمد</option>
          <option value="draft">مسودة</option>
          <option value="cancelled">ملغي</option>
        </select>
        <input
          type="date"
          className="input"
          title="من تاريخ"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
        />
        <input
          type="date"
          className="input"
          title="إلى تاريخ"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
        />
      </div>

      {/* ===== الجدول / Cards ===== */}
      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل المشتريات...</p>
      ) : (
        <DataList
          data={paginated}
          columns={purchaseColumns}
          onRowClick={(r) => setViewRecord(r)}
          emptyText="لا توجد سجلات مطابقة للفلترة"
          keyFn={(r) => r.key}
        />
      )}

      {!loading && (
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      )}

      {/* ===== تفاصيل السجل ===== */}
      <Modal
        open={viewRecord !== null}
        title={viewRecord ? `${typeLabel(viewRecord.type)} — ${viewRecord.number}` : ''}
        onClose={() => setViewRecord(null)}
        wide
      >
        {viewRecord && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                {fmtDate(viewRecord.date)} —{' '}
                {viewRecord.type === 'internal'
                  ? viewRecord.direction
                  : `المورد: ${viewRecord.partyName}`}
                {viewRecord.warehouseName ? ` — المخزن: ${viewRecord.warehouseName}` : ''}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  statusInfo(viewRecord.status).style
                }`}
              >
                {statusInfo(viewRecord.status).label}
              </span>
            </div>

            {viewRecord.type === 'internal' && (
              <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                {(viewRecord.raw as StockTransfer).items?.map((i) => (
                  <div key={i.id} className="flex justify-between text-slate-600">
                    <span>{i.item?.itemName ?? `صنف #${i.itemId}`}</span>
                    <span>
                      {fmt(i.quantity)} × {fmtMoney(i.unitCost)} = {fmtMoney(toNum(i.quantity) * toNum(i.unitCost))}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {viewRecord.type === 'import' && (
              <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                {(viewRecord.raw as PurchaseOrder).items?.map((i) => (
                  <div key={i.id} className="flex justify-between text-slate-600">
                    <span>{i.item?.itemName ?? `صنف #${i.itemId}`}</span>
                    <span>
                      {fmt(i.quantity)} × {fmtUsd(i.unitPriceUsd)} = {fmtUsd(i.totalUsd)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800">
                  <span>الإجمالي</span>
                  <span>{fmtUsd(viewRecord.total)}</span>
                </div>
                {toNum((viewRecord.raw as any).exchangeRate) > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>سعر الصرف</span>
                    <span>{fmt((viewRecord.raw as any).exchangeRate, 4)}</span>
                  </div>
                )}
              </div>
            )}

            {viewRecord.type === 'local' && (
              <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                {(viewRecord.raw as PurchaseInvoice).items?.map((i) => (
                  <div key={i.id} className="flex justify-between text-slate-600">
                    <span>{i.item?.itemName ?? `صنف #${i.itemId}`}</span>
                    <span>
                      {fmt(i.quantity)} × {fmtMoney(i.unitPrice)} = {fmtMoney(i.total)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800">
                  <span>الإجمالي</span>
                  <span>{fmtMoney(viewRecord.total)}</span>
                </div>
              </div>
            )}

            {viewRecord.notes && (
              <p className="mb-2 text-xs text-slate-500">ملاحظات: {viewRecord.notes}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {viewRecord.type === 'import' && (
                <button
                  onClick={() => navigate(`/purchases/import/${viewRecord.raw.id}/receive`)}
                  className="btn-primary flex-1"
                >
                  📥 استلام
                </button>
              )}
              <button onClick={() => setViewRecord(null)} className="btn-secondary flex-1">
                إغلاق
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
