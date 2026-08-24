import { useCallback, useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import type { Branch, Warehouse } from '@/types'

const WAREHOUSE_TYPES: Array<{ key: string; label: string }> = [
  { key: 'regular', label: 'عادي' },
  { key: 'central', label: 'مركزي' },
  { key: 'damaged', label: 'تالف' },
  { key: 'returned', label: 'مرتجعات' },
  { key: 'display', label: 'عرض' },
]

interface BranchForm {
  name: string
  code: string
  address: string
  phone: string
  isMain: boolean
}

interface WarehouseForm {
  name: string
  code: string
  branchId: number | null
  type: string
  address: string
}

const EMPTY_BRANCH: BranchForm = { name: '', code: '', address: '', phone: '', isMain: false }
const EMPTY_WAREHOUSE: WarehouseForm = { name: '', code: '', branchId: null, type: 'regular', address: '' }

export default function BranchesWarehouses() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const [branchModal, setBranchModal] = useState(false)
  const [branchForm, setBranchForm] = useState<BranchForm>(EMPTY_BRANCH)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [warehouseModal, setWarehouseModal] = useState(false)
  const [warehouseForm, setWarehouseForm] = useState<WarehouseForm>(EMPTY_WAREHOUSE)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [branchFilter, setBranchFilter] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [b, w] = await Promise.all([
        cachedRead<Branch[]>(`branches:list:${version}`, () =>
          api.get('/warehouses/branches').then((r) => r.data), 'branches'
        ),
        cachedRead<Warehouse[]>(`warehouses:list:${version}:${branchFilter}`, () =>
          api
            .get('/warehouses', { params: branchFilter ? { branchId: branchFilter } : {} })
            .then((r) => r.data), 'warehouses'
        ),
      ])
      setBranches(b.data)
      setWarehouses(w.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [version, branchFilter])

  useEffect(() => {
    load()
  }, [load])

  const refresh = () => setVersion((v) => v + 1)

  const openBranchModal = () => {
    setEditingBranch(null)
    setBranchForm(EMPTY_BRANCH)
    setFormError('')
    setBranchModal(true)
  }

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b)
    setBranchForm({
      name: b.name,
      code: b.code,
      address: b.address ?? '',
      phone: b.phone ?? '',
      isMain: !!b.isMain,
    })
    setFormError('')
    setBranchModal(true)
  }

  const handleSaveBranch = async () => {
    if (!branchForm.name.trim() || !branchForm.code.trim()) {
      setFormError('اسم الفرع وكوده مطلوبان')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const body = {
        name: branchForm.name.trim(),
        code: branchForm.code.trim(),
        address: branchForm.address,
        phone: branchForm.phone,
        isMain: branchForm.isMain,
      }
      if (editingBranch) {
        await offlineWrite<Branch>(
          `/warehouses/branches/${editingBranch.id}`,
          'PUT',
          body,
          { entity: 'branch', recordId: editingBranch.id }
        )
      } else {
        await offlineWrite<Branch>('/warehouses/branches', 'POST', body, { entity: 'branch' })
      }
      setBranchModal(false)
      refresh()
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteBranch = async (b: Branch) => {
    if (!window.confirm(`حذف الفرع «${b.name}»؟ ستُفك ربط مخازنه تلقائياً.`)) return
    try {
      await offlineWrite(`/warehouses/branches/${b.id}`, 'DELETE', undefined, { entity: 'branch', recordId: b.id })
      refresh()
    } catch (err) {
      setError(extractError(err))
    }
  }

  const openWarehouseModal = () => {
    setEditingWarehouse(null)
    setWarehouseForm(EMPTY_WAREHOUSE)
    setFormError('')
    setWarehouseModal(true)
  }

  const openEditWarehouse = (w: Warehouse) => {
    setEditingWarehouse(w)
    setWarehouseForm({
      name: w.name,
      code: w.code,
      branchId: w.branchId ?? null,
      type: w.type || 'regular',
      address: w.address ?? '',
    })
    setFormError('')
    setWarehouseModal(true)
  }

  const handleSaveWarehouse = async () => {
    if (!warehouseForm.name.trim() || !warehouseForm.code.trim()) {
      setFormError('اسم المخزن وكوده مطلوبان')
      return
    }
    if (!warehouseForm.branchId) {
      setFormError('يجب اختيار الفرع التابع له المخزن')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const body = {
        name: warehouseForm.name.trim(),
        code: warehouseForm.code.trim(),
        branchId: warehouseForm.branchId,
        type: warehouseForm.type,
        address: warehouseForm.address,
      }
      if (editingWarehouse) {
        await offlineWrite<Warehouse>(
          `/warehouses/${editingWarehouse.id}`,
          'PUT',
          body,
          { entity: 'warehouse', recordId: editingWarehouse.id }
        )
      } else {
        await offlineWrite<Warehouse>('/warehouses', 'POST', body, { entity: 'warehouse' })
      }
      setWarehouseModal(false)
      refresh()
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteWarehouse = async (w: Warehouse) => {
    if (!window.confirm(`حذف المخزن «${w.name}»؟`)) return
    try {
      await offlineWrite(`/warehouses/${w.id}`, 'DELETE', undefined, { entity: 'warehouse', recordId: w.id })
      refresh()
    } catch (err) {
      setError(extractError(err))
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">الفروع والمخازن</h1>
        <p className="text-sm text-slate-500">إدارة الفروع والمخازن التابعة للشركة</p>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل الفروع والمخازن...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">الفروع</h2>
              <button onClick={openBranchModal} className="btn-primary">+ فرع</button>
            </div>
            <div className="space-y-3">
              {branches.length === 0 ? (
                <p className="py-8 text-center text-slate-400">لا توجد فروع</p>
              ) : (
                branches.map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800">{b.name}</span>
                        <span className="ms-2 font-mono text-xs text-slate-400">{b.code}</span>
                        {b.isMain && (
                          <span className="ms-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">رئيسي</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {b.warehouses?.length ?? 0} مخزن
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <button onClick={() => openEditBranch(b)} className="btn-secondary !px-2 !py-1 text-xs">تعديل</button>
                      <button onClick={() => handleDeleteBranch(b)} className="btn-danger !px-2 !py-1 text-xs">حذف</button>
                    </div>
                    {(b.address || b.phone) && (
                      <div className="mt-1 text-xs text-slate-500">
                        {b.address && <span>{b.address}</span>}
                        {b.address && b.phone && <span className="mx-1">•</span>}
                        {b.phone && <span dir="ltr">{b.phone}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-800">المخازن</h2>
              <div className="flex items-center gap-2">
                <select
                  className="input w-auto"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">كل الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <button onClick={openWarehouseModal} className="btn-primary">+ مخزن</button>
              </div>
            </div>
            <div className="space-y-3">
              {warehouses.length === 0 ? (
                <p className="py-8 text-center text-slate-400">لا توجد مخازن</p>
              ) : (
                warehouses.map((w) => (
                  <div key={w.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800">{w.name}</span>
                        <span className="ms-2 font-mono text-xs text-slate-400">{w.code}</span>
                        <span className="ms-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                          {WAREHOUSE_TYPES.find((t) => t.key === w.type)?.label ?? w.type}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          w.branch
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {w.branch?.name ?? 'بدون فرع'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <button onClick={() => openEditWarehouse(w)} className="btn-secondary !px-2 !py-1 text-xs">تعديل</button>
                      <button onClick={() => handleDeleteWarehouse(w)} className="btn-danger !px-2 !py-1 text-xs">حذف</button>
                    </div>
                    {w.address && <div className="mt-1 text-xs text-slate-500">{w.address}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <Modal open={branchModal} title={editingBranch ? 'تعديل فرع' : 'إضافة فرع جديد'} onClose={() => setBranchModal(false)}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">اسم الفرع</label>
              <input className="input" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
            </div>
            <div>
              <label className="label">كود الفرع</label>
              <input className="input" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">العنوان</label>
              <input className="input" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
            </div>
            <div>
              <label className="label">الهاتف</label>
              <input className="input" dir="ltr" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={branchForm.isMain}
                  onChange={(e) => setBranchForm({ ...branchForm, isMain: e.target.checked })}
                />
                فرع رئيسي
              </label>
            </div>
          </div>

          {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={() => setBranchModal(false)} className="btn-secondary">إلغاء</button>
            <button onClick={handleSaveBranch} disabled={saving} className="btn-primary">
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={warehouseModal} title={editingWarehouse ? 'تعديل مخزن' : 'إضافة مخزن جديد'} onClose={() => setWarehouseModal(false)}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">اسم المخزن</label>
              <input className="input" value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} />
            </div>
            <div>
              <label className="label">كود المخزن</label>
              <input className="input" value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })} />
            </div>
            <div>
              <label className="label">الفرع <span className="text-red-500">*</span></label>
              <select
                className="input"
                value={warehouseForm.branchId ?? ''}
                onChange={(e) => setWarehouseForm({ ...warehouseForm, branchId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="" disabled>اختر الفرع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">النوع</label>
              <select
                className="input"
                value={warehouseForm.type}
                onChange={(e) => setWarehouseForm({ ...warehouseForm, type: e.target.value })}
              >
                {WAREHOUSE_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">العنوان</label>
              <input className="input" value={warehouseForm.address} onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })} />
            </div>
          </div>

          {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={() => setWarehouseModal(false)} className="btn-secondary">إلغاء</button>
            <button onClick={handleSaveWarehouse} disabled={saving} className="btn-primary">
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
