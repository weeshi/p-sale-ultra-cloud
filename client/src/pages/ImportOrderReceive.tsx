import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmt, fmtDate, fmtMoney, fmtUsd, toNum } from '@/lib/format'
import { printPurchaseInvoice } from '@/lib/print'
import type { PurchaseInvoice, PurchaseOrder, Treasury, Warehouse } from '@/types'

export default function ImportOrderReceive() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [treasuries, setTreasuries] = useState<Treasury[]>([])

  const [warehouseId, setWarehouseId] = useState('')
  const [treasuryId, setTreasuryId] = useState('')
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paidAmount, setPaidAmount] = useState('')
  const [shippingCost, setShippingCost] = useState('')
  const [customsCost, setCustomsCost] = useState('')
  const [insuranceCost, setInsuranceCost] = useState('')
  const [otherCosts, setOtherCosts] = useState('')
  const [serialInput, setSerialInput] = useState<Record<number, string>>({})
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offlineNote, setOfflineNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<PurchaseInvoice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [poRes, whs, trs] = await Promise.all([
        api.get<PurchaseOrder>(`/purchases/orders/${id}`),
        cachedRead<Warehouse[]>('warehouses:list', () => api.get('/warehouses').then((r) => r.data), 'warehouses'
        ),
        cachedRead<Treasury[]>('treasuries:list', () => api.get('/treasury').then((r) => r.data), 'treasuries'
        ),
      ])
      setPo(poRes.data)
      setWarehouses(whs.data ?? [])
      setTreasuries(trs.data ?? [])
      if (poRes.data.targetWarehouseId) setWarehouseId(String(poRes.data.targetWarehouseId))
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const exchangeRate = toNum(po?.exchangeRate) || 5.4

  const landedCosts = toNum(shippingCost) + toNum(customsCost) + toNum(insuranceCost) + toNum(otherCosts)

  // توزيع تكلفة الوصول على الأصناف (بنفس منطق الخادم)
  const itemShares = useMemo(() => {
    if (!po) return []
    const items = po.items ?? []
    const base = items.reduce((s, i) => s + toNum(i.totalUsd), 0)
    return items.map((i) => {
      const qty = toNum(i.quantity)
      const ratio = base > 0 ? toNum(i.totalUsd) / base : 0
      const landedShare = landedCosts * ratio
      const unitCostUsd = toNum(i.unitPriceUsd) + (qty > 0 ? landedShare / qty : 0)
      return { item: i, landedShare, unitCostUsd, unitCostLyd: unitCostUsd * exchangeRate, qty }
    })
  }, [po, landedCosts, exchangeRate])

  const serialCount = (itemId: number): number =>
    (serialInput[itemId] ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean).length

  const validate = (): string | null => {
    if (!warehouseId) return 'المخزن الهدف مطلوب'
    if (!po) return 'أمر الاستيراد غير محمل'
    for (const i of po.items ?? []) {
      if (i.item?.trackSerial) {
        const qty = toNum(i.quantity)
        const count = serialCount(i.itemId)
        if (count !== qty) {
          return `الصنف «${i.item.itemName}» يتطلب ${fmt(qty, 0)} رقم تسلسلي (المُدخل: ${count})`
        }
      }
    }
    return null
  }

  const handleReceive = async () => {
    if (!po) return
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    setError('')
    setOfflineNote('')
    const payload = {
      // يُستخدم عند إعادة تنفيذ العملية أوفلاين على السيرفر لتوجيهها لاستلام أمر الشراء
      purchaseOrderId: po.id,
      warehouseId: Number(warehouseId),
      treasuryId: treasuryId ? Number(treasuryId) : undefined,
      receiveDate: new Date(receiveDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
      shippingCost: toNum(shippingCost),
      customsCost: toNum(customsCost),
      insuranceCost: toNum(insuranceCost),
      otherCosts: toNum(otherCosts),
      paidAmount: paidAmount === '' ? undefined : toNum(paidAmount),
      items: (po.items ?? [])
        .filter((i) => i.item?.trackSerial)
        .map((i) => ({
          itemId: i.itemId,
          serialNumbers: (serialInput[i.itemId] ?? '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }))
        .filter((x) => x.serialNumbers.length > 0),
    }
    try {
      const res = await offlineWrite<PurchaseInvoice>(`/purchases/orders/${po.id}/receive`, 'POST', payload, {
        entity: 'purchaseInvoice',
        recordId: po.id,
      })
      if (res.queued) {
        setOfflineNote('لا يوجد اتصال — سُجل الاستلام محلياً وستُزامن لاحقاً')
        navigate('/purchases/import')
      } else {
        setDone(res.data)
      }
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="p-6 py-16 text-center text-slate-400">جارٍ تحميل أمر الاستيراد...</p>
  }

  if (!po) {
    return (
      <div className="p-6">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button onClick={() => navigate('/purchases/import')} className="btn-secondary">العودة لأوامر الاستيراد</button>
      </div>
    )
  }

  const totalUsd = toNum(po.totalAmount) + landedCosts

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">استلام أمر استيراد</h1>
          <p className="text-sm text-slate-500">
            {po.poNumber} — {po.party?.partyName ?? '—'} — {fmtDate(po.poDate)} — سعر الصرف {fmt(po.exchangeRate, 4)}
          </p>
        </div>
        <button onClick={() => navigate('/purchases/import')} className="btn-secondary">↩ أوامر الاستيراد</button>
      </div>

      {offlineNote && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">📴 {offlineNote}</p>
      )}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة ($)</th>
                  <th>حصة الوصول ($)</th>
                  <th>تكلفة الوحدة (د.ل)</th>
                  {po.items?.some((i) => i.item?.trackSerial) && <th>السيريالات</th>}
                </tr>
              </thead>
              <tbody>
                {itemShares.map(({ item: i, landedShare, unitCostLyd, qty }) => (
                  <tr key={i.id}>
                    <td>
                      <div className="text-xs font-medium text-slate-800">{i.item?.itemName ?? '—'}</div>
                      {i.item?.trackSerial && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">سيريال</span>
                      )}
                    </td>
                    <td>{fmt(qty)}</td>
                    <td>{fmtUsd(i.unitPriceUsd)}</td>
                    <td>{fmtUsd(landedShare)}</td>
                    <td className="font-semibold">{fmtMoney(unitCostLyd)}</td>
                    {po.items?.some((x) => x.item?.trackSerial) && (
                      <td>
                        {i.item?.trackSerial ? (
                          <div>
                            <textarea
                              className="input min-h-[70px] font-mono text-xs"
                              placeholder="رقم تسلسلي في كل سطر"
                              value={serialInput[i.itemId] ?? ''}
                              onChange={(e) => setSerialInput((prev) => ({ ...prev, [i.itemId]: e.target.value }))}
                            />
                            <p className={`mt-0.5 text-[10px] ${serialCount(i.itemId) === qty ? 'text-green-600' : 'text-amber-600'}`}>
                              المُدخل: {serialCount(i.itemId)} من {fmt(qty, 0)} المطلوبة
                            </p>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 text-lg font-bold text-slate-800">تفاصيل الاستلام</h2>

          <div className="mb-3 grid grid-cols-1 gap-2">
            <div>
              <label className="label">المخزن الهدف *</label>
              <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">— اختر —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">الخزينة</label>
              <select className="input" value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
                <option value="">—</option>
                {treasuries.map((t) => (
                  <option key={t.id} value={t.id}>{t.treasuryName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">تاريخ الاستلام</label>
              <input type="date" className="input" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
            </div>
            <div>
              <label className="label">المبلغ المدفوع</label>
              <input type="number" className="input" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <span>⚙️ تكاليف الوصول (استيراد)</span>
              <span>{advancedOpen ? '▲' : '▼'}</span>
            </button>
            {advancedOpen && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3">
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
              </div>
            )}
          </div>

          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>قيمة الأمر</span>
              <span>{fmtUsd(po.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>تكلفة الوصول</span>
              <span>{fmtUsd(landedCosts)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-800">
              <span>الإجمالي</span>
              <span>{fmtUsd(totalUsd)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>≈ بالدينار</span>
              <span>{fmtMoney(totalUsd * exchangeRate)}</span>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={handleReceive} disabled={saving} className="btn-primary flex-1">
              {saving ? 'جارٍ الاستلام...' : '📥 تأكيد الاستلام'}
            </button>
            <button onClick={() => navigate('/purchases/import')} className="btn-secondary">إلغاء</button>
          </div>
        </div>
      </div>

      {/* ===== نتيجة الاستلام ===== */}
      {done && (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-base font-bold text-green-800">
            ✅ تم استلام أمر الاستيراد وإنشاء فاتورة شراء <span className="font-mono">{done.invoiceNumber}</span>
          </p>
          <p className="mt-1 text-sm text-green-700">
            الإجمالي: {fmtMoney(done.total)} — الحالة: {done.paymentStatus}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => printPurchaseInvoice(done, undefined)} className="btn-primary flex-1">🖨️ طباعة الفاتورة</button>
            <button onClick={() => navigate('/purchases/import')} className="btn-secondary flex-1">العودة لأوامر الاستيراد</button>
          </div>
        </div>
      )}
    </div>
  )
}
