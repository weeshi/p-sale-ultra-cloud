import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingTabs from '@/components/AccountingTabs'
import Modal from '@/components/Modal'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmtMoney } from '@/lib/format'
import { ACCOUNT_TYPE_LABEL } from '@/lib/accounting'
import type { Account } from '@/types'

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABEL)

interface AccountForm {
  accountCode: string
  accountName: string
  accountType: string
  parentId: number | null
  isTerminal: boolean
  openingBalance: number
}

const emptyForm = (): AccountForm => ({
  accountCode: '',
  accountName: '',
  accountType: 'asset',
  parentId: null,
  isTerminal: true,
  openingBalance: 0,
})

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<AccountForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await cachedRead<Account[]>(`accounts:tree:${version}`, () =>
        api.get('/accounts').then((r) => r.data), 'accounts'
      )
      setAccounts(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    load()
  }, [load])

  const tree = useMemo<Account[]>(() => {
    const byId = new Map(accounts.map((a) => [a.id, { ...a, children: [] as Account[] }]))
    const roots: Account[] = []
    for (const a of byId.values()) {
      if (a.parentId && byId.has(a.parentId)) byId.get(a.parentId)!.children!.push(a)
      else roots.push(a)
    }
    return roots.sort((a, b) => a.accountCode.localeCompare(b.accountCode, 'en'))
  }, [accounts])

  const parentOptions = useMemo<Array<{ id: number; label: string; depth: number }>>(() => {
    const opts: Array<{ id: number; label: string; depth: number }> = []
    const walk = (nodes: Account[], depth: number) => {
      for (const n of nodes) {
        opts.push({ id: n.id, label: n.accountName, depth })
        walk(n.children ?? [], depth + 1)
      }
    }
    walk(tree, 0)
    return opts
  }, [tree])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (acc: Account) => {
    setEditing(acc)
    setForm({
      accountCode: acc.accountCode,
      accountName: acc.accountName,
      accountType: acc.accountType ?? 'asset',
      parentId: acc.parentId ?? null,
      isTerminal: acc.isTerminal ?? true,
      openingBalance: Number(acc.openingBalance ?? 0),
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.accountCode.trim() || !form.accountName.trim()) {
      setFormError('كود الحساب واسم الحساب مطلوبان')
      return
    }
    if (editing && form.parentId === editing.id) {
      setFormError('لا يمكن جعل الحساب أباً لنفسه')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        await offlineWrite<Account>(
          `/accounts/${editing.id}`,
          'PUT',
          {
            accountCode: form.accountCode.trim(),
            accountName: form.accountName.trim(),
            accountType: form.accountType,
            parentId: form.parentId,
            isTerminal: form.isTerminal,
          },
          { entity: 'account', recordId: editing.id }
        )
      } else {
        await offlineWrite<Account>(
          '/accounts',
          'POST',
          {
            accountCode: form.accountCode.trim(),
            accountName: form.accountName.trim(),
            accountType: form.accountType,
            parentId: form.parentId,
            isTerminal: form.isTerminal,
            openingBalance: form.openingBalance || 0,
          },
          { entity: 'account' }
        )
      }
      setShowModal(false)
      setVersion((v) => v + 1)
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const renderNode = (acc: Account, depth: number) => (
    <tbody key={acc.id}>
      <tr className="hover:bg-slate-50">
        <td className="font-mono text-xs" style={{ paddingInlineStart: `${12 + depth * 22}px` }}>
          {depth > 0 ? '↳ ' : ''}
          {acc.accountCode}
        </td>
        <td>{acc.accountName}</td>
        <td>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {ACCOUNT_TYPE_LABEL[acc.accountType ?? ''] ?? acc.accountType}
          </span>
        </td>
        <td>{acc.isTerminal ? <span className="text-xs text-slate-400">نهائي</span> : <span className="text-xs text-slate-400">مجمع</span>}</td>
        <td className="font-semibold">{fmtMoney(Number(acc.currentBalance ?? 0))}</td>
        <td>
          <div className="flex justify-end gap-1">
            <Link
              to={`/accounting/accounts/${acc.id}/ledger`}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="دفتر الأستاذ"
            >
              📓
            </Link>
            <button onClick={() => openEdit(acc)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="تعديل">
              ✏️
            </button>
          </div>
        </td>
      </tr>
      {(acc.children ?? []).map((c) => renderNode(c, depth + 1))}
    </tbody>
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">دليل الحسابات</h1>
          <p className="text-sm text-slate-500">الشجرة المحاسبية للحسابات — إنشاء وتعديل</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          ＋ حساب جديد
        </button>
      </div>

      <AccountingTabs />

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل دليل الحسابات...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>الكود</th>
                <th>اسم الحساب</th>
                <th>النوع</th>
                <th>الطبيعة</th>
                <th>الرصيد</th>
                <th className="text-right">إجراءات</th>
              </tr>
            </thead>
            {tree.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    لا توجد حسابات بعد — أنشئ أول حساب
                  </td>
                </tr>
              </tbody>
            ) : (
              tree.map((acc) => renderNode(acc, 0))
            )}
          </table>
        </div>
      )}

      <Modal
        open={showModal}
        title={editing ? `تعديل حساب ${editing.accountCode}` : 'حساب جديد'}
        onClose={() => setShowModal(false)}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">كود الحساب</label>
              <input
                className="input"
                value={form.accountCode}
                onChange={(e) => setForm({ ...form, accountCode: e.target.value })}
                placeholder="مثال: 1101"
              />
            </div>
            <div>
              <label className="label">اسم الحساب</label>
              <input
                className="input"
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                placeholder="مثال: صندوق النقدية"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">النوع</label>
              <select
                className="input"
                value={form.accountType}
                onChange={(e) => setForm({ ...form, accountType: e.target.value })}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">الحساب الأب</label>
              <select
                className="input"
                value={form.parentId ?? ''}
                onChange={(e) => setForm({ ...form, parentId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— بدون (حساب رئيسي) —</option>
                {parentOptions
                  .filter((o) => o.id !== editing?.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {'‏'.repeat(o.depth * 2)}
                      {o.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">الرصيد الافتتاحي (إن وجد)</label>
              <input
                type="number"
                step="0.001"
                className="input"
                value={form.openingBalance}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.isTerminal}
                  onChange={(e) => setForm({ ...form, isTerminal: e.target.checked })}
                />
                حساب نهائي (يُقيَّد عليه مباشرة)
              </label>
            </div>
          </div>

          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowModal(false)} className="btn-secondary">
              إلغاء
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إنشاء الحساب'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
