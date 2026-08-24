import { api } from './api'
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

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

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
    if (cached !== undefined && cached.version === currentVersion && isOnline()) {
      // الكاش حديث، نعيده فوراً ونحدث في الخلفية
      fetcher().then((fresh) => cacheSetWithVersion(nsKey, fresh, currentVersion)).catch(() => {})
      return { data: cached.data, fromCache: true }
    }
    // الكاش قديم أو لا يوجد — نجلب من الشبكة
    try {
      const fresh = await fetcher()
      await cacheSetWithVersion(nsKey, fresh, currentVersion)
      return { data: fresh, fromCache: false }
    } catch {
      if (cached !== undefined) return { data: cached.data, fromCache: true }
      throw new Error('تعذر التحميل من الخادم ولا توجد نسخة مخزنة')
    }
  }

  // بدون entityName: السلوك الأصلي (بدون فحص إصدار)
  const cached = await cacheGet<T>(nsKey)
  if (!isOnline()) {
    if (cached !== undefined) return { data: cached, fromCache: true }
    throw new Error('لا يوجد اتصال ولا بيانات مخزنة')
  }
  try {
    const fresh = await fetcher()
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
