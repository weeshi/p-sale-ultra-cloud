import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, isAuthenticated } from '@/lib/api'
import { cacheSet, estimateStorage, getPendingQueue, invalidateEntityCaches, markFailed, markSynced, metaGet, metaSet, removeQueueItem, syncStats } from '@/lib/db'
import { getDeviceId, isOnline } from '@/lib/offline'
import { incCacheVersion } from '@/lib/cacheVersion'
import { namespaceKey, pruneOldUserCaches } from '@/lib/session'
import type { QueueItem } from '@/lib/db'

const LAST_SYNC_KEY = 'last_sync_at'
const STORAGE_WARN_PERCENT = 70
const STORAGE_CRITICAL_PERCENT = 90

export type StorageLevel = 'ok' | 'warning' | 'critical'

interface PullResult {
  tables: Record<string, unknown[]>
  totalCount: number
  syncedAt: string
}

interface FullSyncResult {
  push: {
    status: string
    recordsCount: number
    skippedCount?: number
    errors: Array<{ entity: string; id: number | null; queueId: number | null; message: string }>
  }
  pull: PullResult
}

interface SyncContextValue {
  online: boolean
  syncing: boolean
  pending: number
  synced: number
  lastSyncAt: string | null
  conflicts: QueueItem[]
  syncNow: () => Promise<void>
  retry: (id: number) => Promise<void>
  discard: (id: number) => Promise<void>
  storageLevel: StorageLevel
  storagePercent: number
  showWarningModal: boolean
  setShowWarningModal: (open: boolean) => void
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined)

export function SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(isOnline())
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(0)
  const [synced, setSynced] = useState(0)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<QueueItem[]>([])
  const [storageLevel, setStorageLevel] = useState<StorageLevel>('ok')
  const [storagePercent, setStoragePercent] = useState(0)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const syncingRef = useRef(false)

  const checkStorage = useCallback(async () => {
    try {
      const est = await estimateStorage()
      if (!est) return
      setStoragePercent(est.percent)
      setStorageLevel(
        est.percent >= STORAGE_CRITICAL_PERCENT
          ? 'critical'
          : est.percent >= STORAGE_WARN_PERCENT
            ? 'warning'
            : 'ok'
      )
    } catch {
      // تجاهل أخطاء التقدير (متصفح بدون دعم أو وضع خاص)
    }
  }, [])

  const refreshStats = useCallback(async () => {
    const s = await syncStats()
    setPending(s.pending)
    setSynced(s.synced)
  }, [])

  const syncNow = useCallback(async (): Promise<void> => {
    if (syncingRef.current || !isOnline() || !isAuthenticated()) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const deviceId = getDeviceId()
      const lastSyncAtStr = await metaGet<string>(LAST_SYNC_KEY)
      const queue = await getPendingQueue()

      const changes = queue.map((item) => ({
        // معرّف فريد للعملية يمنع تنفيذها مرتين على السيرفر (Idempotency)
        clientOpId: item.id !== undefined ? `${deviceId}:${item.id}:${item.createdAt}` : undefined,
        // مفتاح الطابور المحلي — يعيده السيرفر في الأخطاء لمطابقة دقيقة
        queueId: item.id ?? null,
        entity: item.entity,
        action: item.action,
        id: item.recordId,
        data: item.data,
        timestamp: item.createdAt,
        userId: item.userId ?? null,
        branchId: item.branchId ?? null,
      }))

      const res = await api.post<FullSyncResult>('/sync/full', {
        deviceId,
        lastSyncAt: lastSyncAtStr || undefined,
        changes,
      })

      // تحديد التعارضات (طلبات فشلت من الخادم) — المطابقة بمفتاح الطابور queueId
      const pushErrors = res.data.push?.errors ?? []
      const errorByQueueId = new Map<number, string>()
      for (const err of pushErrors) {
        if (err.queueId !== null && err.queueId !== undefined) {
          errorByQueueId.set(err.queueId, err.message)
        }
      }

      const failed: QueueItem[] = []
      for (const item of queue) {
        if (item.id === undefined) continue
        const failureMessage = errorByQueueId.get(item.id)
        if (failureMessage !== undefined) {
          await markFailed(item.id, failureMessage)
          failed.push({ ...item, error: failureMessage })
        } else {
          await markSynced(item.id)
        }
      }
      setConflicts(failed)

      // حفظ نسخة محلية من الجداول المسحوبة للعرض دون اتصال (مفتاح مجدوَل بالنطاق)
      const tables = res.data.pull?.tables ?? {}
      for (const [table, rows] of Object.entries(tables)) {
        await cacheSet(await namespaceKey(`table:${table}`), rows)
      }

      // إبطال كاش الصفحات للكيانات المحدثة حتى يُعاد جلبها في الزيارة التالية
      // زيادة إصدار الكاش لكل كيان لضمان تحديث جميع المستخدمين
      for (const table of Object.keys(tables)) {
        await invalidateEntityCaches(table)
        await incCacheVersion(table)
      }

      // تنظيف دوري: إبقاء كاش آخر MAX_CACHED_USERS مستخدمين فقط
      await pruneOldUserCaches()

      const syncedAt = res.data.pull?.syncedAt ?? new Date().toISOString()
      await metaSet(LAST_SYNC_KEY, syncedAt)
      setLastSyncAt(syncedAt)

      await refreshStats()
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [refreshStats])

  const retry = useCallback(
    async (id: number) => {
      setConflicts((prev) => prev.filter((c) => c.id !== id))
      await syncNow()
    },
    [syncNow]
  )

  const discard = useCallback(
    async (id: number) => {
      await removeQueueItem(id)
      setConflicts((prev) => prev.filter((c) => c.id !== id))
      await refreshStats()
    },
    [refreshStats]
  )

  // استماع للاتصال/انقطاع
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setTimeout(() => syncNow(), 500)
    }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [syncNow])

  // تحميل الحالة الأولى
  useEffect(() => {
    const init = async () => {
      await refreshStats()
      setLastSyncAt(await metaGet<string>(LAST_SYNC_KEY) ?? null)
      if (isOnline() && isAuthenticated()) setTimeout(() => syncNow(), 1000)
    }
    init()
  }, [refreshStats, syncNow])

  // مراقبة حصة التخزين: عند التحميل وكل 5 دقائق وبعد أي مزامنة ناجحة
  useEffect(() => {
    checkStorage()
    const timer = setInterval(checkStorage, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [checkStorage])

  useEffect(() => {
    if (synced > 0) checkStorage()
  }, [synced, checkStorage])

  // تسجيل Background Sync: يحاول استكمال الطابور عند عودة الاتصال حتى لو أُغلق المتصفح
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.ready
        const regWithSync = reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }
        if (regWithSync.sync) await regWithSync.sync.register('psale-queue')
      } catch {
        // المتصفح لا يدعم Background Sync (مثل Safari) — الطابور اليدوي يبقى كحل أساسي
      }
    }
    register()
  }, [synced])

  const value = useMemo<SyncContextValue>(
    () => ({
      online,
      syncing,
      pending,
      synced,
      lastSyncAt,
      conflicts,
      syncNow,
      retry,
      discard,
      storageLevel,
      storagePercent,
      showWarningModal,
      setShowWarningModal,
    }),
    [online, syncing, pending, synced, lastSyncAt, conflicts, syncNow, retry, discard, storageLevel, storagePercent, showWarningModal]
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
