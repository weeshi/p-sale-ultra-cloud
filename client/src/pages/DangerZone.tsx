import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { clearAllCacheVersions } from '@/lib/cacheVersion'
import { resetOfflineStorage } from '@/lib/db'

type Step = 'idle' | 'backup' | 'backup_done' | 'confirming' | 'resetting'

export default function DangerZone() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { syncNow, syncing, online } = useSync()

  const [step, setStep] = useState<Step>('idle')
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupFilename, setBackupFilename] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!user?.isSuperAdmin) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <div className="text-3xl">🚫</div>
        <h2 className="mt-2 text-lg font-bold text-red-800">غير مصرح</h2>
        <p className="mt-1 text-sm text-red-600">
          منطقة الخطر متاحة للسوبر أدمن فقط — تواصل مع مدير النظام.
        </p>
      </div>
    )
  }

  async function handleBackup() {
    setBackupLoading(true)
    setError(null)
    setStep('backup')
    try {
      const res = await api.post<Blob>('/settings/backup-before-reset', null, {
        responseType: 'blob',
        timeout: 5 * 60 * 1000,
      })
      const disposition = res.headers['content-disposition'] as string | undefined
      const match = disposition?.match(/filename="?([^";]+)"?/i)
      const filename = match?.[1] || `psale_backup_${new Date().toISOString().slice(0, 10)}.sql.gz`

      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setBackupFilename(filename)
      setStep('backup_done')
    } catch (e) {
      setError(extractError(e))
      setStep('idle')
    } finally {
      setBackupLoading(false)
    }
  }

  async function handleReset() {
    setError(null)
    setStep('resetting')
    try {
      await api.post('/settings/reset-database', { password })
      navigate('/login?reset=1', { replace: true })
    } catch (e) {
      setError(extractError(e))
      setStep('confirming')
    }
  }

  const backupDone = step === 'backup_done' || step === 'confirming' || step === 'resetting'

  return (
    <>
      <div className="rounded-xl border-2 border-red-300 bg-red-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="text-4xl">📛</div>
        <div>
          <h1 className="text-xl font-bold text-red-800">منطقة الخطر</h1>
          <p className="mt-1 text-sm text-red-700">
            هذه المنطقة مخصصة للسوبر أدمن فقط. تفريغ قاعدة البيانات يحذف{' '}
            <strong>جميع المعاملات والمستندات والأصناف والعملاء والموردين والمستخدمين (عدا السوبر أدمن)
            والمخازن (عدا المركزي)</strong>{' '}
            ويرجّع الأرصدة والتسلسلات إلى الصفر.
          </p>
          <p className="mt-1 text-sm text-red-700">
            <strong>لن تُحذف:</strong> بيانات الشركة والفروع والحسابات المحاسبية والمخزن المركزي
            وإعدادات الكتالوج (الفئات/الماركات/الوحدات/الخصائص).
          </p>
          <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-800">
            ⚠️ إجراء لا يمكن التراجع عنه — يجب أخذ نسخة احتياطية قبل التنفيذ.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      <div className="mt-5 space-y-4">
        {/* الخطوة 1: النسخة الاحتياطية */}
        <div className="rounded-lg border border-red-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-800">الخطوة 1 — النسخة الاحتياطية (إجبارية)</div>
              <div className="text-xs text-slate-500">
                أنشئ نسخة احتياطية كاملة لقاعدة البيانات قبل أي تفريغ.
              </div>
              {backupFilename && (
                <div className="mt-1 text-xs font-semibold text-green-700">
                  ✅ تم إنشاء النسخة الاحتياطية: <span dir="ltr">{backupFilename}</span>
                </div>
              )}
            </div>
            <button
              onClick={handleBackup}
              disabled={backupLoading || backupDone}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {backupLoading ? 'جاري إنشاء النسخة الاحتياطية...' : backupDone ? 'تم أخذ النسخة ✓' : '📥 خذ نسخة احتياطية الآن'}
            </button>
          </div>
        </div>

        {/* الخطوة 2: كلمة المرور والتأكيد */}
        <div className="rounded-lg border border-red-200 bg-white p-4">
          <div className="text-sm font-bold text-slate-800">الخطوة 2 — تأكيد كلمة المرور</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!backupDone || step === 'resetting'}
              placeholder="كلمة مرور السوبر أدمن"
              className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
            />
            <button
              onClick={handleReset}
              disabled={!backupDone || password.length === 0 || step === 'resetting'}
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === 'resetting' ? 'جاري التفريغ...' : '🗑️ تأكيد التفريغ النهائي'}
            </button>
          </div>
          {!backupDone && (
            <div className="mt-2 text-xs text-slate-400">
              حقل كلمة المرور يُفعَّل بعد أخذ النسخة الاحتياطية.
            </div>
          )}
        </div>
      </div>
    </div>

    {/* تحديث قسري للكاش والمزامنة */}
    <div className="mt-8 rounded-xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="text-4xl">🔄</div>
        <div>
          <h2 className="text-xl font-bold text-amber-800">تحديث قسري للبيانات والمزامنة</h2>
          <p className="mt-1 text-sm text-amber-700">
            يمسح جميع إصدارات الكاش ويجبر مزامنة فورية مع الخادم.
            مفيد عند: عدم ظهور بيانات جديدة، مشاكل في الفلترة، أو تحديث يدوي مطلوب.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-lg border border-amber-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-800">مسح الكاش + مزامنة فورية</div>
              <div className="text-xs text-slate-500">
                يمسح cache_version لجميع الكيانات، يفرض syncNow()، ويعيد تحميل الصفحة.
              </div>
            </div>
            <button
              onClick={async () => {
                await clearAllCacheVersions()
                await syncNow()
                window.location.reload()
              }}
              disabled={syncing || !online}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? '⏳ جاري المزامنة...' : !online ? '📴 غير متصل' : '🔄 تحديث قسري الآن'}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-800">إعادة تعيين كاملة (Offline Storage)</div>
              <div className="text-xs text-slate-500">
                يحذف IndexedDB بالكامل (syncQueue + cached + meta) — استخدمه كحل أخير.
              </div>
            </div>
            <button
              onClick={async () => {
                if (confirm('سيتم مسح جميع البيانات المحلية (الطابور، الكاش، الإعدادات). هل تريد المتابعة؟')) {
                  await resetOfflineStorage()
                  window.location.reload()
                }
              }}
              disabled={syncing}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? '⏳ جاري...' : '🗑️ إعادة تعيين Offline Storage'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
