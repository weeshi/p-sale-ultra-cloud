import { useCallback, useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { offlineWrite } from '@/lib/offline'
import type { Attribute, Brand, Category, Unit } from '@/types'

type Tab = 'categories' | 'brands' | 'units' | 'attributes'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'categories', label: 'الفئات' },
  { key: 'brands', label: 'الماركات' },
  { key: 'units', label: 'الوحدات' },
  { key: 'attributes', label: 'الخصائص' },
]

export default function CatalogSettings({
  open,
  onClose,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [tab, setTab] = useState<Tab>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [c, b, u, a] = await Promise.all([
        api.get<Category[]>('/settings/categories'),
        api.get<Brand[]>('/settings/brands'),
        api.get<Unit[]>('/settings/units'),
        api.get<Attribute[]>('/settings/attributes'),
      ])
      setCategories(c.data)
      setBrands(b.data)
      setUnits(u.data)
      setAttributes(a.data)
    } catch (err) {
      setError(extractError(err))
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const submit = async (endpoint: string, body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      await offlineWrite(endpoint, 'POST', body, { entity: endpoint.split('/').pop()! })
      await load()
      onChanged()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const renderForm = () => {
    switch (tab) {
      case 'categories':
        return (
          <CategoryForm
            onSubmit={(body) => submit('/settings/categories', body)}
            parents={categories.filter((c) => !c.parentId)}
          />
        )
      case 'brands':
        return <BrandForm onSubmit={(body) => submit('/settings/brands', body)} />
      case 'units':
        return <UnitForm onSubmit={(body) => submit('/settings/units', body)} />
      case 'attributes':
        return <AttributeForm onSubmit={(body) => submit('/settings/attributes', body)} />
    }
  }

  return (
    <Modal open={open} title="إعدادات الكتالوج" onClose={onClose} wide>
      <div className="mb-4 flex gap-2 border-b border-slate-100 pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {renderForm()}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <h4 className="mb-2 text-sm font-bold text-slate-700">القائمة الحالية</h4>
        <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
          {tab === 'categories' && (
            <ListRows rows={categories} render={(c) => c.name} count={(c) => c._count?.items ?? 0} />
          )}
          {tab === 'brands' && (
            <ListRows rows={brands} render={(b) => b.name} count={(b) => b.country ?? '—'} />
          )}
          {tab === 'units' && (
            <ListRows rows={units} render={(u) => u.name} count={(u) => u.shortName} />
          )}
          {tab === 'attributes' && (
            <ListRows rows={attributes} render={(a) => a.name} count={(a) => a.type} />
          )}
          {((tab === 'categories' && categories.length === 0) ||
            (tab === 'brands' && brands.length === 0) ||
            (tab === 'units' && units.length === 0) ||
            (tab === 'attributes' && attributes.length === 0)) && (
            <p className="p-3 text-sm text-slate-400">لا توجد عناصر بعد</p>
          )}
        </div>
      </div>

      {busy && <p className="mt-3 text-center text-sm text-slate-400">جارٍ الحفظ...</p>}
    </Modal>
  )
}

function ListRows<T extends { id: number }>({
  rows,
  render,
  count,
}: {
  rows: T[]
  render: (r: T) => string
  count: (r: T) => string | number
}) {
  if (rows.length === 0) return null
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="text-slate-700">{render(r)}</span>
          <span className="text-xs text-slate-400">{count(r)}</span>
        </li>
      ))}
    </ul>
  )
}

function CategoryForm({ onSubmit, parents }: { onSubmit: (b: Record<string, unknown>) => void; parents: Category[] }) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [icon, setIcon] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSubmit({ name: name.trim(), parentId: parentId ? Number(parentId) : undefined, icon: icon || undefined })
        setName('')
        setParentId('')
        setIcon('')
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">اسم الفئة *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">فئة أب</label>
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— بلا —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">أيقونة</label>
          <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📱" />
        </div>
      </div>
      <button type="submit" className="btn-primary">إضافة فئة</button>
    </form>
  )
}

function BrandForm({ onSubmit }: { onSubmit: (b: Record<string, unknown>) => void }) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSubmit({ name: name.trim(), country: country || undefined })
        setName('')
        setCountry('')
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">اسم الماركة *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">البلد</label>
          <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn-primary">إضافة ماركة</button>
    </form>
  )
}

function UnitForm({ onSubmit }: { onSubmit: (b: Record<string, unknown>) => void }) {
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSubmit({ name: name.trim(), shortName: shortName.trim() || name.trim() })
        setName('')
        setShortName('')
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">اسم الوحدة *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">الاختصار</label>
          <input className="input" value={shortName} onChange={(e) => setShortName(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn-primary">إضافة وحدة</button>
    </form>
  )
}

function AttributeForm({ onSubmit }: { onSubmit: (b: Record<string, unknown>) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('text')
  const [options, setOptions] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        const opts = options
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
        onSubmit({
          name: name.trim(),
          type,
          options: opts.length ? opts : undefined,
        })
        setName('')
        setType('text')
        setOptions('')
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">اسم الخاصية *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">النوع</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="text">نص</option>
            <option value="number">رقم</option>
            <option value="select">قائمة</option>
            <option value="multi-select">قائمة متعددة</option>
          </select>
        </div>
        <div>
          <label className="label">خيارات (مفصولة بفاصلة)</label>
          <input className="input" value={options} onChange={(e) => setOptions(e.target.value)} disabled={type === 'text' || type === 'number'} />
        </div>
      </div>
      <button type="submit" className="btn-primary">إضافة خاصية</button>
    </form>
  )
}
