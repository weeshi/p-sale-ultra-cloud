import { cacheGet, cacheGetAllKeys, deleteCachedKeys, metaGet, metaSet } from './db'

// جلسة العزل المحلية: يتبع النطاق النشط (User + Branch) لمفتاح الكاش المركب
// المفتاح المعتمد: table:${table}:user:${userId}:branch:${branchId}

const ACTIVE_USER_KEY = 'active_user_id'
const ACTIVE_BRANCH_KEY = 'active_branch_id'
const LAST_ACCESS_PREFIX = 'last_access:'

let cachedUserId: number | null | undefined = undefined
let cachedBranchId: number | null | undefined = undefined

/** فرع عمودي للاستخدام في المفتاح: عدد صحيح أو 'global' للمسؤولين/السوبر أدمن */
export function branchScope(branchId: number | null | undefined): string {
  return String(branchId ?? 'global')
}

/** قراءة المستخدم المخزَّن محلياً (psale_user) بشكل متزامن — احتياطي قبل جاهزية IndexedDB */
function readStoredUser(): { userId: number | null; branchId: number | null } | null {
  try {
    const raw = localStorage.getItem('psale_user')
    if (!raw) return null
    const u = JSON.parse(raw) as { id?: number | null; branchId?: number | null }
    if (typeof u.id !== 'number') return null
    return { userId: u.id, branchId: u.branchId ?? null }
  } catch {
    return null
  }
}

/** تحديد النطاق النشط (يُنادى عند تسجيل الدخول / تحديث الجلسة) */
export async function setActiveScope(userId: number | null, branchId: number | null): Promise<void> {
  cachedUserId = userId
  cachedBranchId = branchId
  await metaSet(ACTIVE_USER_KEY, userId ?? null)
  await metaSet(ACTIVE_BRANCH_KEY, branchId ?? null)
  const scope = `user:${userId ?? 'null'}:branch:${branchScope(branchId)}`
  await metaSet(LAST_ACCESS_PREFIX + scope, Date.now())
}

/** ضبط الذاكرة فوراً (بدون IndexedDB) — يُستدعى متزامناً عند تهيئة الجلسة قبل الرندر */
export function setActiveScopeSync(userId: number | null, branchId: number | null): void {
  cachedUserId = userId
  cachedBranchId = branchId
}

/**
 * قراءة النطاق النشط: من المتغير المحلي إن وُجد، وإلا من meta (يُستدعى في cachedRead/الطابور)
 * يرجع null للمستخدمين غير المحددين — تُستخدم مفاتيح بلا نطاق (توافق خلفي مؤقت)
 */
export async function getActiveScope(): Promise<{ userId: number | null; branchId: number | null }> {
  if (cachedUserId !== undefined) {
    return { userId: cachedUserId, branchId: cachedBranchId ?? null }
  }
  const userId = (await metaGet<number | null>(ACTIVE_USER_KEY)) ?? null
  const branchId = (await metaGet<number | null>(ACTIVE_BRANCH_KEY)) ?? null
  // احتياطي متزامن: إذا لم تُكتب meta بعد (سباق عند فتح المتصفح دون اتصال) نقرأ localStorage
  if (userId === null) {
    const stored = readStoredUser()
    if (stored) {
      cachedUserId = stored.userId
      cachedBranchId = stored.branchId
      return stored
    }
  }
  cachedUserId = userId
  cachedBranchId = branchId
  return { userId, branchId }
}

/** نسخة متزامنة (للاستخدام في تهيئة الجلسة) — تعتمد الذاكرة ثم localStorage */
export function getActiveScopeSync(): { userId: number | null; branchId: number | null } {
  if (cachedUserId !== undefined) {
    return { userId: cachedUserId, branchId: cachedBranchId ?? null }
  }
  const stored = readStoredUser()
  if (stored) {
    cachedUserId = stored.userId
    cachedBranchId = stored.branchId
    return stored
  }
  return { userId: null, branchId: null }
}

/** تطبيق العزل على أي مفتاح كاش: «key» → «key:user:{id}:branch:{branchId|global}» */
export async function namespaceKey(key: string): Promise<string> {
  const { userId, branchId } = await getActiveScope()
  if (userId === null) return key
  return `${key}:user:${userId}:branch:${branchScope(branchId)}`
}

export function namespaceKeySync(key: string, scope: { userId: number | null; branchId: number | null }): string {
  if (scope.userId === null) return key
  return `${key}:user:${scope.userId}:branch:${branchScope(scope.branchId)}`
}

/** إمساك النطاق عند الخروج — لا مسح للكاش، العزل المنطقي يحفظ البيانات */
export async function clearActiveScope(): Promise<void> {
  cachedUserId = null
  cachedBranchId = null
  await metaSet(ACTIVE_USER_KEY, null)
  await metaSet(ACTIVE_BRANCH_KEY, null)
}

export const LAST_ACCESS_KEY_PREFIX = LAST_ACCESS_PREFIX

/** أقصى عدد من المستخدمين نحتفظ بكاشهم محلياً (عزل + أداء) */
export const MAX_CACHED_USERS = 3

/**
 * تنظيف دوري للكاش حسب النطاق: يُبقي مفاتيح أحدث مستخدمي MAX_CACHED_USERS فقط
 * (حسب last_access) ويحذف مفاتيح النطاقات الأقدم + مفاتيح الكاش القديمة غير المنسوبة
 */
export async function pruneOldUserCaches(maxUsers: number = MAX_CACHED_USERS): Promise<void> {
  const lastAccessKeys = await cacheGetAllKeys(LAST_ACCESS_PREFIX)
  if (lastAccessKeys.length === 0) return

  const entries = await Promise.all(
    lastAccessKeys.map(async (key) => ({
      key,
      scope: key.slice(LAST_ACCESS_PREFIX.length),
      ts: (await cacheGet<number>(key)) ?? 0,
    }))
  )
  entries.sort((a, b) => b.ts - a.ts)
  const keepScopes = new Set(entries.slice(0, maxUsers).map((e) => e.scope))
  const keptSet = new Set(entries.slice(0, maxUsers).map((e) => e.key))

  const allKeys = await cacheGetAllKeys()
  const doomed = allKeys.filter((k) => {
    if (k.startsWith(LAST_ACCESS_PREFIX)) return !keptSet.has(k)
    const idx = k.indexOf(':user:')
    if (idx === -1) return true
    return !keepScopes.has(k.slice(idx + 1))
  })

  if (doomed.length > 0) await deleteCachedKeys(doomed)
}