import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import Pagination, { DEFAULT_PAGE_SIZE, usePaginate } from '@/components/Pagination'
import CatalogSettings from '@/components/CatalogSettings'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmt, fmtMoney, toNum } from '@/lib/format'
import type { Attribute, Brand, Category, Item, ItemsResponse, Unit, Warehouse } from '@/types'

interface FormState {
  itemCode: string
  itemName: string
  barcode: string
  modelNumber: string
  categoryId: string
  brandId: string
  unitId: string
  purchasePrice: string
  purchasePriceUsd: string
  salePrice: string
  wholesalePrice: string
  openingStock: string
  minStock: string
  reorderLevel: string
  location: string
  trackSerial: boolean
  isService: boolean
  taxRate: string
  description: string
  attributes: Record<number, string>
}

const EMPTY_FORM: FormState = {
  itemCode: '',
  itemName: '',
  barcode: '',
  modelNumber: '',
  categoryId: '',
  brandId: '',
  unitId: '',
  purchasePrice: '',
  purchasePriceUsd: '',
  salePrice: '',
  wholesalePrice: '',
  openingStock: '',
  minStock: '',
  reorderLevel: '',
  location: '',
  trackSerial: false,
  isService: false,
  taxRate: '',
  description: '',
  attributes: {},
}

export default function Items() {
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [minStockOnly, setMinStockOnly] = useState(false)
  const [hideNoStock, setHideNoStock] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [offlineNote, setOfflineNote] = useState('')
  const [damagedOpen, setDamagedOpen] = useState(false)
  const [damagedItem, setDamagedItem] = useState<Item | null>(null)
  const [damagedWarehouse, setDamagedWarehouse] = useState('')
  const [damagedQty, setDamagedQty] = useState('')
  const [damagedSaving, setDamagedSaving] = useState(false)

  const loadMeta = useCallback(async () => {
    try {
      const [c, b, u, a, w] = await Promise.all([
        api.get<Category[]>('/settings/categories'),
        api.get<Brand[]>('/settings/brands'),
        api.get<Unit[]>('/settings/units'),
        api.get<Attribute[]>('/settings/attributes'),
        cachedRead<Warehouse[]>('warehouses:list', () => api.get('/warehouses').then((r) => r.data), 'warehouses'
        ),
      ])
      setCategories(c.data)
      setBrands(b.data)
      setUnits(u.data)
      setAttributes(a.data)
      setWarehouses(w.data ?? [])
    } catch {
      // تُترك القوائم فارغة عند عدم الاتصال
    }
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await cachedRead<ItemsResponse>('items:list', () =>
        api.get<ItemsResponse>('/items?limit=99999').then((r) => r.data), 'inventory'
      )
      setItems(res.data.items ?? [])
      setFromCache(res.fromCache)
      if (res.fromCache) setOfflineNote('عرض نسخة مخزنة — قد تكون البيانات غير محدّثة')
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
    loadMeta()
  }, [loadItems, loadMeta])

  // الكمية الصالحة: الإجمالي − التالف، أو لِمخزن محدد عند تفعيل الفلتر
  const validStockOf = useCallback((it: Item) => {
    if (warehouseFilter) {
      const s = it.stock?.find((x) => x.warehouseId === Number(warehouseFilter))
      if (!s) return 0
      return toNum(s.quantity) - toNum(s.damagedStock)
    }
    return toNum(it.currentStock) - toNum(it.damagedStock)
  }, [warehouseFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (q) {
        const haystack = [it.itemCode, it.itemName, it.barcode, it.modelNumber]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .join(' ')
        if (!haystack.includes(q)) return false
      }
      if (catFilter && String(it.categoryId ?? '') !== catFilter) return false
      if (brandFilter && String(it.brandId ?? '') !== brandFilter) return false
      if (minStockOnly && toNum(it.currentStock) - toNum(it.damagedStock) > toNum(it.minStock)) return false
      if (hideNoStock && validStockOf(it) <= 0) return false
      return true
    })
  }, [items, search, catFilter, brandFilter, warehouseFilter, minStockOnly, hideNoStock, validStockOf])

  const { paginated, total } = usePaginate(filtered, limit, page)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (item: Item) => {
    setEditing(item)
    const attrs: Record<number, string> = {}
    for (const a of item.attributes ?? []) {
      if (a.attributeId) attrs[a.attributeId] = a.value
    }
    setForm({
      itemCode: item.itemCode ?? '',
      itemName: item.itemName ?? '',
      barcode: item.barcode ?? '',
      modelNumber: item.modelNumber ?? '',
      categoryId: item.categoryId ? String(item.categoryId) : '',
      brandId: item.brandId ? String(item.brandId) : '',
      unitId: item.unitId ? String(item.unitId) : '',
      purchasePrice: item.purchasePrice ? String(toNum(item.purchasePrice)) : '',
      purchasePriceUsd: item.purchasePriceUsd ? String(toNum(item.purchasePriceUsd)) : '',
      salePrice: item.salePrice ? String(toNum(item.salePrice)) : '',
      wholesalePrice: item.wholesalePrice ? String(toNum(item.wholesalePrice)) : '',
      openingStock: '',
      minStock: item.minStock ? String(toNum(item.minStock)) : '',
      reorderLevel: item.reorderLevel ? String(toNum(item.reorderLevel)) : '',
      location: item.location ?? '',
      trackSerial: item.trackSerial ?? false,
      isService: item.isService ?? false,
      taxRate: item.taxRate ? String(toNum(item.taxRate)) : '',
      description: item.description ?? '',
      attributes: attrs,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.itemName.trim()) {
      setError('اسم الصنف مطلوب')
      return
    }
    setSaving(true)
    setError('')
    const attributesPayload = Object.entries(form.attributes)
      .filter(([, v]) => v.trim())
      .map(([id, v]) => ({ attributeId: Number(id), value: v.trim() }))

    const body: Record<string, unknown> = {
      itemName: form.itemName.trim(),
      barcode: form.barcode.trim() || undefined,
      modelNumber: form.modelNumber.trim() || undefined,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      brandId: form.brandId ? Number(form.brandId) : undefined,
      unitId: form.unitId ? Number(form.unitId) : undefined,
      purchasePrice: toNum(form.purchasePrice),
      purchasePriceUsd: toNum(form.purchasePriceUsd),
      salePrice: toNum(form.salePrice),
      wholesalePrice: toNum(form.wholesalePrice),
      minStock: toNum(form.minStock),
      reorderLevel: toNum(form.reorderLevel),
      location: form.location.trim() || undefined,
      trackSerial: form.trackSerial,
      isService: form.isService,
      taxRate: toNum(form.taxRate),
      description: form.description.trim() || undefined,
      attributes: attributesPayload.length ? attributesPayload : undefined,
    }
    if (!editing) body.openingStock = toNum(form.openingStock)

    try {
      const res = await offlineWrite<Item>(
        editing ? `/items/${editing.id}` : '/items',
        editing ? 'PUT' : 'POST',
        body,
        { entity: 'item', recordId: editing?.id }
      )
      setOfflineNote('queued' in res ? 'لم يتوفر اتصال — تم حفظ العملية محلياً وستتم مزامنتها لاحقاً' : '')
      setFormOpen(false)
      await loadItems()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: Item) => {
    if (!window.confirm(`حذف الصنف «${item.itemName}»؟`)) return
    try {
      await offlineWrite(`/items/${item.id}`, 'DELETE', undefined, { entity: 'item', recordId: item.id })
      await loadItems()
    } catch (err) {
      setError(extractError(err))
    }
  }

  const genBarcode = async (item: Item) => {
    try {
      await api.post(`/items/${item.id}/generate-barcode`)
      await loadItems()
    } catch (err) {
      setError(extractError(err))
    }
  }

  const toggleActive = async (item: Item, isActive: boolean) => {
    try {
      await offlineWrite(`/items/${item.id}`, 'PUT', { isActive }, { entity: 'item', recordId: item.id })
      await loadItems()
    } catch (err) {
      setError(extractError(err))
    }
  }

  const openDamaged = (item: Item) => {
    setDamagedItem(item)
    setDamagedWarehouse('')
    setDamagedQty('')
    setDamagedOpen(true)
  }

  const handleDamagedSubmit = async () => {
    if (!damagedItem) return
    if (!damagedWarehouse) {
      setError('المخزن مطلوب')
      return
    }
    const qty = toNum(damagedQty)
    if (!qty || qty <= 0) {
      setError('الكمية يجب أن تكون أكبر من صفر')
      return
    }
    setDamagedSaving(true)
    setError('')
    try {
      await offlineWrite(
        `/items/${damagedItem.id}/damaged`,
        'POST',
        { movementType: 'damaged', itemId: damagedItem.id, warehouseId: Number(damagedWarehouse), quantity: qty },
        { entity: 'stockMovement', recordId: damagedItem.id }
      )
      setDamagedOpen(false)
      await loadItems()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setDamagedSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">الأصناف</h1>
          <p className="text-sm text-slate-500">إدارة كتالوج الأصناف والمنتجات</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSettingsOpen(true)} className="btn-secondary">⚙️ إعدادات</button>
          <button onClick={openCreate} className="btn-primary">+ صنف جديد</button>
        </div>
      </div>

      {offlineNote && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">📴 {offlineNote}</p>
      )}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <input
          className="input"
          placeholder="🔍 بحث بالاسم / الكود / الباركود"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select className="input" value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1) }}>
          <option value="">كل الفئات</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input" value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setPage(1) }}>
          <option value="">كل الماركات</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select className="input" value={warehouseFilter} onChange={(e) => { setWarehouseFilter(e.target.value); setPage(1) }}>
          <option value="">كل المخازن</option>
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>{wh.name}</option>
          ))}
        </select>
        <button
          onClick={() => { setMinStockOnly((v) => !v); setPage(1) }}
          className={`text-sm font-medium rounded-lg border px-3 py-2 transition-colors ${
            minStockOnly
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {minStockOnly ? '✓ ' : ''}المخزون المنخفض
        </button>
        <button
          onClick={() => { setHideNoStock((v) => !v); setPage(1) }}
          className={`text-sm font-medium rounded-lg border px-3 py-2 transition-colors ${
            hideNoStock
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {hideNoStock ? '✓ ' : ''}إخفاء غير المتوفر
        </button>
      </div>
      <div className="mb-4 flex items-center justify-end text-sm text-slate-500">
        {fromCache ? `📴 مخزّن — ${total} صنف` : `${total} صنف`}
      </div>

      {loading ? (
        <p className="py-10 text-center text-slate-400">جارٍ التحميل...</p>
      ) : paginated.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد أصناف مطابقة</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الكود</th>
                <th>الاسم</th>
                <th>الباركود</th>
                <th>الفئة</th>
                <th>الماركة</th>
                <th>متوسط التكلفة</th>
                <th>سعر الجملة</th>
                <th>سعر البيع</th>
                <th>المخزون</th>
                <th>تفعيل</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((it) => {
                const prod = validStockOf(it)
                return (
                  <tr key={it.id}>
                    <td className="font-mono text-xs">{it.itemCode}</td>
                    <td className="font-medium text-slate-800">{it.itemName}</td>
                    <td className="font-mono text-xs">{it.barcode || '—'}</td>
                    <td>{it.category?.name ?? '—'}</td>
                    <td>{it.brand?.name ?? '—'}</td>
                    <td className="text-slate-600">{fmtMoney(it.costPrice)}</td>
                    <td className="bg-emerald-50 font-bold text-emerald-800">{fmtMoney(it.wholesalePrice)}</td>
                    <td>{fmtMoney(it.salePrice)}</td>
                    <td>
                      <span
                        className={
                          prod <= toNum(it.minStock)
                            ? 'font-semibold text-red-600'
                            : 'text-slate-700'
                        }
                      >
                        {fmt(prod)}
                      </span>
                      {toNum(it.damagedStock) > 0 && (
                        <span className="mr-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                          تالف {fmt(it.damagedStock)}
                        </span>
                      )}
                    </td>
                    <td>
                      <select
                        className="input py-1"
                        value={it.isActive === false ? 'off' : 'on'}
                        onChange={(e) => toggleActive(it, e.target.value === 'on')}
                        disabled={it.isService}
                        title={it.isService ? 'غير قابل للتفعيل' : 'إظهار/إخفاء في المبيعات'}
                      >
                        <option value="on">مفعّل</option>
                        <option value="off">معطّل</option>
                      </select>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(it)}
                          className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                          title="تعديل"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => openDamaged(it)}
                          className="rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50"
                          title="تسجيل تالف"
                        >
                          ⚠️
                        </button>
                        <button
                          onClick={() => genBarcode(it)}
                          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                          title="توليد باركود"
                        >
                          🔖
                        </button>
                        <button
                          onClick={() => handleDelete(it)}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          title="حذف"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      )}

      <CatalogSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} onChanged={loadMeta} />

      <Modal open={formOpen} title={editing ? `تعديل الصنف ${editing.itemCode}` : 'صنف جديد'} onClose={() => setFormOpen(false)} wide>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="label">الكود</label>
            <input
              className="input bg-gray-50 text-gray-500"
              value={editing ? editing.itemCode : 'تلقائي — يُولَّد تلقائياً عند الحفظ'}
              disabled
              readOnly
            />
          </div>
          <div className="col-span-2">
            <label className="label">الاسم *</label>
            <input className="input" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
          </div>
          <div>
            <label className="label">الباركود</label>
            <input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </div>
          <div>
            <label className="label">رقم الموديل</label>
            <input className="input" value={form.modelNumber} onChange={(e) => setForm({ ...form, modelNumber: e.target.value })} />
          </div>
          <div>
            <label className="label">الفئة</label>
            <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">الماركة</label>
            <select className="input" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
              <option value="">—</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">الوحدة</label>
            <select className="input" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">سعر الشراء (LYD)</label>
            <input type="number" className="input" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
          </div>
          <div>
            <label className="label">سعر الشراء (USD)</label>
            <input type="number" className="input" value={form.purchasePriceUsd} onChange={(e) => setForm({ ...form, purchasePriceUsd: e.target.value })} />
          </div>
          <div>
            <label className="label">سعر البيع</label>
            <input type="number" className="input" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
          </div>
          <div>
            <label className="label">سعر الجملة</label>
            <input type="number" className="input" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} />
          </div>
          {!editing && (
            <div>
              <label className="label">المخزون الافتتاحي</label>
              <input type="number" className="input" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: e.target.value })} />
            </div>
          )}
          <div>
            <label className="label">الحد الأدنى</label>
            <input type="number" className="input" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
          </div>
          <div>
            <label className="label">نقطة إعادة الطلب</label>
            <input type="number" className="input" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
          </div>
          <div>
            <label className="label">الموقع</label>
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div>
            <label className="label">الضريبة %</label>
            <input type="number" className="input" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
          </div>
        </div>

        <div className="mt-3 flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.trackSerial} onChange={(e) => setForm({ ...form, trackSerial: e.target.checked })} />
            تتبع سيريال/IMEI
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isService} onChange={(e) => setForm({ ...form, isService: e.target.checked })} />
            خدمة (ليس مخزوناً)
          </label>
        </div>

        {attributes.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-bold text-slate-700">الخصائص</h4>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {attributes.map((a) => (
                <div key={a.id}>
                  <label className="label">{a.name}</label>
                  {a.type === 'select' ? (
                    <select
                      className="input"
                      value={form.attributes[a.id] ?? ''}
                      onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [a.id]: e.target.value } })}
                    >
                      <option value="">—</option>
                      {(typeof a.options === 'string' ? JSON.parse(a.options) : a.options ?? []).map((o: string) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      value={form.attributes[a.id] ?? ''}
                      onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [a.id]: e.target.value } })}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">الوصف</label>
          <textarea
            className="input min-h-[60px]"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إنشاء الصنف'}
          </button>
          <button onClick={() => setFormOpen(false)} className="btn-secondary flex-1">إلغاء</button>
        </div>
      </Modal>
    <Modal open={damagedOpen} title={`تسجيل تالف — ${damagedItem?.itemName ?? ''}`} onClose={() => setDamagedOpen(false)}>
        <p className="mb-3 text-sm text-slate-500">
          تحويل وحدات صالحة إلى تالفة (الكلفة تبقى ضمن المخزون — تُمتص في متوسط التكلفة عند الشراء القادم)
        </p>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">المخزن *</label>
            <select
              className="input"
              value={damagedWarehouse}
              onChange={(e) => setDamagedWarehouse(e.target.value)}
            >
              <option value="">— اختر المخزن —</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>{wh.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">الكمية التالفة *</label>
            <input
              type="number"
              min="0"
              className="input"
              value={damagedQty}
              onChange={(e) => setDamagedQty(e.target.value)}
            />
          </div>
          {damagedItem && warehouseFilter && (
            <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              الصالح في المخزن المحدد: {fmt(validStockOf(damagedItem))}
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={handleDamagedSubmit} disabled={damagedSaving} className="btn-primary flex-1">
            {damagedSaving ? 'جارٍ الحفظ...' : 'تسجيل التالف'}
          </button>
          <button onClick={() => setDamagedOpen(false)} className="btn-secondary flex-1">إلغاء</button>
        </div>
      </Modal>
    </div>
  )
}
