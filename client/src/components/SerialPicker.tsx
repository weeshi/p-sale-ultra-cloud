import { useEffect, useState } from 'react'
import Modal from './Modal'
import { api, extractError } from '@/lib/api'
import { fmt, toNum } from '@/lib/format'
import type { Item, Serial } from '@/types'

interface SerialPickerProps {
  open: boolean
  item: Item | null
  warehouseId?: number | null
  max: number
  onClose: () => void
  onConfirm: (serials: string[]) => void
}

export default function SerialPicker({ open, item, warehouseId, max, onClose, onConfirm }: SerialPickerProps) {
  const [serials, setSerials] = useState<Serial[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setSelected(new Set())
    setSearch('')
    setError('')
    setLoading(true)
    ;(async () => {
      try {
        const res = await api.get<Item>(`/items/${item.id}`)
        const all = (res.data.serials ?? []).filter(
          (s) =>
            s.status === 'in_stock' &&
            (!warehouseId || !s.warehouseId || s.warehouseId === warehouseId)
        )
        setSerials(all)
        if (all.length === 0) setError('لا توجد أرقام تسلسلية متاحة لهذا الصنف في المخزن المحدد')
      } catch (err) {
        setError(extractError(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [open, item, warehouseId])

  const filtered = serials.filter((s) =>
    !search.trim() || s.serialNumber.toLowerCase().includes(search.trim().toLowerCase())
  )

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= max) return prev
        next.add(id)
      }
      return next
    })
  }

  const handleConfirm = () => {
    const chosen = serials
      .filter((s) => selected.has(s.id))
      .map((s) => s.serialNumber)
    if (chosen.length !== max) {
      setError(`يجب اختيار ${max} أرقام تسلسلية بالضبط (المحدد: ${chosen.length})`)
      return
    }
    onConfirm(chosen)
  }

  return (
    <Modal open={open} title={`اختيار الأرقام التسلسلية — ${item?.itemName ?? ''}`} onClose={onClose} wide>
      <p className="mb-2 text-sm text-slate-600">
        المطلوب: <b className="text-brand-700">{max}</b> — المحدد:{' '}
        <b className="text-brand-700">{selected.size}</b>
      </p>
      <input
        className="input mb-3"
        placeholder="🔍 بحث برقم تسلسلي / IMEI"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="py-6 text-center text-slate-400">جارٍ تحميل الأرقام التسلسلية...</p>
      ) : filtered.length === 0 ? (
        <p className="card text-center text-slate-400">لا توجد نتائج</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10"></th>
                <th>الرقم التسلسلي</th>
                <th>الحالة</th>
                <th>المخزن</th>
                <th>الضمان</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={`cursor-pointer ${selected.has(s.id) ? 'bg-brand-50' : ''}`}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      disabled={!selected.has(s.id) && selected.size >= max}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="font-mono text-xs">{s.serialNumber}</td>
                  <td>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">متاح</span>
                  </td>
                  <td>{s.warehouseId ? `#${s.warehouseId}` : '—'}</td>
                  <td>
                    {s.warrantyMonths
                      ? `${fmt(s.warrantyMonths, 0)} شهر`
                      : toNum(s.salePrice)
                        ? `${fmt(s.salePrice, 0)} د.ل`
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button onClick={handleConfirm} className="btn-primary flex-1" disabled={selected.size === 0}>
          تأكيد الاختيار ({selected.size}/{max})
        </button>
        <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
      </div>
    </Modal>
  )
}
