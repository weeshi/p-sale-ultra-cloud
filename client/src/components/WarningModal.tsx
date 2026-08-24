import { useSync } from '@/contexts/SyncContext'

// نافذة تعليمات مهمة: تنظيف المتصفح وضرورة الاتصال بالإنترنت
export default function WarningModal() {
  const { showWarningModal, setShowWarningModal, storagePercent, storageLevel, pending, online } = useSync()

  if (!showWarningModal) return null

  const critical = storageLevel === 'critical'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setShowWarningModal(false)}
    >
      <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-red-700">⚠️ تحذير — تعليمات مهمة</h3>
          <button
            onClick={() => setShowWarningModal(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-700">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="font-bold text-red-800">🔌 ضرورة الاتصال بالإنترنت</p>
            <p className="mt-1">
              {online
                ? 'أنت متصل الآن. عند انقطاع الاتصال تُحفظ عملياتك محلياً وتُزامن تلقائياً عند عودة الإنترنت.'
                : 'أنت غير متصل حالياً. تعمل النسخة محلياً ببياناتك المخزنة، وتُزامن كل شيء تلقائياً عند عودة الاتصال.'}
            </p>
            {pending > 0 && (
              <p className="mt-1 font-semibold text-red-700">
                ⏳ هناك {pending} عملية معلقة بانتظار المزامنة.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-bold text-slate-800">🧹 لا تمسح بيانات الموقع (Site Data)</p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>بياناتك تُحفظ محلياً داخل المتصفح (IndexedDB) لتشتغل دون إنترنت.</li>
              <li>
                مسح <b>الموقع والبيانات</b> أو <b>الكوكيز</b> أو <b>ذاكرة التخزين</b> في المتصفح يحذف هذه البيانات
                ويمنع عمل النظام دون اتصال.
              </li>
              <li>لا تمسحها إلا بعد التأكد من إتمام المزامنة (صفر عمليات معلقة) ووجود نسخة احتياطية.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-bold text-slate-800">💾 مساحة التخزين</p>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${critical ? 'bg-red-600' : storageLevel === 'warning' ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, Math.round(storagePercent))}%` }}
              />
            </div>
            <p className={`mt-1 font-semibold ${critical ? 'text-red-700' : 'text-slate-700'}`}>
              مستخدم {Math.round(storagePercent)}% من حصة التخزين
            </p>
            {critical && (
              <p className="mt-1 text-red-700">
                الحصة شبه ممتلئة. لتقليل الاستهلاك: ثبّت إصدار النظام كتطبيق، وأزل الإصدارات القديمة من ذاكرة المتصفح
                المؤقتة، وتجنب فتح التطبيق من عدة متصفحات قديمة في آنٍ واحد. لا تحذف بيانات الموقع.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-bold text-slate-800">🔄 المزامنة التلقائية</p>
            <p className="mt-1">
              حتى لو أُغلق المتصفح، تُستأنف المزامنة تلقائياً عند عودة الإنترنت (Background Sync). استمر في استخدام
              النظام بشكل طبيعي دون قلق من فقدان العمليات.
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={() => setShowWarningModal(false)} className="btn-primary flex-1">
            فهمت
          </button>
        </div>
      </div>
    </div>
  )
}
