import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractError } from '@/contexts/AuthContext'
import { api } from '@/lib/api'

export default function Setup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    companyName: '',
    adminUsername: '',
    adminFullName: '',
    adminPassword: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.adminPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    if (form.adminPassword !== form.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }

    setBusy(true)
    try {
      await api.post('/auth/setup', {
        companyName: form.companyName,
        adminUsername: form.adminUsername,
        adminPassword: form.adminPassword,
        adminFullName: form.adminFullName || form.adminUsername,
      })
      navigate('/login')
    } catch (err) {
      setError(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 to-brand-950 p-4">
      <div className="card w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-4xl">
            🚀
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">الإعداد الأولي</h1>
          <p className="mt-1 text-sm text-slate-500">
            أنشئ الشركة ومدير النظام — يتم مرة واحدة فقط
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">اسم الشركة / المتجر *</label>
            <input className="input" value={form.companyName} onChange={update('companyName')} placeholder="متجر التقنية" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">اسم المستخدم (مدير) *</label>
              <input className="input" value={form.adminUsername} onChange={update('adminUsername')} placeholder="admin" required />
            </div>
            <div>
              <label className="label">الاسم الكامل</label>
              <input className="input" value={form.adminFullName} onChange={update('adminFullName')} placeholder="مدير النظام" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">كلمة المرور *</label>
              <input className="input" type="password" value={form.adminPassword} onChange={update('adminPassword')} required />
            </div>
            <div>
              <label className="label">تأكيد كلمة المرور *</label>
              <input className="input" type="password" value={form.confirmPassword} onChange={update('confirmPassword')} required />
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
            {busy ? 'جارٍ الإعداد...' : 'إنشاء النظام'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-secondary w-full"
          >
            العودة لتسجيل الدخول
          </button>
        </form>
      </div>
    </div>
  )
}
