import { useCallback, useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmtDate } from '@/lib/format'
import { buildRolePermissions } from '../../../shared/constants'
import type { Branch, Permission, SystemUser } from '@/types'

const ROLE_LABEL: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'مدير',
  accountant: 'محاسب',
  cashier: 'أمين صندوق',
  viewer: 'مشاهد',
}

const MODULES: Array<{ key: string; label: string }> = [
  { key: 'items', label: 'الأصناف' },
  { key: 'accounts', label: 'الحسابات' },
  { key: 'parties', label: 'الأطراف' },
  { key: 'purchases', label: 'المشتريات' },
  { key: 'sales', label: 'المبيعات' },
  { key: 'treasury', label: 'الخزينة' },
  { key: 'journal', label: 'دفتر اليومية' },
  { key: 'reports', label: 'التقارير' },
  { key: 'warehouses', label: 'المخازن' },
  { key: 'transfers', label: 'التحويلات' },
  { key: 'inventory', label: 'المخزون' },
  { key: 'warranty', label: 'الضمان' },
  { key: 'rma', label: 'الصيانة' },
  { key: 'settings', label: 'الإعدادات' },
  { key: 'users', label: 'المستخدمون' },
]

const PERM_KEYS: Array<{ key: 'canView' | 'canAdd' | 'canEdit' | 'canDelete' | 'canPrint'; label: string }> = [
  { key: 'canView', label: 'عرض' },
  { key: 'canAdd', label: 'إضافة' },
  { key: 'canEdit', label: 'تعديل' },
  { key: 'canDelete', label: 'حذف' },
  { key: 'canPrint', label: 'طباعة' },
]

interface NewUserForm {
  username: string
  password: string
  fullName: string
  email: string
  phone: string
  role: string
  branchId: number | null
  isActive: boolean
  permissions: Permission[]
}

const EMPTY_NEW_USER: NewUserForm = {
  username: '',
  password: '',
  fullName: '',
  email: '',
  phone: '',
  role: 'cashier',
  branchId: null,
  isActive: true,
  permissions: buildRolePermissions('cashier'),
}

export default function UsersSettings() {
  const [users, setUsers] = useState<SystemUser[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState<SystemUser | null>(null)
  const [form, setForm] = useState<SystemUser | null>(null)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState<NewUserForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .get('/warehouses/branches')
      .then((r) => {
        if (!cancelled) setBranches(r.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await cachedRead<SystemUser[]>(`users:list:${version}`, () =>
        api.get('/settings/users').then((r) => r.data), 'settings'
      )
      setUsers(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    load()
  }, [load])

  const openEdit = (u: SystemUser) => {
    const existing = new Map(u.permissions.map((p) => [p.module, p]))
    const perms: Permission[] = MODULES.map((m) => {
      const p = existing.get(m.key)
      return {
        module: m.key,
        canView: p?.canView ?? false,
        canAdd: p?.canAdd ?? false,
        canEdit: p?.canEdit ?? false,
        canDelete: p?.canDelete ?? false,
        canPrint: p?.canPrint ?? false,
      }
    })
    setForm({ ...u, permissions: perms })
    setFormError('')
    setEditing(u)
  }

  const setPerm = (module: string, key: keyof Permission, value: boolean) => {
    if (!form) return
    setForm({
      ...form,
      permissions: form.permissions.map((p) => (p.module === module ? { ...p, [key]: value } : p)),
    })
  }

  const setPermNew = (module: string, key: keyof Permission, value: boolean) => {
    if (!newForm) return
    setNewForm({
      ...newForm,
      permissions: newForm.permissions.map((p) => (p.module === module ? { ...p, [key]: value } : p)),
    })
  }

  // تغيير الدور يعيد تعبئة جدول الصلاحيات اليدوي بالافتراضي الخاص بالدور (ثم يبقى قابلاً للتخصيص)
  const applyRole = (role: string) => {
    setForm((prev) => (prev ? { ...prev, role, permissions: buildRolePermissions(role) } : prev))
  }

  const applyRoleNew = (role: string) => {
    setNewForm((prev) => (prev ? { ...prev, role, permissions: buildRolePermissions(role) } : prev))
  }

  const openCreate = () => {
    setNewForm({ ...EMPTY_NEW_USER, permissions: buildRolePermissions(EMPTY_NEW_USER.role) })
    setFormError('')
    setCreating(true)
  }

  const handleCreate = async () => {
    if (!newForm) return
    if (!newForm.username.trim() || !newForm.password || !newForm.fullName.trim()) {
      setFormError('اسم المستخدم وكلمة المرور والاسم الكامل مطلوبة')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await api.post('/settings/users', {
        username: newForm.username.trim(),
        password: newForm.password,
        fullName: newForm.fullName.trim(),
        email: newForm.email,
        phone: newForm.phone,
        role: newForm.role,
        branchId: newForm.branchId,
        isActive: newForm.isActive,
        permissions: newForm.permissions,
      })
      setCreating(false)
      setNewForm(null)
      setVersion((v) => v + 1)
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setFormError('')
    try {
      await offlineWrite<SystemUser>(
        `/settings/users/${editing!.id}`,
        'PUT',
        {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          role: form.role,
          branchId: form.branchId,
          isActive: form.isActive,
          permissions: form.permissions,
        },
        { entity: 'user', recordId: editing!.id }
      )
      setEditing(null)
      setForm(null)
      setVersion((v) => v + 1)
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">المستخدمون والصلاحيات</h1>
          <p className="text-sm text-slate-500">إدارة الأدوار والأفرع وصلاحيات الوحدات</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ مستخدم</button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل المستخدمين...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>اسم الدخول</th>
                <th>الدور</th>
                <th>الفرع</th>
                <th>الحالة</th>
                <th>آخر دخول</th>
                <th className="text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">لا يوجد مستخدمون</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td>
                      <div className="font-medium text-slate-800">{u.fullName}</div>
                      {u.email && <div className="text-xs text-slate-400">{u.email}</div>}
                    </td>
                    <td className="font-mono text-xs">{u.username}</td>
                    <td>
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </td>
                    <td>{u.branch?.name ?? '—'}</td>
                    <td>
                      {u.isActive ? (
                        <span className="text-xs font-bold text-emerald-600">نشط</span>
                      ) : (
                        <span className="text-xs font-bold text-red-500">معطّل</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</td>
                    <td className="text-right">
                      <button
                        onClick={() => openEdit(u)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="تعديل"
                      >
                        ✏️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} title={`تعديل المستخدم ${form?.fullName ?? ''}`} onClose={() => setEditing(null)} wide>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="label">الاسم الكامل</label>
                <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div>
                <label className="label">الدور</label>
                <select className="input" value={form.role} onChange={(e) => applyRole(e.target.value)}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">الفرع</label>
                <select
                  className="input"
                  value={form.branchId ?? ''}
                  onChange={(e) => setForm({ ...form, branchId: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— الكل —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.isActive ?? true}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  مستخدم نشط
                </label>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="table">
                <thead>
                  <tr>
                    <th>الوحدة</th>
                    {PERM_KEYS.map((p) => (
                      <th key={p.key} className="text-center">{p.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.permissions.map((p) => (
                    <tr key={p.module} className="hover:bg-slate-50">
                      <td>{MODULES.find((m) => m.key === p.module)?.label ?? p.module}</td>
                      {PERM_KEYS.map((k) => (
                        <td key={k.key} className="text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={p[k.key]}
                            onChange={(e) => setPerm(p.module, k.key, e.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={creating} title="إضافة مستخدم جديد" onClose={() => setCreating(false)} wide>
        {newForm && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="label">الاسم الكامل <span className="text-red-500">*</span></label>
                <input className="input" value={newForm.fullName} onChange={(e) => setNewForm({ ...newForm, fullName: e.target.value })} />
              </div>
              <div>
                <label className="label">اسم الدخول <span className="text-red-500">*</span></label>
                <input className="input" dir="ltr" value={newForm.username} onChange={(e) => setNewForm({ ...newForm, username: e.target.value })} />
              </div>
              <div>
                <label className="label">كلمة المرور <span className="text-red-500">*</span></label>
                <input className="input" dir="ltr" type="password" value={newForm.password} onChange={(e) => setNewForm({ ...newForm, password: e.target.value })} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={newForm.isActive}
                    onChange={(e) => setNewForm({ ...newForm, isActive: e.target.checked })}
                  />
                  مستخدم نشط
                </label>
              </div>
              <div>
                <label className="label">الدور</label>
                <select className="input" value={newForm.role} onChange={(e) => applyRoleNew(e.target.value)}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">الفرع</label>
                <select
                  className="input"
                  value={newForm.branchId ?? ''}
                  onChange={(e) => setNewForm({ ...newForm, branchId: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— الكل —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">البريد الإلكتروني</label>
                <input className="input" dir="ltr" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} />
              </div>
              <div>
                <label className="label">الهاتف</label>
                <input className="input" dir="ltr" value={newForm.phone} onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} />
              </div>
            </div>

            <p className="text-xs text-slate-500">
              تغيير الدور يعيد تعبئة جدول الصلاحيات أدناه بالافتراضي الخاص به — يمكنك تخصيصها يدوياً بعد ذلك.
            </p>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="table">
                <thead>
                  <tr>
                    <th>الوحدة</th>
                    {PERM_KEYS.map((p) => (
                      <th key={p.key} className="text-center">{p.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {newForm.permissions.map((p) => (
                    <tr key={p.module} className="hover:bg-slate-50">
                      <td>{MODULES.find((m) => m.key === p.module)?.label ?? p.module}</td>
                      {PERM_KEYS.map((k) => (
                        <td key={k.key} className="text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={p[k.key]}
                            onChange={(e) => setPermNew(p.module, k.key, e.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary">
                {saving ? 'جارٍ الحفظ...' : 'إضافة المستخدم'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
