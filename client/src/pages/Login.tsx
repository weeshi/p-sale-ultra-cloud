import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, extractError } from '@/contexts/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err: any) {
      const msg = extractError(err)
      if (msg.includes('مهيأ مسبقاً') === false && msg.includes('غير صحيحة') === false && needsSetup === false) {
        // في حال لم يوجد مستخدمون بعد
        setNeedsSetup(true)
      }
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 to-brand-950 p-4">
      <div className="card w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-4xl">
            🛒
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">P-Sale Ultra Cloud</h1>
          <p className="mt-1 text-sm text-slate-500">نظام إدارة المبيعات والمخازن والمحاسبة</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">اسم المستخدم</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="label">كلمة المرور</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
            {busy ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        {needsSetup && (
          <p className="mt-4 text-center text-sm text-slate-500">
            ليس لديك حساب بعد؟{' '}
            <button onClick={() => navigate('/setup')} className="font-semibold text-brand-700 hover:underline">
              أنشئ النظام الآن
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
