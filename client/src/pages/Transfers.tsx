import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { onRealtimeEvent, REALTIME_TRANSFER_EVENTS } from '@/lib/realtime'
import { fmtDate, fmtMoney, toNum } from '@/lib/format'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { useAuth } from '@/contexts/AuthContext'
import type { Item, StockTransfer, Warehouse, Branch } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  requested: 'بانتظار المراجعة',
  pending: 'معلق',
  approved: 'معتمد',
  in_transit: 'قيد الشحن',
  received: 'مستلم',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
}
const STATUS_STYLE: Record<string, string> = {
  requested: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-indigo-100 text-indigo-700',
  received: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
}

type Tab = 'incoming' | 'outgoing' | 'create'

interface TrLine {
  item: Item
  quantity: number
}

interface ReviewItem {
  transferItemId: number
  itemId: number
  itemName: string
  requestedQty: number
  availableQty: number
  approvedQty: number
}

export default function Transfers() {
  const { user } = useAuth()
  const { selectedBranchId: _selectedBranchId } = useBranchFilter()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'incoming'

  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offlineNote, setOfflineNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [incomingTransfers, setIncomingTransfers] = useState<StockTransfer[]>([])
  const [outgoingTransfers, setOutgoingTransfers] = useState<StockTransfer[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [branches, setBranches] = useState<Branch[]>([])

  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null)

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTransfer, setReviewTransfer] = useState<StockTransfer | null>(null)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [reviewNotes, setReviewNotes] = useState('')

  const [fromBranchId, setFromBranchId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [cart, setCart] = useState<TrLine[]>([])
  const [search, setSearch] = useState('')
  const [createNotes, setCreateNotes] = useState('')

  const isSuperAdmin = user?.isSuperAdmin

  const loadIncoming = useCallback(async () => {
    try {
      const res = await api.get('/transfers/incoming')
      setIncomingTransfers(res.data.transfers ?? [])
    } catch (err) {
      setError(extractError(err))
    }
  }, [])

  const loadOutgoing = useCallback(async () => {
    try {
      const res = await api.get('/transfers/outgoing')
      setOutgoingTransfers(res.data.transfers ?? [])
    } catch (err) {
      setError(extractError(err))
    }
  }, [])

  const loadBaseData = useCallback(async () => {
    try {
      const [itemsRes, whsRes, brRes] = await Promise.all([
        cachedRead<{ items: Item[]; total: number }>('items:list', () =>
          api.get('/items?limit=99999').then((r) => r.data), 'inventory'
        ),
        cachedRead<Warehouse[]>('warehouses:list', () =>
          api.get('/warehouses').then((r) => r.data), 'warehouses'
        ),
        api.get('/warehouses/branches'),
      ])
      setItems(itemsRes.data.items ?? [])
      setWarehouses(whsRes.data ?? [])
      setBranches(brRes.data ?? [])
    } catch (err) {
      setError(extractError(err))
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    await Promise.all([loadIncoming(), loadOutgoing(), loadBaseData()])
    setLoading(false)
  }, [loadIncoming, loadOutgoing, loadBaseData])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    const offs = REALTIME_TRANSFER_EVENTS.map((event) =>
      onRealtimeEvent(event, () => {
        if (activeTab === 'incoming') loadIncoming()
        else if (activeTab === 'outgoing') loadOutgoing()
      })
    )
    return () => offs.forEach((off) => off())
  }, [activeTab, loadIncoming, loadOutgoing])

  const myWarehouse = useMemo(() => {
    if (isSuperAdmin) return warehouses[0]
    return warehouses.find((w) => w.branchId === (user as any)?.branchId)
  }, [warehouses, user, isSuperAdmin])

  const sourceBranches = useMemo(() => {
    const myBranchId = (user as any)?.branchId
    return branches.filter((b) => b.id !== myBranchId)
  }, [branches, user])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (!q) return true
      const haystack = [it.itemCode, it.itemName, it.barcode]
        .filter(Boolean).map((s) => String(s).toLowerCase()).join(' ')
      return haystack.includes(q)
    })
  }, [items, search])

  const incomingBadge = incomingTransfers.filter((t) => t.status === 'requested').length

  const addToCart = (item: Item) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id)
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l))
      return [...prev, { item, quantity: 1 }]
    })
  }

  const updateLine = (idx: number, patch: Partial<TrLine>) => {
    setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const removeLine = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleCreateRequest = async () => {
    if (!fromBranchId) { setError('اختر الفرع المصدر'); return }
    if (!toWarehouseId) { setError('لا يوجد مخزن مرتبط بفرعك'); return }
    if (cart.length === 0) { setError('أضف أصنافاً للطلب'); return }
    for (const l of cart) {
      if (!l.quantity || l.quantity <= 0) { setError(`الكمية غير صحيحة لـ ${l.item.itemName}`); return }
    }

    const fromWarehouse = warehouses.find((w) => w.branchId === Number(fromBranchId))
    if (!fromWarehouse) { setError('لا يوجد مخزن مرتبط بالفرع المصدر'); return }

    setSaving(true)
    setError('')
    setOfflineNote('')
    try {
      const payload = {
        transferDate: new Date(transferDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: Number(toWarehouseId),
        transferType: 'branch_request',
        notes: createNotes.trim() || undefined,
        items: cart.map((l) => ({
          itemId: l.item.id,
          quantity: l.quantity,
          unitCost: toNum(l.item.costPrice),
        })),
      }
      const res = await offlineWrite<StockTransfer>('/transfers', 'POST', payload, {
        entity: 'stockTransfer',
      })
      if (res.queued) {
        setOfflineNote('لا يوجد اتصال — حُفظ الطلب محلياً وستُزامن لاحقاً')
      }
      setFromBranchId('')
      setCart([])
      setCreateNotes('')
      setSearch('')
      setActiveTab('outgoing')
      await loadOutgoing()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const openReview = async (t: StockTransfer) => {
    setReviewTransfer(t)
    setReviewNotes(t.notes || '')
    setReviewItems(
      (t.items ?? []).map((ti) => {
        const stockItem = items.find((it) => it.id === ti.itemId)
        const available = stockItem?.currentStock ?? 0
        return {
          transferItemId: ti.id,
          itemId: ti.itemId,
          itemName: ti.item?.itemName ?? `#${ti.itemId}`,
          requestedQty: ti.quantity,
          availableQty: available,
          approvedQty: ti.quantity,
        }
      })
    )
    setReviewOpen(true)
  }

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!reviewTransfer) return
    setSaving(true)
    setError('')
    try {
      if (action === 'reject') {
        await api.post(`/transfers/${reviewTransfer.id}/cancel`, { status: 'rejected' })
      } else {
        const itemsPayload = reviewItems.map((ri) => ({
          transferItemId: ri.transferItemId,
          approvedQty: ri.approvedQty,
        }))
        await api.post(`/transfers/${reviewTransfer.id}/review`, {
          items: itemsPayload,
          notes: reviewNotes.trim() || undefined,
        })
      }
      setReviewOpen(false)
      setReviewTransfer(null)
      await loadIncoming()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleReceive = async (t: StockTransfer) => {
    if (!confirm(`تأكيد استلام التحويل ${t.transferNumber}؟`)) return
    setSaving(true)
    setError('')
    try {
      await api.post(`/transfers/${t.id}/receive`, {})
      await loadOutgoing()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (t: StockTransfer) => {
    if (!confirm(`إلغاء الطلب ${t.transferNumber}؟`)) return
    setSaving(true)
    setError('')
    try {
      await api.post(`/transfers/${t.id}/cancel`, {})
      if (activeTab === 'outgoing') await loadOutgoing()
      else await loadIncoming()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">تحويلات المخزون</h1>
        <p className="text-sm text-slate-500">طلبات بين الفروع والتحويلات</p>
      </div>

      {offlineNote && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">📴 {offlineNote}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('incoming')}
          className={`relative px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'incoming' ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📥 الطلبات الواردة
          {incomingBadge > 0 && (
            <span className="absolute -top-1 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {incomingBadge}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'outgoing' ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📤 الطلبات الصادرة
        </button>
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'create' ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          ➕ طلب داخلي جديد
        </button>
      </div>

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ التحميل...</p>
      ) : (
        <>
          {/* ═══════════ طلبات واردة ═══════════ */}
          {activeTab === 'incoming' && (
            <IncomingTab
              transfers={incomingTransfers}
              onReview={openReview}
              onCancel={handleCancel}
              saving={saving}
            />
          )}

          {/* ═══════════ طلبات صادرة ═══════════ */}
          {activeTab === 'outgoing' && (
            <OutgoingTab
              transfers={outgoingTransfers}
              onReceive={handleReceive}
              onCancel={handleCancel}
              saving={saving}
            />
          )}

          {/* ═══════════ طلب داخلي جديد ═══════════ */}
          {activeTab === 'create' && (
            <CreateRequestTab
              sourceBranches={sourceBranches}
              myWarehouse={myWarehouse}
              fromBranchId={fromBranchId}
              setFromBranchId={setFromBranchId}
              toWarehouseId={toWarehouseId}
              setToWarehouseId={setToWarehouseId}
              transferDate={transferDate}
              setTransferDate={setTransferDate}
              cart={cart}
              setCart={setCart}
              items={filteredItems}
              search={search}
              setSearch={setSearch}
              notes={createNotes}
              setNotes={setCreateNotes}
              onAddItem={addToCart}
              onUpdateLine={updateLine}
              onRemoveLine={removeLine}
              onSubmit={handleCreateRequest}
              saving={saving}
              error={error}
            />
          )}
        </>
      )}

      {/* ═══════════ مودال تفاصيل ═══════════ */}
      <Modal open={viewTransfer !== null} title="تفاصيل التحويل" onClose={() => setViewTransfer(null)} wide>
        {viewTransfer && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-800">{viewTransfer.transferNumber}</p>
                <p className="text-xs text-slate-500">{fmtDate(viewTransfer.transferDate)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[viewTransfer.status] ?? ''}`}>
                {STATUS_LABEL[viewTransfer.status] ?? viewTransfer.status}
              </span>
            </div>
            <p className="mb-2 text-sm text-slate-600">
              {viewTransfer.fromWarehouse?.name ?? `#${viewTransfer.fromWarehouseId}`}
              {' ← '}
              {viewTransfer.toWarehouse?.name ?? `#${viewTransfer.toWarehouseId}`}
            </p>
            <table className="table">
              <thead>
                <tr><th>الصنف</th><th>الكمية</th><th>المستلم</th><th>تكلفة الوحدة</th></tr>
              </thead>
              <tbody>
                {(viewTransfer.items ?? []).map((i) => (
                  <tr key={i.id}>
                    <td>{i.item?.itemName ?? '—'}</td>
                    <td>{fmtMoney(i.quantity)}</td>
                    <td>{fmtMoney(i.receivedQty ?? 0)}</td>
                    <td>{fmtMoney(i.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {viewTransfer.notes && <p className="mt-2 text-xs text-slate-500">ملاحظات: {viewTransfer.notes}</p>}
          </div>
        )}
      </Modal>

      {/* ═══════════ مودال المراجعة ═══════════ */}
      <Modal open={reviewOpen} title={`مراجعة ${reviewTransfer?.transferNumber ?? ''}`} onClose={() => setReviewOpen(false)} wide>
        {reviewTransfer && (
          <div>
            <p className="mb-2 text-sm text-slate-600">
              طلب من: {reviewTransfer.fromWarehouse?.name ?? `#${reviewTransfer.fromWarehouseId}`}
            </p>
            {reviewTransfer.notes && (
              <p className="mb-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
                📝 ملاحظات الطلب: {reviewTransfer.notes}
              </p>
            )}

            <table className="table mb-3">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th className="text-center">المطلوب</th>
                  <th className="text-center">المتوفر في مخزني</th>
                  <th className="text-center">الكمية المعتمدة</th>
                </tr>
              </thead>
              <tbody>
                {reviewItems.map((ri, idx) => (
                  <tr key={ri.transferItemId}>
                    <td>{ri.itemName}</td>
                    <td className="text-center font-mono">{ri.requestedQty}</td>
                    <td className="text-center font-mono text-slate-500">{ri.availableQty}</td>
                    <td className="text-center">
                      <input
                        type="number"
                        min={0}
                        max={ri.availableQty}
                        className="input w-20 px-2 py-1 text-center"
                        value={ri.approvedQty}
                        onChange={(e) => {
                          const val = Math.min(ri.availableQty, Math.max(0, toNum(e.target.value)))
                          setReviewItems((prev) => prev.map((r, i) => i === idx ? { ...r, approvedQty: val } : r))
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mb-3">
              <label className="label">ملاحظات الرد</label>
              <input
                className="input"
                placeholder="مثلاً: متوفر 3 فقط حالياً"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleReview('approve')}
                disabled={saving}
                className="btn-primary flex-1"
              >
                {saving ? 'جارٍ الحفظ...' : '✅ اعتماد وشحن'}
              </button>
              <button
                onClick={() => handleReview('reject')}
                disabled={saving}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 flex-1"
              >
                ❌ رفض الطلب
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ═══════════════════════════════════════════════ */
/*  تبويب الطلبات الواردة                          */
/* ═══════════════════════════════════════════════ */
function IncomingTab({
  transfers, onReview, onCancel, saving,
}: {
  transfers: StockTransfer[]
  onReview: (t: StockTransfer) => void
  onCancel: (t: StockTransfer) => void
  saving: boolean
}) {
  const pending = transfers.filter((t) => t.status === 'requested')
  const inTransit = transfers.filter((t) => t.status === 'in_transit')

  if (transfers.length === 0) {
    return <div className="card text-center text-slate-400">لا توجد طلبات واردة</div>
  }

  return (
    <div>
      {pending.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-bold text-slate-700">⏳ بانتظار المراجعة ({pending.length})</h3>
          <div className="card overflow-x-auto p-0 mb-4">
            <table className="table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>من</th>
                  <th>التاريخ</th>
                  <th>الأصناف</th>
                  <th>ملاحظات</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-xs">{t.transferNumber}</td>
                    <td>{t.fromWarehouse?.branch?.name ?? t.fromWarehouse?.name ?? '—'}</td>
                    <td>{fmtDate(t.transferDate)}</td>
                    <td>{t.items?.length ?? 0}</td>
                    <td className="max-w-[200px] truncate text-xs text-slate-500">{t.notes || '—'}</td>
                    <td>
                      <button
                        onClick={() => onReview(t)}
                        className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                      >
                        📋 مراجعة
                      </button>
                      <button
                        onClick={() => onCancel(t)}
                        disabled={saving}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        رفض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {inTransit.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-bold text-slate-700">🚚 قيد الشحن ({inTransit.length})</h3>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>من</th>
                  <th>التاريخ</th>
                  <th>الأصناف</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {inTransit.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-xs">{t.transferNumber}</td>
                    <td>{t.fromWarehouse?.branch?.name ?? t.fromWarehouse?.name ?? '—'}</td>
                    <td>{fmtDate(t.transferDate)}</td>
                    <td>{t.items?.length ?? 0}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[t.status] ?? ''}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════ */
/*  تبويب الطلبات الصادرة                          */
/* ═══════════════════════════════════════════════ */
function OutgoingTab({
  transfers, onReceive, onCancel, saving,
}: {
  transfers: StockTransfer[]
  onReceive: (t: StockTransfer) => void
  onCancel: (t: StockTransfer) => void
  saving: boolean
}) {
  if (transfers.length === 0) {
    return <div className="card text-center text-slate-400">لم تُرسل أي طلبات بعد</div>
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="table">
        <thead>
          <tr>
            <th>الرقم</th>
            <th>إلى</th>
            <th>التاريخ</th>
            <th>الأصناف</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr key={t.id}>
              <td className="font-mono text-xs">{t.transferNumber}</td>
              <td>{t.toWarehouse?.branch?.name ?? t.toWarehouse?.name ?? '—'}</td>
              <td>{fmtDate(t.transferDate)}</td>
              <td>{t.items?.length ?? 0}</td>
              <td>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[t.status] ?? ''}`}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </td>
              <td>
                <div className="flex gap-1">
                  {t.status === 'requested' && (
                    <button
                      onClick={() => onCancel(t)}
                      disabled={saving}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      إلغاء
                    </button>
                  )}
                  {t.status === 'in_transit' && (
                    <button
                      onClick={() => onReceive(t)}
                      disabled={saving}
                      className="rounded px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                    >
                      ✅ استلام
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ═══════════════════════════════════════════════ */
/*  تبويب إنشاء طلب داخلي جديد                     */
/* ═══════════════════════════════════════════════ */
function CreateRequestTab({
  sourceBranches, myWarehouse,
  fromBranchId, setFromBranchId,
  toWarehouseId: _toWarehouseId, setToWarehouseId,
  transferDate, setTransferDate,
  cart, setCart: _setCart, items, search, setSearch,
  notes, setNotes,
  onAddItem, onUpdateLine, onRemoveLine,
  onSubmit, saving, error: _error,
}: {
  sourceBranches: Branch[]
  myWarehouse?: Warehouse
  fromBranchId: string
  setFromBranchId: (v: string) => void
  toWarehouseId: string
  setToWarehouseId: (v: string) => void
  transferDate: string
  setTransferDate: (v: string) => void
  cart: TrLine[]
  setCart: React.Dispatch<React.SetStateAction<TrLine[]>>
  items: Item[]
  search: string
  setSearch: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  onAddItem: (item: Item) => void
  onUpdateLine: (idx: number, patch: Partial<TrLine>) => void
  onRemoveLine: (idx: number) => void
  onSubmit: () => void
  saving: boolean
  error: string
}) {
  useEffect(() => {
    if (myWarehouse) setToWarehouseId(String(myWarehouse.id))
  }, [myWarehouse, setToWarehouseId])

  return (
    <div className="card">
      <h3 className="mb-3 text-lg font-bold text-slate-800">طلب داخلي جديد</h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div>
          <label className="label">الفرع المصدر (من) *</label>
          <select className="input" value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)}>
            <option value="">— اختر الفرع —</option>
            {sourceBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">الفرع الهدف (إلى)</label>
          <input
            className="input bg-slate-50"
            value={myWarehouse?.branch?.name ?? '— فرعي —'}
            disabled
          />
        </div>
        <div>
          <label className="label">التاريخ</label>
          <input type="date" className="input" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">الأصناف المطلوبة</label>
        <input
          className="input mb-2"
          placeholder="🔍 ابحث عن صنف لإضافته"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mb-3 max-h-32 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => onAddItem(it)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-brand-400 hover:bg-brand-50"
              >
                {it.itemName}
              </button>
            ))}
          </div>
        </div>

        {cart.length > 0 ? (
          <div className="max-h-48 overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th className="w-24">الكمية المطلوبة</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l, i) => (
                  <tr key={l.item.id}>
                    <td className="text-xs">{l.item.itemName}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        className="input px-2 py-1"
                        value={l.quantity}
                        onChange={(e) => onUpdateLine(i, { quantity: Math.max(1, toNum(e.target.value)) })}
                      />
                    </td>
                    <td>
                      <button onClick={() => onRemoveLine(i)} className="rounded p-1 text-red-500 hover:bg-red-50" title="حذف">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-slate-400">ابحث وأضف الأصناف المطلوبة</p>
        )}
      </div>

      <div className="mt-3">
        <label className="label">ملاحظات الطلب</label>
        <input className="input" placeholder="مثلاً: نحتاج 10 طابعات للفرع الجديد" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="mt-4">
        <button onClick={onSubmit} disabled={saving || cart.length === 0} className="btn-primary w-full">
          {saving ? 'جارٍ الإرسال...' : '📤 إرسال الطلب'}
        </button>
      </div>
    </div>
  )
}
