import { useCallback, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { printInventoryCountSheet } from '@/lib/print'
import { fmt, fmtDate, fmtMoney, toInputNum, toNum } from '@/lib/format'
import type { InventoryCount, InventoryCountItem, Warehouse } from '@/types'

const STATUS_LABEL: Record<string, string> = { draft: 'مسودة', posted: 'مرحّل' }
const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700',
  posted: 'bg-green-100 text-green-700',
}

export default function InventoryCounts() {
  const { selectedBranchId } = useBranchFilter()
  const [counts, setCounts] = useState<InventoryCount[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  const [viewCount, setViewCount] = useState<InventoryCount | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [goodMap, setGoodMap] = useState<Record<number, string>>({})
  const [damagedMap, setDamagedMap] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')

  // مسح الباركود / استيراد الجرد
  const barcodeRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanKey, setScanKey] = useState(0)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const branchParam = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
      const [countsRes, whs] = await Promise.all([
        cachedRead<InventoryCount[]>(`inventory:counts:${selectedBranchId ?? 'all'}`, () =>
          api.get(`/inventory/counts${branchParam}`).then((r) => r.data), 'inventory'
        ),
        cachedRead<Warehouse[]>(`warehouses:list:${selectedBranchId ?? 'all'}`, () =>
          api.get(`/warehouses${branchParam}`).then((r) => r.data), 'warehouses'
        ),
      ])
      setCounts(countsRes.data ?? [])
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

  useEffect(() => {
    setWarehouseId('')
  }, [selectedBranchId])

  const openCreate = () => {
    setWarehouseId('')
    setCountDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setError('')
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!warehouseId) {
      setError('المخزن مطلوب')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        warehouseId: Number(warehouseId),
        countDate: new Date(countDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
        notes: notes.trim() || undefined,
      }
      const res = await offlineWrite<InventoryCount>('/inventory/counts', 'POST', payload, {
        entity: 'inventoryCount',
      })
      setCreateOpen(false)
      await loadAll()
      void res
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const openCount = async (id: number) => {
    setViewLoading(true)
    setError('')
    setScanKey((k) => k + 1)
    setImportMsg(null)
    try {
      const res = await api.get<InventoryCount>(`/inventory/counts/${id}`)
      setViewCount(res.data)
      const good: Record<number, string> = {}
      const damaged: Record<number, string> = {}
      for (const it of res.data.items ?? []) {
        good[it.id] = toInputNum(it.countedGoodQty ?? it.countedQty)
        damaged[it.id] = toInputNum(it.countedDamagedQty ?? 0)
      }
      setGoodMap(good)
      setDamagedMap(damaged)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setViewLoading(false)
    }
  }

  const refreshView = async () => {
    if (!viewCount) return
    await openCount(viewCount.id)
  }

  const saveAll = async () => {
    if (!viewCount) return
    const changed = (viewCount.items ?? []).filter((it) => {
      const g = toNum(goodMap[it.id])
      const d = toNum(damagedMap[it.id])
      return g !== toNum(it.countedGoodQty ?? it.countedQty) || d !== toNum(it.countedDamagedQty ?? 0)
    })
    if (changed.length === 0) {
      setError('لا توجد تغييرات للحفظ')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Offline-First: كل بند يُصطف في طابور المزامنة مع entity 'inventoryCount'
      for (const it of changed) {
        await offlineWrite(
          `/inventory/counts/${viewCount.id}/items`,
          'POST',
          {
            itemId: it.itemId,
            countedGoodQty: toNum(goodMap[it.id]),
            countedDamagedQty: toNum(damagedMap[it.id] ?? 0),
          },
          { entity: 'inventoryCount' }
        )
      }
      await refreshView()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  // نسخ الكمية النظامية → المعدود الصالح (للأصناف غير المعدودة فقط)
  const autoFillSystemQty = () => {
    if (!viewCount) return
    const nextGood: Record<number, string> = { ...goodMap }
    let filled = 0
    for (const it of viewCount.items ?? []) {
      const currentGood = toNum(goodMap[it.id])
      const currentDamaged = toNum(damagedMap[it.id] ?? 0)
      if (currentGood === 0 && currentDamaged === 0) {
        nextGood[it.id] = toInputNum(it.systemQty)
        filled++
      }
    }
    if (filled === 0) {
      setError('كل الأصناف لها كميات معدودة بالفعل')
      return
    }
    setGoodMap(nextGood)
    setError(`تم تعبئة ${filled} صنف بالكمية النظامية`)
  }

  // طباعة ورقة جرد: كود، اسم، عمود فارغ للكمية الفعلية
  const printCountSheet = () => {
    if (!viewCount) return
    printInventoryCountSheet({
      countNumber: viewCount.countNumber,
      warehouseName: viewCount.warehouse?.name ?? `مخزن #${viewCount.warehouseId}`,
      countDate: fmtDate(viewCount.countDate),
      items: (viewCount.items ?? []).map((it, i) => ({
        index: i + 1,
        itemCode: it.item?.itemCode ?? '',
        itemName: it.item?.itemName ?? `#${it.itemId}`,
        systemQty: fmt(it.systemQty),
      })),
    })
  }

  const postCount = async () => {
    if (!viewCount) return
    if (!confirm(`ترحيل الجرد ${viewCount.countNumber}؟ سيُطبَّق الفرق على المخزون نهائياً.`)) return
    setSaving(true)
    setError('')
    try {
      await api.post(`/inventory/counts/${viewCount.id}/post`, {})
      await refreshView()
      await loadAll()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const createCorrective = async (c: InventoryCount) => {
    if (!confirm(`إنشاء جرد تصحيحي من ${c.countNumber}؟ سيُنشأ جرد فرعي من الرصيد الحي.`)) return
    setSaving(true)
    setError('')
    try {
      await api.post(`/inventory/counts/${c.id}/corrective`, {})
      await loadAll()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  // ===== مسح الباركود / كود الصنف: يحدد الصف وينقل المؤشر للحقل الصالح =====
  const scanMatch = (raw: string) => {
    if (!viewCount) return
    const value = raw.trim()
    if (!value) return
    const lowered = value.toLowerCase()
    const item = (viewCount.items ?? []).find(
      (it) =>
        it.item?.itemCode === value ||
        (it.item?.barcode && String(it.item.barcode) === value) ||
        it.item?.itemCode?.toLowerCase().includes(lowered) ||
        it.item?.barcode?.toLowerCase().includes(lowered)
    )
    if (item) {
      setScanKey((k) => k + 1)
      requestAnimationFrame(() => {
        document.getElementById(`count-row-${item.id}`)?.scrollIntoView({ block: 'center' })
        const goodInput = document.getElementById(`count-good-${item.id}`) as HTMLInputElement | null
        goodInput?.focus()
        goodInput?.select()
      })
    } else {
      setImportMsg({ ok: false, text: `لم يُعثر على صنف بالكود/الباركود: ${value}` })
    }
  }

  // ===== استيراد الجرد من CSV/Excel (محوَّل إلى CSV) =====
  const onImportFile = (file: File) => {
    if (!viewCount) return
    setImportMsg(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '')
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
        const rows = parsed.data
        if (rows.length < 2) {
          setImportMsg({ ok: false, text: 'الملف فارغ أو لا يحتوي على صفوف بيانات' })
          return
        }
        const headers = rows[0].map((h) => (h ?? '').toString().trim().toLowerCase())
        const idxCode = headers.findIndex((h) => h.includes('code') || h.includes('itemcode') || h.includes('كود'))
        const idxBarcode = headers.findIndex((h) => h.includes('barcode') || h.includes('باركود'))
        const idxId = headers.findIndex((h) => h === 'id' || h === 'item_id')
        const idxGood = headers.findIndex(
          (h) => h.includes('good') || h.includes('salih') || h.includes('صالح') || h.includes('counted')
        )
        const idxDamaged = headers.findIndex(
          (h) => h.includes('damag') || h.includes('talaf') || h.includes('تالف')
        )
        if ((idxCode === -1 && idxBarcode === -1 && idxId === -1) || idxGood === -1) {
          setImportMsg({
            ok: false,
            text: 'تأكد من أعمدة الملف: (كود الصنف أو الباركود، الكمية الصالحة، الكمية التالفة)',
          })
          return
        }

        const nextGood: Record<number, string> = { ...goodMap }
        const nextDamaged: Record<number, string> = { ...damagedMap }
        let matched = 0
        let failed = 0

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r].map((c) => (c ?? '').toString().trim())
          if (row.length === 0 || row.every((c) => c === '')) continue
          const codeVal = idxCode >= 0 ? row[idxCode] : ''
          const barcodeVal = idxBarcode >= 0 ? row[idxBarcode] : ''
          const idVal = idxId >= 0 ? row[idxId] : ''
          const goodVal = idxGood >= 0 ? Number(row[idxGood]) : NaN
          const damagedVal = idxDamaged >= 0 ? Number(row[idxDamaged]) : 0

          const item = (viewCount.items ?? []).find(
            (it) =>
              (idVal && String(it.itemId) === idVal) ||
              (codeVal && (it.item?.itemCode === codeVal || it.item?.itemCode?.toLowerCase() === codeVal.toLowerCase())) ||
              (barcodeVal && it.item?.barcode && String(it.item.barcode) === barcodeVal)
          )
          if (!item || Number.isNaN(goodVal)) {
            failed++
            continue
          }
          nextGood[item.id] = toInputNum(goodVal)
          if (idxDamaged >= 0 && !Number.isNaN(damagedVal)) nextDamaged[item.id] = toInputNum(damagedVal)
          matched++
        }

        setGoodMap(nextGood)
        setDamagedMap(nextDamaged)
        setImportMsg({
          ok: true,
          text: `تم استيراد ${matched} صنف${failed > 0 ? ` — ${failed} صف لم يُطابق` : ''}. راجع الأرقام ثم اضغط «حفظ الكل».`,
        })
      } catch (err) {
        setImportMsg({ ok: false, text: 'تعذر قراءة الملف: ' + extractError(err) })
      }
    }
    reader.readAsText(file)
  }

  const lineTotalDiff = (it: InventoryCountItem): number =>
    toNum(goodMap[it.id]) + toNum(damagedMap[it.id] ?? 0) - toNum(it.systemQty)

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">جرد المخزون</h1>
          <p className="text-sm text-slate-500">مطابقة الكميات الفعلية (صالح + تالف) مع الكميات النظامية</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ جرد جديد</button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل الجردات...</p>
      ) : counts.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد جردات بعد</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>المخزن</th>
                <th>الأصناف</th>
                <th>الحالة</th>
                <th>منفذ الجرد</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className={c.parentCountId ? 'bg-amber-50/50' : ''}>
                  <td className={`font-mono text-xs ${c.parentCountId ? 'text-amber-800' : ''}`}>
                    {c.parentCountId ? <span className="text-slate-400">↳ </span> : null}
                    {c.countNumber}
                  </td>
                  <td>{fmtDate(c.countDate)}</td>
                  <td>{c.warehouse?.name ?? `#${c.warehouseId}`}</td>
                  <td>{c.items?.length ?? 0}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[c.status] ?? ''}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td>
                    {c.poster?.fullName ?? c.creator?.fullName ?? (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => openCount(c.id)}
                        className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                      >
                        {c.status === 'posted' ? 'عرض' : 'إدخال/عرض'}
                      </button>
                      {c.status === 'posted' && (
                        <button
                          onClick={() => createCorrective(c)}
                          className="rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
                        >
                          🔄 جرد تصحيحي
                        </button>
                      )}
                      {c.status === 'draft' && (
                        <button
                          onClick={async () => {
                            if (!confirm(`هل أنت متأكد من حذف الجرد ${c.countNumber}؟`)) return
                            try {
                              await api.delete(`/inventory/counts/${c.id}`)
                              await loadAll()
                            } catch (err) {
                              setError(extractError(err))
                            }
                          }}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          🗑️ حذف
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

      {/* ===== إنشاء جرد ===== */}
      <Modal open={createOpen} title="جرد جديد" onClose={() => setCreateOpen(false)}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">المخزن *</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— اختر —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">التاريخ</label>
            <input type="date" className="input" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <label className="label">ملاحظات</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={handleCreate} disabled={saving} className="btn-primary flex-1">
            {saving ? 'جارٍ الإنشاء...' : '💾 إنشاء الجرد'}
          </button>
          <button onClick={() => setCreateOpen(false)} className="btn-secondary flex-1">إلغاء</button>
        </div>
      </Modal>

      {/* ===== تفاصيل الجرد ===== */}
      <Modal open={viewCount !== null} title="تفاصيل الجرد" onClose={() => setViewCount(null)} wide>
        {viewLoading ? (
          <p className="py-6 text-center text-slate-400">جارٍ التحميل...</p>
        ) : viewCount ? (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-lg font-bold text-slate-800">{viewCount.countNumber}</p>
                <p className="text-xs text-slate-500">
                  {fmtDate(viewCount.countDate)} — {viewCount.warehouse?.name ?? `#${viewCount.warehouseId}`}
                </p>
                {viewCount.parentCount && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    ↳ جرد تصحيحي لـ {viewCount.parentCount.countNumber}
                  </p>
                )}
                {viewCount.notes && <p className="mt-1 text-xs text-slate-500">ملاحظات: {viewCount.notes}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  منشئ: {viewCount.creator?.fullName ?? '—'}
                  {viewCount.poster ? ` · منفذ: ${viewCount.poster.fullName}` : ''}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[viewCount.status] ?? ''}`}>
                {STATUS_LABEL[viewCount.status] ?? viewCount.status}
              </span>
            </div>

            {viewCount.status !== 'posted' && (
              <div className="mb-3 grid gap-2 md:grid-cols-3">
                <div>
                  <label className="label">📷 مسح الباركود / كود الصنف (Enter)</label>
                  <input
                    ref={barcodeRef}
                    key={`scan-${viewCount.id}-${scanKey}`}
                    autoFocus
                    type="text"
                    className="input"
                    placeholder="امسح الباركود أو أدخل الكود ثم Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        scanMatch((e.target as HTMLInputElement).value)
                        ;(e.target as HTMLInputElement).value = ''
                      }
                    }}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button onClick={() => fileRef.current?.click()} className="btn-secondary flex-1">
                    📥 استيراد CSV
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) onImportFile(f)
                      e.target.value = ''
                    }}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={autoFillSystemQty}
                    className="btn-secondary flex-1"
                    title="نسخ الكمية النظامية إلى المعدود (للأصناف غير المعدودة فقط)"
                  >
                    ✅ مطابقة الكل
                  </button>
                  <button
                    onClick={printCountSheet}
                    className="btn-secondary flex-1"
                    title="طباعة ورقة جرد للعمال"
                  >
                    🖨️ طباعة ورقة
                  </button>
                </div>
              </div>
            )}

            {importMsg && (
              <p
                className={`mb-3 rounded-lg px-3 py-2 text-sm ${
                  importMsg.ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {importMsg.text}
              </p>
            )}

            {/* ===== بحث + ملخص التقدم ===== */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                className="input flex-1 min-w-[200px]"
                placeholder="🔍 ابحث بالاسم أو الكود أو الباركود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {(viewCount.items ?? []).length > 0 && (() => {
                const items = viewCount.items ?? []
                const counted = items.filter(it => 
                  toNum(goodMap[it.id]) > 0 || toNum(damagedMap[it.id] ?? 0) > 0
                ).length
                const withDiff = items.filter(it => 
                  lineTotalDiff(it) !== 0
                ).length
                const totalDiffValue = items.reduce((sum, it) => 
                  sum + lineTotalDiff(it) * toNum(it.unitCost), 0
                )
                return (
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">الكل: {items.length}</span>
                    <span className="px-2 py-1 rounded bg-green-50 text-green-700">معدود: {counted}</span>
                    <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">بفرق: {withDiff}</span>
                    <span className={`px-2 py-1 rounded ${
                      totalDiffValue > 0 ? 'bg-green-50 text-green-700' : 
                      totalDiffValue < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'
                    }`}>
                      قيمة الفرق: {totalDiffValue > 0 ? '+' : ''}{fmtMoney(totalDiffValue)}
                    </span>
                  </div>
                )
              })()}
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th className="w-20">النظامي</th>
                    <th className="w-28">معدود صالح</th>
                    <th className="w-28">معدود تالف</th>
                    <th className="w-24">الفرق</th>
                    <th className="w-32">قيمة الفرق</th>
                  </tr>
                </thead>
<tbody>
                  {(viewCount.items ?? [])
                    .filter((it) => {
                      const s = search.toLowerCase().trim()
                      if (!s) return true
                      const name = it.item?.itemName?.toLowerCase() ?? ''
                      const code = it.item?.itemCode?.toLowerCase() ?? ''
                      const barcode = it.item?.barcode?.toLowerCase() ?? ''
                      return name.includes(s) || code.includes(s) || barcode.includes(s)
                    })
                    .map((it) => {
                      const totalDiff = lineTotalDiff(it)
                      const val = totalDiff * toNum(it.unitCost)
                      return (
                        <tr key={it.id} id={`count-row-${it.id}`}>
                          <td>
                            <div className="text-xs">{it.item?.itemName ?? `#${it.itemId}`}</div>
                            {it.item?.itemCode && (
                              <span className="font-mono text-[10px] text-slate-400">{it.item.itemCode}</span>
                            )}
                          </td>
                          <td className="text-xs">{fmt(it.systemQty)}</td>
                          <td>
                            <input
                              id={`count-good-${it.id}`}
                              type="number"
                              min={0}
                              disabled={viewCount.status === 'posted'}
                              className="input px-2 py-1"
                              value={goodMap[it.id] ?? ''}
                              onChange={(e) => setGoodMap((prev) => ({ ...prev, [it.id]: e.target.value }))}
                            />
                          </td>
                          <td>
                            <input
                              id={`count-damaged-${it.id}`}
                              type="number"
                              min={0}
                              disabled={viewCount.status === 'posted'}
                              className="input px-2 py-1"
                              value={damagedMap[it.id] ?? ''}
                              onChange={(e) => setDamagedMap((prev) => ({ ...prev, [it.id]: e.target.value }))}
                            />
                          </td>
                          <td
                            className={`text-xs font-semibold ${
                              totalDiff !== 0
                                ? totalDiff > 0
                                  ? 'text-green-700'
                                  : 'text-red-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {totalDiff !== 0 ? (totalDiff > 0 ? `+${fmt(totalDiff)}` : fmt(totalDiff)) : '—'}
                          </td>
                          <td className="text-xs">{totalDiff !== 0 ? fmtMoney(val) : '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {viewCount.status !== 'posted' && (
                <>
                  <button onClick={saveAll} disabled={saving} className="btn-primary flex-1">
                    {saving ? 'جارٍ الحفظ...' : '💾 حفظ الكل'}
                  </button>
                  <button onClick={postCount} disabled={saving} className="btn-secondary flex-1">
                    📌 ترحيل الجرد
                  </button>
                </>
              )}
              {viewCount.status === 'posted' && (
                <button onClick={() => setViewCount(null)} className="btn-secondary flex-1">إغلاق</button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}