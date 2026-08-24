import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmtMoney, toNum } from '@/lib/format'
import type { Account, Treasury } from '@/types'

const TREASURY_TYPE_LABEL: Record<string, string> = {
  cash: 'نقدية',
  bank: 'بنك',
  mobile_money: 'محفظة إلكترونية',
}

const CURRENCY_LABEL: Record<string, string> = {
  LYD: 'د.ل',
  USD: '$',
}

interface TreasuryForm {
  treasuryName: string
  treasuryType: string
  currency: string
  openingBalance: number
  accountId: number | null
  bankName: string
  accountNumber: string
  iban: string
}

const emptyForm = (): TreasuryForm => ({
  treasuryName: '',
  treasuryType: 'cash',
  currency: 'LYD',
  openingBalance: 0,
  accountId: null,
  bankName: '',
  accountNumber: '',
  iban: '',
})

export default function Treasuries() {
  const { selectedBranchId } = useBranchFilter()
  const [treasuries, setTreasuries] = useState<Treasury[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<TreasuryForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .get('/accounts')
      .then((r) => {
        if (!cancelled) setAccounts(r.data)
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
      const br = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
      const res = await cachedRead<Treasury[]>(`treasuries:${version}:${selectedBranchId ?? 'all'}`, () =>
        api.get(`/treasury${br}`).then((r) => r.data), 'treasuries'
      )
      setTreasuries(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [version, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const totalBalance = useMemo(() => treasuries.reduce((s, t) => s + toNum(t.currentBalance), 0), [treasuries])

  const handleSave = async () => {
    if (!form.treasuryName.trim()) {
      setFormError('اسم الخزينة مطلوب')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await offlineWrite<Treasury>(
        '/treasury',
        'POST',
        {
          treasuryName: form.treasuryName.trim(),
          treasuryType: form.treasuryType,
          currency: form.currency,
          openingBalance: form.openingBalance || 0,
          accountId: form.accountId,
          bankName: form.bankName.trim() || undefined,
          accountNumber: form.accountNumber.trim() || undefined,
          iban: form.iban.trim() || undefined,
          branchId: selectedBranchId ?? undefined,
        },
        { entity: 'treasury' }
      )
      setShowModal(false)
      setForm(emptyForm())
      setVersion((v) => v + 1)
    } catch (err) {
      setFormError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">الخزائن</h1>
          <p className="text-sm text-slate-500">الصناديق والحسابات البنكية والمحافظ — {fmtMoney(totalBalance)} إجمالي</p>
        </div>
        <button onClick={() => { setForm(emptyForm()); setFormError(''); setShowModal(true) }} className="btn-primary">
          ＋ خزينة جديدة
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل الخزائن...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {treasuries.length === 0 ? (
            <p className="col-span-full py-12 text-center text-slate-400">لا توجد خزائن بعد — أنشئ أول خزينة</p>
          ) : (
            treasuries.map((t) => (
              <div key={t.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-800">{t.treasuryName}</div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {TREASURY_TYPE_LABEL[t.treasuryType] ?? t.treasuryType}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  العملة: <b className="text-slate-700">{CURRENCY_LABEL[t.currency] ?? t.currency}</b>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">الرصيد الحالي</span>
                    <span className="text-lg font-extrabold text-slate-800">{fmtMoney(t.currentBalance)}</span>
                  </div>
                </div>
                {t.account && (
                  <div className="mt-2 text-xs text-slate-400">
                    حساب مرتبط: {t.account.accountCode} — {t.account.accountName}
                  </div>
                )}
                {(t.bankName || t.accountNumber) && (
                  <div className="mt-1 text-xs text-slate-400">
                    {[t.bankName, t.accountNumber, t.iban].filter(Boolean).join(' • ')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <Modal open={showModal} title="خزينة جديدة" onClose={() => setShowModal(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">اسم الخزينة</label>
              <input
                className="input"
                value={form.treasuryName}
                onChange={(e) => setForm({ ...form, treasuryName: e.target.value })}
                placeholder="مثال: صندوق الفرع الرئيسي"
              />
            </div>
            <div>
              <label className="label">النوع</label>
              <select
                className="input"
                value={form.treasuryType}
                onChange={(e) => setForm({ ...form, treasuryType: e.target.value })}
              >
                <option value="cash">نقدية</option>
                <option value="bank">بنك</option>
                <option value="mobile_money">محفظة إلكترونية</option>
              </select>
            </div>
            <div>
              <label className="label">العملة</label>
              <select
                className="input"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="LYD">دينار ليبي (د.ل)</option>
                <option value="USD">دولار ($)</option>
              </select>
            </div>
            <div>
              <label className="label">الرصيد الافتتاحي</label>
              <input
                type="number"
                step="0.001"
                className="input"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">الحساب المحاسبي (اختياري)</label>
              <select
                className="input"
                value={form.accountId ?? ''}
                onChange={(e) => setForm({ ...form, accountId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— بلا حساب —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountCode} — {a.accountName}
                  </option>
                ))}
              </select>
            </div>
            {form.treasuryType === 'bank' && (
              <>
                <div>
                  <label className="label">اسم البنك</label>
                  <input
                    className="input"
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">رقم الحساب</label>
                  <input
                    className="input"
                    value={form.accountNumber}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">IBAN</label>
                  <input
                    className="input"
                    value={form.iban}
                    onChange={(e) => setForm({ ...form, iban: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>

          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowModal(false)} className="btn-secondary">إلغاء</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'جارٍ الحفظ...' : 'إنشاء الخزينة'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
