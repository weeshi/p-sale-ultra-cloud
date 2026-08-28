import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import PartyProfile from '@/components/PartyProfile'
import Pagination, { DEFAULT_PAGE_SIZE, usePaginate } from '@/components/Pagination'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmtMoney, toNum } from '@/lib/format'
import { searchMatch, buildSearchHaystack } from '@/lib/search'
import type { PartiesResponse, Party } from '@/types'

interface FormState {
  partyCode: string
  partyName: string
  partyType: 'customer' | 'vendor'
  address: string
  phone: string
  mobile: string
  email: string
  whatsapp: string
  taxNumber: string
  creditLimit: string
  openingBalance: string
  notes: string
}

const EMPTY_FORM: FormState = {
  partyCode: '',
  partyName: '',
  partyType: 'customer',
  address: '',
  phone: '',
  mobile: '',
  email: '',
  whatsapp: '',
  taxNumber: '',
  creditLimit: '',
  openingBalance: '',
  notes: '',
}

export default function Parties() {
  const [parties, setParties] = useState<Party[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [offlineNote, setOfflineNote] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Party | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [profilePartyId, setProfilePartyId] = useState<number | null>(null)

  const loadParties = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await cachedRead<PartiesResponse>('parties:list', () =>
        api.get<PartiesResponse>('/parties?limit=99999').then((r) => r.data), 'parties'
      )
      setParties(res.data.parties ?? [])
      setFromCache(res.fromCache)
      if (res.fromCache) setOfflineNote('عرض نسخة مخزنة — قد تكون البيانات غير محدّثة')
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadParties()
  }, [loadParties])

  const filtered = useMemo(() => {
    const q = search.trim()
    return parties.filter((p) => {
      if (typeFilter && p.partyType !== typeFilter) return false
      if (q) {
        const haystack = buildSearchHaystack(p.partyCode, p.partyName, p.mobile, p.phone)
        if (!searchMatch(haystack, q)) return false
      }
      return true
    })
  }, [parties, search, typeFilter])

  const { paginated, total } = usePaginate(filtered, limit, page)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (p: Party) => {
    setEditing(p)
    setForm({
      partyCode: p.partyCode ?? '',
      partyName: p.partyName ?? '',
      partyType: p.partyType ?? 'customer',
      address: p.address ?? '',
      phone: p.phone ?? '',
      mobile: p.mobile ?? '',
      email: p.email ?? '',
      whatsapp: p.whatsapp ?? '',
      taxNumber: p.taxNumber ?? '',
      creditLimit: p.creditLimit ? String(toNum(p.creditLimit)) : '',
      openingBalance: '',
      notes: p.notes ?? '',
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.partyName.trim()) {
      setError('اسم الحساب مطلوب')
      return
    }
    setSaving(true)
    setError('')
    const body: Record<string, unknown> = {
      partyName: form.partyName.trim(),
      partyType: form.partyType,
      address: form.address.trim() || undefined,
      phone: form.phone.trim() || undefined,
      mobile: form.mobile.trim() || undefined,
      email: form.email.trim() || undefined,
      whatsapp: form.whatsapp.trim() || undefined,
      taxNumber: form.taxNumber.trim() || undefined,
      creditLimit: toNum(form.creditLimit),
      notes: form.notes.trim() || undefined,
    }
    if (!editing) body.openingBalance = toNum(form.openingBalance)

    try {
      const res = await offlineWrite<Party>(
        editing ? `/parties/${editing.id}` : '/parties',
        editing ? 'PUT' : 'POST',
        body,
        { entity: 'party', recordId: editing?.id }
      )
      setOfflineNote('queued' in res ? 'لم يتوفر اتصال — تم حفظ العملية محلياً وستتم مزامنتها لاحقاً' : '')
      setFormOpen(false)
      await loadParties()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Party) => {
    if (!window.confirm(`حذف الحساب «${p.partyName}»؟`)) return
    try {
      await offlineWrite(`/parties/${p.id}`, 'DELETE', undefined, { entity: 'party', recordId: p.id })
      await loadParties()
    } catch (err) {
      setError(extractError(err))
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">العملاء والموردون</h1>
          <p className="text-sm text-slate-500">إدارة حسابات العملاء والموردين</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ حساب جديد</button>
      </div>

      {offlineNote && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">📴 {offlineNote}</p>
      )}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <input
          className="input"
          placeholder="🔍 بحث بالاسم / الكود / الهاتف"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select className="input" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}>
          <option value="">الكل</option>
          <option value="customer">عملاء</option>
          <option value="vendor">موردون</option>
        </select>
        <div className="flex items-center justify-end text-sm text-slate-500">
          {fromCache ? '📴 مخزّن' : `${total} حساب`}
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-slate-400">جارٍ التحميل...</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد حسابات مطابقة</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الكود</th>
                <th>الاسم</th>
                <th>النوع</th>
                <th>الهاتف</th>
                <th>الجوال</th>
                <th>حد الائتمان</th>
                <th>الرصيد</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.partyCode}</td>
                  <td className="font-medium text-slate-800">{p.partyName}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        p.partyType === 'vendor' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {p.partyType === 'vendor' ? 'مورد' : 'عميل'}
                    </span>
                  </td>
                  <td dir="ltr">{p.phone || '—'}</td>
                  <td dir="ltr">{p.mobile || '—'}</td>
                  <td>{fmtMoney(p.creditLimit)}</td>
                  <td className={toNum(p.currentBalance) < 0 ? 'text-red-600' : 'text-slate-700'}>
                    {fmtMoney(p.currentBalance)}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setProfilePartyId(p.id)}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                        title="بروفايل"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                        title="تعديل"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        title="حذف"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      )}

      <Modal open={formOpen} title={editing ? `تعديل الحساب ${editing.partyCode}` : 'حساب جديد'} onClose={() => setFormOpen(false)} wide>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div>
            <label className="label">الكود</label>
            <input
              className="input bg-gray-50 text-gray-500"
              value={editing ? editing.partyCode : 'تلقائي — يُولَّد تلقائياً عند الحفظ'}
              disabled
              readOnly
            />
          </div>
          <div className="col-span-2">
            <label className="label">الاسم *</label>
            <input className="input" value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} />
          </div>
          <div>
            <label className="label">النوع</label>
            <select className="input" value={form.partyType} onChange={(e) => setForm({ ...form, partyType: e.target.value as 'customer' | 'vendor' })}>
              <option value="customer">عميل</option>
              <option value="vendor">مورد</option>
            </select>
          </div>
          <div>
            <label className="label">الهاتف</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">الجوال</label>
            <input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </div>
          <div>
            <label className="label">البريد</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">واتساب</label>
            <input className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </div>
          <div>
            <label className="label">الرقم الضريبي</label>
            <input className="input" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
          </div>
          <div>
            <label className="label">حد الائتمان</label>
            <input type="number" className="input" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
          </div>
          {!editing && (
            <div>
              <label className="label">الرصيد الافتتاحي</label>
              <input type="number" className="input" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
            </div>
          )}
          <div className="col-span-3">
            <label className="label">العنوان</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="col-span-3">
            <label className="label">ملاحظات</label>
            <textarea className="input min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إنشاء الحساب'}
          </button>
          <button onClick={() => setFormOpen(false)} className="btn-secondary flex-1">إلغاء</button>
        </div>
      </Modal>

      <PartyProfile partyId={profilePartyId} onClose={() => setProfilePartyId(null)} />
    </div>
  )
}
