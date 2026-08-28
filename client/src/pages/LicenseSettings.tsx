import { useCallback, useEffect, useState } from 'react'
import { api, extractError } from '@/lib/api'

interface LicenseInfo {
  hasLicense: boolean
  isTrial?: boolean
  trialDaysLeft?: number
  licenseKey?: string
  tier?: string
  activatedAt?: string
  expiresAt?: string | null
  maxUsers?: number | null
  maxBranches?: number | null
  features?: string[]
  hwHash?: string
}

const TIER_LABELS: Record<string, string> = {
  trial: 'تجريبي',
  basic: 'أساسي',
  pro: 'احترافي',
  enterprise: 'مؤسسي',
}

const TIER_COLORS: Record<string, string> = {
  trial: 'bg-gray-100 text-gray-700',
  basic: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
}

export default function LicenseSettings() {
  const [info, setInfo] = useState<LicenseInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activating, setActivating] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [licenseInput, setLicenseInput] = useState('')
  const [message, setMessage] = useState('')
  const [machineId, setMachineId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/license/info')
      setInfo(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMachineId = useCallback(async () => {
    try {
      const res = await api.get('/license/machine-id')
      setMachineId(res.data.hwHash)
    } catch {
      // Silently fail — this is optional display
    }
  }, [])

  useEffect(() => {
    load()
    loadMachineId()
  }, [load, loadMachineId])

  const handleActivate = async () => {
    if (!licenseInput.trim()) {
      setError('الصق نص الترخيص المُوقَّع')
      return
    }
    setActivating(true)
    setError('')
    setMessage('')
    try {
      await api.post('/activate', { licenseKey: licenseInput.trim() })
      setMessage('تم تفعيل الترخيص بنجاح')
      setLicenseInput('')
      load()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setActivating(false)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm('هل أنت متأكد من إلغاء الترخيص؟ System سيعود للوضع التجريبي.')) return
    setDeactivating(true)
    setError('')
    setMessage('')
    try {
      await api.post('/deactivate')
      setMessage('تم إلغاء الترخيص')
      load()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setDeactivating(false)
    }
  }

  const copyMachineId = () => {
    navigator.clipboard.writeText(machineId)
    setMessage('تم نسخ Machine ID')
  }

  if (loading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse text-center text-gray-500 py-8">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error / Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{message}</div>
      )}

      {/* Machine ID */}
      <div className="card p-6">
        <h3 className="text-lg font-bold mb-4">🖥️ معرّف الجهاز (Machine ID)</h3>
        <p className="text-sm text-gray-500 mb-3">
          أرسل هذا المعرّف للمدير لتوليد ترخيص مُوقَّع مخصص لهذا السيرفر
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-50 border rounded px-3 py-2 text-xs font-mono break-all">
            {machineId || 'جاري التحميل...'}
          </code>
          <button
            onClick={copyMachineId}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >
            📋 نسخ
          </button>
        </div>
      </div>

      {/* Current License Status */}
      <div className="card p-6">
        <h3 className="text-lg font-bold mb-4">📋 حالة الترخيص الحالي</h3>

        {!info?.hasLicense && info?.isTrial && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-600 font-bold">⏰ وضع تجريبي</span>
            </div>
            <p className="text-sm text-amber-700">
              متبقي <strong>{info.trialDaysLeft}</strong> يوم من الفترة التجريبية
            </p>
            <div className="mt-2 bg-amber-200 rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((info.trialDaysLeft || 0) / 30) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {info?.hasLicense && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">المستوى:</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[info.tier || ''] || ''}`}>
                {TIER_LABELS[info.tier || ''] || info.tier}
              </span>
            </div>
            <div>
              <span className="text-gray-500">معرّف الترخيص:</span>
              <span className="ml-2 font-mono text-xs">{info.licenseKey}</span>
            </div>
            <div>
              <span className="text-gray-500">تاريخ التفعيل:</span>
              <span className="ml-2">{info.activatedAt ? new Date(info.activatedAt).toLocaleDateString('ar-LY') : '-'}</span>
            </div>
            <div>
              <span className="text-gray-500">تاريخ الانتهاء:</span>
              <span className="ml-2">{info.expiresAt ? new Date(info.expiresAt).toLocaleDateString('ar-LY') : 'بلا انتهاء (دائم)'}</span>
            </div>
            <div>
              <span className="text-gray-500">الحد الأقصى للمستخدمين:</span>
              <span className="ml-2">{info.maxUsers || 'غير محدود'}</span>
            </div>
            <div>
              <span className="text-gray-500">الحد الأقصى للفروع:</span>
              <span className="ml-2">{info.maxBranches || 'غير محدود'}</span>
            </div>
          </div>
        )}

        {info?.features && info.features.length > 0 && (
          <div className="mt-4">
            <span className="text-gray-500 text-sm">الميزات المفعّلة:</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {info.features.map((f) => (
                <span key={f} className="px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded text-xs">
                  {f === '*' ? '★ كل الميزات' : f}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-400 font-mono">
          HW Hash: {info?.hwHash || 'N/A'}
        </div>
      </div>

      {/* Activate New License */}
      <div className="card p-6">
        <h3 className="text-lg font-bold mb-4">🔑 تفعيل ترخيص جديد</h3>
        <p className="text-sm text-gray-500 mb-3">
          الصق نص الترخيص المُوقَّع (Base64) الذي تسلّمته من المدير
        </p>
        <textarea
          value={licenseInput}
          onChange={(e) => setLicenseInput(e.target.value)}
          placeholder="الصق نص الترخيص هنا..."
          className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-24 resize-none"
          dir="ltr"
        />
        <button
          onClick={handleActivate}
          disabled={activating || !licenseInput.trim()}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm"
        >
          {activating ? 'جاري التفعيل...' : '✅ تفعيل الترخيص'}
        </button>
      </div>

      {/* Deactivate */}
      {info?.hasLicense && (
        <div className="card p-6 border-red-200">
          <h3 className="text-lg font-bold mb-2 text-red-600">⚠️ إلغاء الترخيص</h3>
          <p className="text-sm text-gray-500 mb-3">
            عند الإلغاء، سيعود النظام للوضع التجريبي (30 يوم)
          </p>
          <button
            onClick={handleDeactivate}
            disabled={deactivating}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm"
          >
            {deactivating ? 'جاري الإلغاء...' : '🚫 إلغاء الترخيص'}
          </button>
        </div>
      )}
    </div>
  )
}
