import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, extractError } from '@/lib/api'
import SerialPicker from '@/components/SerialPicker'
import { fmt, toNum } from '@/lib/format'
import type { Item, StockTransfer } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  pending: 'معلق',
  approved: 'معتمد',
  in_transit: 'قيد الشحن',
  received: 'مستلم',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
}

export default function TransferReceive() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [transfer, setTransfer] = useState<StockTransfer | null>(null)
  const [qtyInput, setQtyInput] = useState<Record<number, number>>({})
  const [serialMap, setSerialMap] = useState<Record<number, string[]>>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // حالة منتقي السيريالات
  const [pickerItem, setPickerItem] = useState<Item | null>(null)
  const [pickerItemId, setPickerItemId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<StockTransfer>(`/transfers/${id}`)
      setTransfer(res.data)
      const initial: Record<number, number> = {}
      for (const i of res.data.items ?? []) {
        const remaining = toNum(i.quantity) - toNum(i.receivedQty)
        initial[i.id] = Math.max(0, remaining)
      }
      setQtyInput(initial)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const items = useMemo(() => transfer?.items ?? [], [transfer])

  const canReceive = transfer?.status === 'approved' || transfer?.status === 'in_transit'

  const remainingOf = (transferItemId: number): number => {
    const it = items.find((x) => x.id === transferItemId)
    if (!it) return 0
    return toNum(it.quantity) - toNum(it.receivedQty)
  }

  const openPicker = (transferItemId: number) => {
    const it = items.find((x) => x.id === transferItemId)
    if (!it?.item) return
    setPickerItemId(transferItemId)
    setPickerItem(it.item)
  }

  const handleReceive = async () => {
    if (!transfer) return
    const payloadItems: Array<{
      transferItemId: number
      receivedQty: number
      serialNumbers?: string[]
    }> = []

    for (const it of items) {
      const remaining = remainingOf(it.id)
      if (remaining <= 0) continue
      const qty = Math.min(toNum(qtyInput[it.id] ?? remaining), remaining)
      if (qty <= 0) continue

      let serialNumbers: string[] | undefined
      if (it.item?.trackSerial) {
        const chosen = serialMap[it.id] ?? []
        if (chosen.length !== qty) {
          setError(
            `الصنف «${it.item.itemName}» يتطلب ${fmt(qty, 0)} رقم تسلسلي (المحدد: ${chosen.length})`
          )
          return
        }
        serialNumbers = chosen
      }
      payloadItems.push({ transferItemId: it.id, receivedQty: qty, serialNumbers })
    }

    if (payloadItems.length === 0) {
      setError('لا توجد كمية للاستلام')
      return
    }

    setSaving(true)
    setError('')
    try {
      await api.post(`/transfers/${transfer.id}/receive`, {
        items: payloadItems,
      })
      setDone(true)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="p-6 py-16 text-center text-slate-400">جارٍ تحميل التحويل...</p>
  }

  if (!transfer) {
    return (
      <div className="p-6">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button onClick={() => navigate('/inventory/transfers')} className="btn-secondary">
          العودة للتحويلات
        </button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-xl font-bold text-green-800">✅ تم استلام التحويل بنجاح</p>
          <p className="mt-1 text-sm text-green-700">
            {transfer.transferNumber} — تم نقل الكميات إلى المخزن الهدف
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => navigate('/inventory/transfers')} className="btn-primary">
              العودة للتحويلات
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">استلام تحويل</h1>
          <p className="text-sm text-slate-500">
            {transfer.transferNumber} — من {transfer.fromWarehouse?.name ?? `#${transfer.fromWarehouseId}`} إلى{' '}
            {transfer.toWarehouse?.name ?? `#${transfer.toWarehouseId}`} —{' '}
            {STATUS_LABEL[transfer.status] ?? transfer.status}
          </p>
        </div>
        <button onClick={() => navigate('/inventory/transfers')} className="btn-secondary">
          ↩ التحويلات
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {!canReceive ? (
        <div className="card text-center text-slate-400">
          لا يمكن استلام هذا التحويل في حالته الحالية
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>المستلم سابقاً</th>
                  <th>المتبقي</th>
                  <th className="w-24">الكمية المستلمة</th>
                  <th className="w-40">السيريالات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const remaining = remainingOf(it.id)
                  return (
                    <tr key={it.id}>
                      <td>
                        <div className="text-xs font-medium text-slate-800">
                          {it.item?.itemName ?? '—'}
                        </div>
                        {it.item?.trackSerial && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            سيريال
                          </span>
                        )}
                      </td>
                      <td>{fmt(it.quantity)}</td>
                      <td>{fmt(it.receivedQty ?? 0)}</td>
                      <td>{fmt(remaining)}</td>
                      <td>
                        {remaining > 0 ? (
                          <input
                            type="number"
                            min={1}
                            max={remaining}
                            className="input px-2 py-1"
                            value={qtyInput[it.id] ?? remaining}
                            onChange={(e) =>
                              setQtyInput((prev) => ({ ...prev, [it.id]: toNum(e.target.value) }))
                            }
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {remaining > 0 && it.item?.trackSerial ? (
                          <div>
                            <button
                              onClick={() => openPicker(it.id)}
                              className="rounded bg-slate-100 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                            >
                              {it.itemId ? (serialMap[it.id]?.length ?? 0) : 0} رقم تسلسلي — اختر
                            </button>
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              من مخزن المصدر
                            </p>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={handleReceive} disabled={saving} className="btn-primary flex-1">
              {saving ? 'جارٍ الاستلام...' : '📥 تأكيد الاستلام'}
            </button>
            <button onClick={() => navigate('/inventory/transfers')} className="btn-secondary">
              إلغاء
            </button>
          </div>
        </>
      )}

      {/* منتقي الأرقام التسلسلية */}
      {pickerItem && pickerItemId !== null && (
        <SerialPicker
          open={true}
          item={pickerItem}
          warehouseId={transfer?.fromWarehouseId}
          max={Math.min(toNum(qtyInput[pickerItemId] ?? remainingOf(pickerItemId)), remainingOf(pickerItemId))}
          onClose={() => {
            setPickerItem(null)
            setPickerItemId(null)
          }}
          onConfirm={(chosen) => {
            setSerialMap((prev) => ({ ...prev, [pickerItemId]: chosen }))
            setPickerItem(null)
            setPickerItemId(null)
          }}
        />
      )}
    </div>
  )
}
