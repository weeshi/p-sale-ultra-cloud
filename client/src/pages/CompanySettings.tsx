import { useCallback, useEffect, useState } from 'react'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import type { Company } from '@/types'

const FISCAL_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

export default function CompanySettings() {
  const [form, setForm] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await cachedRead<Company>('company:settings', () =>
        api.get('/settings/company').then((r) => r.data), 'settings'
      )
      setForm(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    if (!form?.name.trim()) {
      setError('اسم الشركة مطلوب')
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await offlineWrite<Company>(
        '/settings/company',
        'PUT',
        {
          name: form.name.trim(),
          address: form.address,
          phone: form.phone,
          mobile: form.mobile,
          taxNumber: form.taxNumber,
          logo: form.logo,
          fiscalYearStart: form.fiscalYearStart,
        },
        { entity: 'company' }
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">بيانات الشركة</h1>
        <p className="text-sm text-slate-500">المعلومات الأساسية للشركة والمستندات الصادرة</p>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل بيانات الشركة...</p>
      ) : form ? (
        <div className="card max-w-2xl">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">اسم الشركة</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">العنوان</label>
              <input className="input" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="label">الهاتف</label>
              <input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">الجوال</label>
              <input className="input" value={form.mobile ?? ''} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div>
              <label className="label">الرقم الضريبي</label>
              <input className="input" value={form.taxNumber ?? ''} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
            </div>
            <div>
              <label className="label">بداية السنة المالية (شهر)</label>
              <select
                className="input"
                value={form.fiscalYearStart ?? 1}
                onChange={(e) => setForm({ ...form, fiscalYearStart: Number(e.target.value) })}
              >
                {FISCAL_MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">رابط الشعار (اختياري)</label>
              <input className="input" value={form.logo ?? ''} onChange={(e) => setForm({ ...form, logo: e.target.value })} placeholder="URL لصورة الشعار" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            {saved && <span className="text-sm font-bold text-emerald-700">✓ تم الحفظ</span>}
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
