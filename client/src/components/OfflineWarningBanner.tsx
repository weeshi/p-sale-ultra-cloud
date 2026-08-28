import { useSync } from '@/contexts/SyncContext'

// شريط تحذير علوي ثابت: يظهر عند انقطاع الاتصال أو امتلاء حصة التخزين (حرج)
export default function OfflineWarningBanner() {
  const { online, pending, storageLevel, storagePercent, setShowWarningModal } = useSync()

if (online && storageLevel !== 'critical') return null

  const critical = storageLevel === 'critical'
  const bg = critical ? 'bg-red-600' : online ? 'bg-amber-500' : 'bg-orange-600'
  const text = critical
    ? `🚨 مساحة التخزين شبه ممتلئة (${Math.round(storagePercent)}%) — لا تمسح بيانات الموقع حتى لا تفقد بياناتك دون مزامنة`
    : online
      ? `🚨 مساحة التخزين شبه ممتلئة (${Math.round(storagePercent)}%) — راجع التعليمات قبل تنظيف المتصفح`
      : `📴 وضع عدم الاتصال — أنت تعرض بيانات مخزنة محلياً (قديمة وغير محدّثة)${pending > 0 ? ` — ${pending} عملية معلقة ستُزامن تلقائياً عند عودة الاتصال` : ' — حدّث نفسه تلقائياً عند عودة الاتصال'}`

  return (
    <div className={`fixed inset-x-0 top-0 z-50 ${bg} px-4 py-2 text-center text-sm font-semibold text-white shadow-md`}>
      <span className="ml-2">{text}</span>
      {critical && (
        <button
          onClick={() => setShowWarningModal(true)}
          className="mr-2 rounded bg-white/20 px-2 py-0.5 text-xs underline hover:bg-white/30"
        >
          التعليمات
        </button>
      )}
    </div>
  )
}
