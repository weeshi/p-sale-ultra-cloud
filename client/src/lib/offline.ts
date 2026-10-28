import { api, API_BASE_URL } from './api'
import { cacheGet, cacheGetWithVersion, cacheSet, cacheSetWithVersion, enqueue, invalidateEntityCaches } from './db'
import { getActiveScope, namespaceKey } from './session'
import { getCacheVersion, incCacheVersion } from './cacheVersion'
import type { QueueItem } from './db'

// محرك الأوفلاين: كتابة عبر الطابور عند غياب الاتصال، وقراءة عبر الكاش عند الحاجة

const DEVICE_KEY = 'psale_device_id'

function makeDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = makeDeviceId()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

/**
 * عنوان فحص الصحة: يجب أن يتبع عنوان الـ API المُهيّأ، لا أصل الصفحة.
 * سبب العطل (2026-10-28): الطلب النسبي '/api/health' كان يُخدَّم من خادم
 * الملفات الثابتة (`serve -s dist`) فيعيد index.html بحالة 200 — فيُخدع الفحص.
 */
const HEALTH_CHECK_URL = `${API_BASE_URL.replace(/\/+$/, '')}/health`
const HEALTH_CHECK_INTERVAL_MS = 30_000
const HEALTH_CHECK_TIMEOUT_MS = 5_000
/** مهلة جلب الشبكة في cachedRead — يمنع تعليق الطلب عند اتصال بالراوتر دون إنترنت حقيقي */
export const CACHED_READ_TIMEOUT_MS = 5_000

/** null = غير مؤكدة بعد (تفاؤلي)، true = مؤكدة متصل، false = مؤكد منقطع */
let realOnline: boolean | null = null
let monitorStarted = false

async function checkHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), HEALTH_CHECK_TIMEOUT_MS)
    const res = await fetch(HEALTH_CHECK_URL, { cache: 'no-store', signal: ctrl.signal })
    clearTimeout(timer)
    if (!res?.ok) return false
    // لا نكتفي بحالة 200: أي صفحة HTML (SPA fallback) تُعيد 200 أيضاً —
    // نتأكد أن الاستجابة هي فعلاً استجابة صحة من الخادم
    const data = await res.json().catch(() => null)
    return Boolean(data && (data.status === 'ok' || data.db === 'connected'))
  } catch {
    return false
  }
}

/**
 * مراقبة الاتصال الفعلي: navigator.onLine وحده غير موثوق (يعود true بمجرد الاتصال
 * بالراوتر رغم انقطاع الإنترنت). نجري فحصاً دورياً على /api/health ونحفّز أحداث
 * online/offline لعكس الحالة الفعلية على الواجهة (SyncContext والبانرات).
 */
export function startConnectivityMonitor(): void {
  if (monitorStarted || typeof window === 'undefined') return
  monitorStarted = true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) realOnline = false
  const check = async () => {
    const ok = await checkHealth()
    if (ok && realOnline !== true) {
      const wasOffline = realOnline === false
      realOnline = true
      if (wasOffline) window.dispatchEvent(new Event('online'))
    } else if (!ok && realOnline !== false) {
      realOnline = false
      window.dispatchEvent(new Event('offline'))
    }
  }
  void check()
  setInterval(() => { void check() }, HEALTH_CHECK_INTERVAL_MS)
  window.addEventListener('online', () => { void check() })
  window.addEventListener('offline', () => { realOnline = false })
}

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine && realOnline !== false
}

/** مهلة قصوى لأي عملية جلب: ترفض الطلب بعد ms لتجنب التعليق بلا إنترنت حقيقي */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('انتهت مهلة الطلب')), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) }
    )
  })
}

/**
 * جلب آمن:
 * - اتصال مؤكد (realOnline === true): بلا مهلة قصيرة — الخادم قد يكون بطيئاً بشكل مشروع
 * - اتصال غير مؤكد (realOnline === null، أول ثوانٍ من التشغيل): مهلة قصوى لمنع التعليق
 * - منقطع (realOnline === false): لا يصل إلى هنا — الكاش يُعاد قبل أي جلب
 */
function safeFetch<T>(fetcher: () => Promise<T>): Promise<T> {
  if (realOnline === null) return withTimeout(fetcher(), CACHED_READ_TIMEOUT_MS)
  return fetcher()
}

// بدء المراقبة فور استيراد المحرك — يضمن دقة isOnline() من أول قراءة
startConnectivityMonitor()

/**
 * كتابة بأسلوب Offline-First:
 * - متصل: تنفذ مباشرة وتعيد النتيجة
 * - غير متصل أو فشل شبكة: تُدرج العملية في syncQueue وتعيد { queued: true }
 */
export async function offlineWrite<T>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: unknown,
  meta: { entity: string; recordId?: number }
): Promise<{ queued: false; data: T } | { queued: true; id: number }> {
  const scope = await getActiveScope()
  const attach = (entity: string, action: QueueItem['action'], data: unknown, recordId?: number) =>
    enqueue(entity, action, data, recordId, { userId: scope.userId ?? null, branchId: scope.branchId ?? null })

  if (!isOnline()) {
    const id = await attach(meta.entity, toAction(method), body, meta.recordId)
    return { queued: true, id }
  }

  try {
    const res = await api.request<T>({ url: endpoint, method, data: body })
    // إبطال الكاش للكيان المتأثر لضمان تحديث البيانات عند القراءة التالية
    const entity = endpoint.split('/')[1]?.split('?')[0] ?? meta.entity
    await invalidateEntityCaches(entity)
    // زيادة إصدار الكاش لهذا الكيان
    await incCacheVersion(entity)
    return { queued: false, data: res.data }
  } catch (err: unknown) {
    // فشل شبكة (لا استجابة) → طابور؛ خطأ خادم (استجابة) → يُرمى
    if (err instanceof Error && 'response' in err) return Promise.reject(err)
    const id = await attach(meta.entity, toAction(method), body, meta.recordId)
    return { queued: true, id }
  }
}

/**
 * قراءة بأسلوب Cache-First مع تحديث الخلفية وإصدار الكاش:
 * - إذا entityName مُمرر: تتحقق من cache_version:entity وتتجاهل الكاش إن اختلف
 * - تخزن الإصدار مع الكاش للمقارنة لاحقاً
 */
export async function cachedRead<T>(key: string, fetcher: () => Promise<T>, entityName?: string): Promise<{ data: T; fromCache: boolean }> {
  const nsKey = await namespaceKey(key)

  if (entityName) {
    const currentVersion = await getCacheVersion(entityName)
    const cached = await cacheGetWithVersion<T>(nsKey)
    // دون اتصال: نعيد أي نسخة مخزنة مهما كان إصدارها — العرض أهم من الحداثة
    if (cached !== undefined && !isOnline()) {
      return { data: cached.data, fromCache: true }
    }
    // متصل: نجلب الأحدث من الشبكة ونحدّث الكاش.
    // (سابقاً كان الكاش المطابق للإصدار يُعاد فوراً مع تحديث في الخلفية،
    // فظهرت لافتة «عرض نسخة مخزنة — قد تكون البيانات غير محدّثة» عند كل فتح
    // صفحة رغم سلامة الاتصال — عطل UX موثّق 2026-10-28)
    try {
      const fresh = await safeFetch(fetcher)
      await cacheSetWithVersion(nsKey, fresh, currentVersion)
      return { data: fresh, fromCache: false }
    } catch {
      if (cached !== undefined) return { data: cached.data, fromCache: true }
      throw new Error('تعذر التحميل من الخادم ولا توجد نسخة مخزنة')
    }
  }

  // بدون entityName: السلوك الأصلي (بدون فحص إصدار) مع مهلة قصوى
  const cached = await cacheGet<T>(nsKey)
  if (!isOnline()) {
    if (cached !== undefined) return { data: cached, fromCache: true }
    throw new Error('لا يوجد اتصال ولا بيانات مخزنة')
  }
  try {
    const fresh = await safeFetch(fetcher)
    await cacheSet(nsKey, fresh)
    return { data: fresh, fromCache: false }
  } catch {
    if (cached !== undefined) return { data: cached, fromCache: true }
    throw new Error('تعذر التحميل من الخادم ولا توجد نسخة مخزنة')
  }
}

function toAction(method: string): QueueItem['action'] {
  switch (method) {
    case 'POST':
      return 'create'
    case 'DELETE':
      return 'delete'
    default:
      return 'update'
  }
}
