import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmt, fmtDate, fmtUsd, toNum } from '@/lib/format'
import { mailLink, printPurchaseOrder, purchaseOrderText, waLink } from '@/lib/print'
import type { ExchangeRateResponse, Item, Party, PurchaseOrder, UnifiedPurchasesResponse, Warehouse } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة',
  sent: 'مُرسل',
  confirmed: 'مؤكد',
  partially_received: 'استلام جزئي',
  received: 'مستلم',
  cancelled: 'ملغي',
}
const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-indigo-100 text-indigo-700',
  partially_received: 'bg-amber-100 text-amber-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

interface PoLine {
  item: Item
  quantity: number
  unitPriceUsd: number
}

export default function ImportOrderCreate() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [vendors, setVendors] = useState<Party[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offlineNote, setOfflineNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  // حقول أمر الاستيراد الجديد
  const [partyId, setPartyId] = useState('')
  const [poDate, setPoDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [exchangeRate, setExchangeRate] = useState('8.5')
  const [expectedArrival, setExpectedArrival] = useState('')
  const [targetWarehouseId, setTargetWarehouseId] = useState('')
  const [lcNumber, setLcNumber] = useState('')
  const [lcBank, setLcBank] = useState('')
  const [shippingCost, setShippingCost] = useState('')
  const [customsCost, setCustomsCost] = useState('')
  const [insuranceCost, setInsuranceCost] = useState('')
  const [otherCosts, setOtherCosts] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [cart, setCart] = useState<PoLine[]>([])
  const [search, setSearch] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ordersRes, itemsRes, vendorsRes, whs] = await Promise.all([
        cachedRead<UnifiedPurchasesResponse>('purchases:import', () =>
          api.get('/purchases?type=import&limit=99999').then((r) => r.data), 'purchases'
        ),
        cachedRead<{ items: Item[]; total: number }>('items:list', () =>
          api.get('/items?limit=99999').then((r) => r.data), 'inventory'
        ),
        cachedRead<{ parties: Party[]; total: number }>('parties:list', () =>
          api.get('/parties?limit=99999').then((r) => r.data), 'parties'
        ),
        cachedRead<Warehouse[]>('warehouses:list', () => api.get('/warehouses').then((r) => r.data), 'warehouses'
        ),
      ])
      setOrders(
        (ordersRes.data.purchases ?? [])
          .filter((p) => p.type === 'import')
          .map((p) => p.raw as PurchaseOrder)
      )
      setItems(itemsRes.data.items ?? [])
      setVendors((vendorsRes.data.parties ?? []).filter((p) => p.partyType === 'vendor'))
      setWarehouses(whs.data ?? [])
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (!q) return true
      const haystack = [it.itemCode, it.itemName, it.barcode, it.modelNumber]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }, [items, search])

  const addToCart = (item: Item) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id)
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...prev, { item, quantity: 1, unitPriceUsd: toNum(item.purchasePriceUsd) || toNum(item.purchasePrice) || 0 }]
    })
  }

  const updateLine = (idx: number, patch: Partial<PoLine>) => {
    setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const removeLine = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.unitPriceUsd * l.quantity, 0)
    const total = subtotal - toNum(discount) + toNum(shippingCost) + toNum(customsCost) + toNum(insuranceCost) + toNum(otherCosts)
    return { subtotal, total }
  }, [cart, discount, shippingCost, customsCost, insuranceCost, otherCosts])

  const openCreate = async () => {
    setPartyId('')
    setExchangeRate('')
    setExpectedArrival('')
    setTargetWarehouseId('')
    setLcNumber('')
    setLcBank('')
    setShippingCost('')
    setCustomsCost('')
    setInsuranceCost('')
    setOtherCosts('')
    setDiscount('')
    setNotes('')
    setCart([])
    setSearch('')
    setError('')
    setCreateOpen(true)
    try {
      const res = await api.get<ExchangeRateResponse>('/exchange/rate/USD/LYD')
      setExchangeRate(String(toNum(res.data.rate)))
    } catch {
      // يبقى افتراضياً
    }
  }

  const handleCreate = async () => {
    if (!partyId) {
      setError('المورد مطلوب')
      return
    }
    if (cart.length === 0) {
      setError('لا توجد أصناف في الأمر')
      return
    }
    for (const l of cart) {
      if (!l.quantity || l.quantity <= 0) {
        setError(`الكمية غير صحيحة للصنف «${l.item.itemName}»`)
        return
      }
    }
    setSaving(true)
    setError('')
    setOfflineNote('')
    const payload = {
      poDate: new Date(poDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
      partyId: Number(partyId),
      currency: 'USD',
      exchangeRate: toNum(exchangeRate) || 8.5,
      shippingCost: toNum(shippingCost),
      customsCost: toNum(customsCost),
      insuranceCost: toNum(insuranceCost),
      otherCosts: toNum(otherCosts),
      discount: toNum(discount),
      lcNumber: lcNumber.trim() || undefined,
      lcBank: lcBank.trim() || undefined,
      expectedArrival: expectedArrival ? new Date(expectedArrival).toISOString() : undefined,
      targetWarehouseId: targetWarehouseId ? Number(targetWarehouseId) : undefined,
      notes: notes.trim() || undefined,
      items: cart.map((l) => ({ itemId: l.item.id, quantity: l.quantity, unitPriceUsd: l.unitPriceUsd })),
    }
    try {
      const res = await offlineWrite<PurchaseOrder>('/purchases/orders', 'POST', payload, { entity: 'purchaseOrder' })
      if (res.queued) {
        setOfflineNote('لا يوجد اتصال — حُفظ أمر الاستيراد محلياً وستُزامن لاحقاً')
        setCreateOpen(false)
      } else {
        setCreateOpen(false)
        await openOrder(res.data.id)
      }
      await loadAll()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const openOrder = async (id: number) => {
    setViewLoading(true)
    setError('')
    try {
      const res = await api.get<PurchaseOrder>(`/purchases/orders/${id}`)
      setViewOrder(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setViewLoading(false)
    }
  }

  const shareWhatsApp = (po: PurchaseOrder) => {
    const phone = po.party?.whatsapp || po.party?.mobile
    const link = waLink(phone, purchaseOrderText(po))
    if (link) window.open(link, '_blank')
    else setError('لا يوجد رقم واتساب لهذا المورد')
  }

  const shareEmail = (po: PurchaseOrder) => {
    const link = mailLink(po.party?.email, `أمر استيراد ${po.poNumber}`, purchaseOrderText(po))
    if (link) window.location.href = link
    else setError('لا يوجد بريد إلكتروني لهذا المورد')
  }

  const canReceive = (po: PurchaseOrder) => po.status !== 'received' && po.status !== 'cancelled'

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">أوامر الاستيراد</h1>
          <p className="text-sm text-slate-500">أوامر استيراد خارجية بالدولار مع تكلفة الوصول</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/purchases/local')} className="btn-secondary">🧾 فاتورة محلية</button>
          <button onClick={openCreate} className="btn-primary">+ أمر استيراد جديد</button>
        </div>
      </div>

      {offlineNote && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">📴 {offlineNote}</p>
      )}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل أوامر الاستيراد...</p>
      ) : orders.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد أوامر استيراد بعد</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>المورد</th>
                <th>الوصول المتوقع</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id}>
                  <td className="font-mono text-xs">{po.poNumber}</td>
                  <td>{fmtDate(po.poDate)}</td>
                  <td>{po.party?.partyName ?? '—'}</td>
                  <td>{fmtDate(po.expectedArrival)}</td>
                  <td className="font-semibold">{fmtUsd(po.totalAmount)}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[po.status] ?? ''}`}>
                      {STATUS_LABEL[po.status] ?? po.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openOrder(po.id)} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">
                        عرض
                      </button>
                      {canReceive(po) && (
                        <button
                          onClick={() => navigate(`/purchases/import/${po.id}/receive`)}
                          className="rounded px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                        >
                          استلام
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== إنشاء أمر استيراد ===== */}
      <Modal open={createOpen} title="أمر استيراد جديد" onClose={() => setCreateOpen(false)} wide>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div>
            <label className="label">المورد *</label>
            <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">— اختر —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.partyName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">تاريخ الأمر</label>
            <input type="date" className="input" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
          </div>
          <div>
            <label className="label">سعر الصرف (USD → LYD)</label>
            <input type="number" className="input" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <span>⚙️ خيارات متقدمة (الاعتمادات وتكاليف الوصول)</span>
            <span>{advancedOpen ? '▲' : '▼'}</span>
          </button>
          {advancedOpen && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-3 md:grid-cols-3">
              <div>
                <label className="label">الوصول المتوقع</label>
                <input type="date" className="input" value={expectedArrival} onChange={(e) => setExpectedArrival(e.target.value)} />
              </div>
              <div>
                <label className="label">المخزن الهدف</label>
                <select className="input" value={targetWarehouseId} onChange={(e) => setTargetWarehouseId(e.target.value)}>
                  <option value="">— اختر —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">رقم الاعتماد</label>
                <input className="input" value={lcNumber} onChange={(e) => setLcNumber(e.target.value)} />
              </div>
              <div>
                <label className="label">بنك الاعتماد</label>
                <input className="input" value={lcBank} onChange={(e) => setLcBank(e.target.value)} />
              </div>
              <div>
                <label className="label">الشحن ($)</label>
                <input type="number" className="input" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
              </div>
              <div>
                <label className="label">الجمارك ($)</label>
                <input type="number" className="input" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} />
              </div>
              <div>
                <label className="label">التأمين ($)</label>
                <input type="number" className="input" value={insuranceCost} onChange={(e) => setInsuranceCost(e.target.value)} />
              </div>
              <div>
                <label className="label">تكاليف أخرى ($)</label>
                <input type="number" className="input" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} />
              </div>
              <div>
                <label className="label">الخصم ($)</label>
                <input type="number" className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="label">الأصناف</label>
          <input
            className="input mb-2"
            placeholder="🔍 ابحث عن صنف لإضافته"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mb-3 max-h-32 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              {filtered.map((it) => (
                <button
                  key={it.id}
                  onClick={() => addToCart(it)}
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
                    <th className="w-20">الكمية</th>
                    <th className="w-24">السعر ($)</th>
                    <th className="w-24">الإجمالي</th>
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
                          onChange={(e) => updateLine(i, { quantity: Math.max(1, toNum(e.target.value)) })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input px-2 py-1"
                          value={l.unitPriceUsd}
                          onChange={(e) => updateLine(i, { unitPriceUsd: toNum(e.target.value) })}
                        />
                      </td>
                      <td className="text-xs font-semibold">{fmtUsd(l.unitPriceUsd * l.quantity)}</td>
                      <td>
                        <button onClick={() => removeLine(i)} className="rounded p-1 text-red-500 hover:bg-red-50" title="حذف">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-2 text-center text-sm text-slate-400">لا توجد أصناف مضافة</p>
          )}
        </div>

        <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>المجموع الفرعي</span>
            <span>{fmtUsd(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-800">
            <span>الإجمالي</span>
            <span>{fmtUsd(totals.total)}</span>
          </div>
        </div>

        <div className="mt-3">
          <label className="label">ملاحظات</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={handleCreate} disabled={saving || cart.length === 0} className="btn-primary flex-1">
            {saving ? 'جارٍ الحفظ...' : '💾 حفظ أمر الاستيراد'}
          </button>
          <button onClick={() => setCreateOpen(false)} className="btn-secondary flex-1">إلغاء</button>
        </div>
      </Modal>

      {/* ===== تفاصيل أمر الاستيراد ===== */}
      <Modal open={viewOrder !== null} title="تفاصيل أمر الاستيراد" onClose={() => setViewOrder(null)} wide>
        {viewLoading ? (
          <p className="py-6 text-center text-slate-400">جارٍ التحميل...</p>
        ) : viewOrder ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-800">{viewOrder.poNumber}</p>
                <p className="text-xs text-slate-500">{fmtDate(viewOrder.poDate)} — {viewOrder.currency} @ {fmt(viewOrder.exchangeRate, 4)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[viewOrder.status] ?? ''}`}>
                {STATUS_LABEL[viewOrder.status] ?? viewOrder.status}
              </span>
            </div>
            <p className="mb-2 text-sm text-slate-600">
              المورد: <b>{viewOrder.party?.partyName ?? '—'}</b>
              {viewOrder.lcNumber ? ` — اعتماد: ${viewOrder.lcNumber}${viewOrder.lcBank ? ` (${viewOrder.lcBank})` : ''}` : ''}
            </p>
            <div className="max-h-64 overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الكمية</th>
                    <th>سعر الوحدة</th>
                    <th>المستلم</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewOrder.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td>{i.item?.itemName ?? '—'}</td>
                      <td>{fmt(i.quantity)}</td>
                      <td>{fmtUsd(i.unitPriceUsd)}</td>
                      <td>{fmt(i.receivedQty ?? 0)}</td>
                      <td className="font-semibold">{fmtUsd(i.totalUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between text-slate-600"><span>المجموع الفرعي</span><span>{fmtUsd(viewOrder.subtotal)}</span></div>
              {toNum(viewOrder.shippingCost) > 0 && (
                <div className="flex justify-between text-slate-600"><span>الشحن</span><span>{fmtUsd(viewOrder.shippingCost)}</span></div>
              )}
              {toNum(viewOrder.customsCost) > 0 && (
                <div className="flex justify-between text-slate-600"><span>الجمارك</span><span>{fmtUsd(viewOrder.customsCost)}</span></div>
              )}
              {toNum(viewOrder.insuranceCost) > 0 && (
                <div className="flex justify-between text-slate-600"><span>التأمين</span><span>{fmtUsd(viewOrder.insuranceCost)}</span></div>
              )}
              {toNum(viewOrder.otherCosts) > 0 && (
                <div className="flex justify-between text-slate-600"><span>تكاليف أخرى</span><span>{fmtUsd(viewOrder.otherCosts)}</span></div>
              )}
              {toNum(viewOrder.discount) > 0 && (
                <div className="flex justify-between text-slate-600"><span>الخصم</span><span>- {fmtUsd(viewOrder.discount)}</span></div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-800">
                <span>الإجمالي</span><span>{fmtUsd(viewOrder.totalAmount)}</span>
              </div>
            </div>
            {viewOrder.notes && <p className="mt-2 text-xs text-slate-500">ملاحظات: {viewOrder.notes}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => printPurchaseOrder(viewOrder, undefined)} className="btn-primary flex-1">🖨️ طباعة</button>
              <button onClick={() => shareWhatsApp(viewOrder)} className="btn-secondary">💬 واتساب</button>
              <button onClick={() => shareEmail(viewOrder)} className="btn-secondary">✉️ بريد</button>
              {canReceive(viewOrder) && (
                <button onClick={() => navigate(`/purchases/import/${viewOrder.id}/receive`)} className="btn-secondary flex-1">
                  📥 استلام
                </button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
