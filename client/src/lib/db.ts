// غلاف بسيط لـ IndexedDB بدون مكتبات خارجية — أساس محرك الأوفلاين
// المخازن: syncQueue (أوامر مزامنة معلقة) + cached (نسخ مؤقتة للبيانات) + meta

const DB_NAME = 'psale_ultra_offline'
const DB_VERSION = 1

export interface QueueItem {
  id?: number
  entity: string
  action: 'create' | 'update' | 'delete'
  recordId?: number
  data: unknown
  createdAt: number
  attempts: number
  synced: boolean
  error?: string
  /** نطاق العزل (User + Branch): يملؤه العميل من الجلسة ويُتحقق منه في السيرفر */
  userId?: number | null
  branchId?: number | null
}

interface CachedDoc {
  key: string
  data: unknown
  updatedAt: number
  version: number
}

export interface SyncStats {
  pending: number
  synced: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
        store.createIndex('synced', 'synced', { unique: false })
      }
      if (!db.objectStoreNames.contains('cached')) {
        const store = db.createObjectStore('cached', { keyPath: 'key' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const req = fn(tx.objectStore(storeName))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

// ============ Sync Queue ============

export async function enqueue(
  entity: string,
  action: QueueItem['action'],
  data: unknown,
  recordId?: number,
  scope?: { userId?: number | null; branchId?: number | null }
): Promise<number> {
  const item: QueueItem = {
    entity,
    action,
    recordId,
    data,
    createdAt: Date.now(),
    attempts: 0,
    synced: false,
    userId: scope?.userId ?? null,
    branchId: scope?.branchId ?? null,
  }
  const id = await withStore<IDBValidKey>('syncQueue', 'readwrite', (store) => store.add(item))
  return Number(id)
}

export async function getPendingQueue(): Promise<QueueItem[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly')
    const req = tx.objectStore('syncQueue').getAll()
    req.onsuccess = () => {
      const items = (req.result as QueueItem[])
        .filter((i) => !i.synced)
        .sort((a, b) => a.createdAt - b.createdAt)
      resolve(items)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function markSynced(id: number): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite')
    const store = tx.objectStore('syncQueue')
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const item = getReq.result as QueueItem | undefined
      if (item) {
        item.synced = true
        item.attempts += 1
        store.put(item)
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function markFailed(id: number, error: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite')
    const store = tx.objectStore('syncQueue')
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const item = getReq.result as QueueItem | undefined
      if (item) {
        item.error = error
        item.attempts += 1
        store.put(item)
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function removeQueueItem(id: number): Promise<void> {
  await withStore('syncQueue', 'readwrite', (store) => store.delete(id))
}

export async function syncStats(): Promise<SyncStats> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly')
    const store = tx.objectStore('syncQueue')
    const allReq = store.getAll()
    allReq.onsuccess = () => {
      const all = allReq.result as QueueItem[]
      resolve({
        pending: all.filter((i) => !i.synced).length,
        synced: all.filter((i) => i.synced).length,
      })
    }
    allReq.onerror = () => reject(allReq.error)
    tx.oncomplete = () => db.close()
  })
}

// ============ Storage Quota ============

export interface StorageEstimate {
  usage: number
  quota: number
  percent: number
}

/** تقدير حصة التخزين الحالية (IndexedDB + cache) ونسبة الاستهلاك */
export async function estimateStorage(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !('storage' in navigator) || !navigator.storage?.estimate) {
    return null
  }
  const { usage, quota } = await navigator.storage.estimate()
  const used = usage ?? 0
  const total = quota ?? 0
  return {
    usage: used,
    quota: total,
    percent: total > 0 ? (used / total) * 100 : 0,
  }
}

// ============ Cache (نسخ مؤقتة للعرض دون اتصال) ============

export async function cacheSet(key: string, data: unknown): Promise<void> {
  const doc: CachedDoc = { key, data, updatedAt: Date.now(), version: 0 }
  await withStore('cached', 'readwrite', (store) => store.put(doc))
}

export async function cacheSetWithVersion(key: string, data: unknown, version: number): Promise<void> {
  const doc: CachedDoc = { key, data, updatedAt: Date.now(), version }
  await withStore('cached', 'readwrite', (store) => store.put(doc))
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const doc = await withStore<CachedDoc | undefined>('cached', 'readonly', (store) =>
    store.get(key)
  )
  return doc?.data as T | undefined
}

export async function cacheGetWithVersion<T>(key: string): Promise<{ data: T; version: number } | undefined> {
  const doc = await withStore<CachedDoc | undefined>('cached', 'readonly', (store) =>
    store.get(key)
  )
  if (!doc) return undefined
  return { data: doc.data as T, version: doc.version ?? 0 }
}

/** حذف جميع مفاتيح الكاش التي تبدأ بمبادئة معينة */
export async function invalidateCache(prefix: string): Promise<void> {
  const allKeys = await cacheGetAllKeys()
  const doomed = allKeys.filter((k) => k.startsWith(prefix))
  if (doomed.length > 0) await deleteCachedKeys(doomed)
}

/** إبطال كاش الكيانات الأساسية بعد المزامنة */
export async function invalidateEntityCaches(entity: string): Promise<void> {
  const prefixes = [
    `${entity}:`,
    `table:${entity}:`,
    `reports:`,
    `dashboard:`,
  ]
  for (const p of prefixes) {
    await invalidateCache(p)
  }
}

export async function cacheGetAll<T>(prefix: string): Promise<T[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached', 'readonly')
    const store = tx.objectStore('cached')
    const req = store.getAll()
    req.onsuccess = () => {
      const docs = req.result as CachedDoc[]
      resolve(docs.filter((d) => d.key.startsWith(prefix)).map((d) => d.data as T))
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** جلب كل مفاتيح الكاش التي تبدأ ببادئة معينة (للتنظيف الدوري حسب نطاق المستخدم) */
export async function cacheGetAllKeys(prefix = ''): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached', 'readonly')
    const store = tx.objectStore('cached')
    const req = store.getAllKeys()
    req.onsuccess = () => {
      const keys = (req.result as IDBValidKey[]).map(String)
      resolve(prefix ? keys.filter((k) => k.startsWith(prefix)) : keys)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** حذف مفاتيح كاش محددة (للتنظيف الدوري — لا تُمس نطاقات أخرى) */
export async function deleteCachedKeys(keys: string[]): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('cached', 'readwrite')
    const store = tx.objectStore('cached')
    for (const key of keys) store.delete(key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

// ============ Meta ============

export async function metaGet<T>(key: string): Promise<T | undefined> {
  return withStore<T | undefined>('meta', 'readonly', (store) => store.get(key))
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  await withStore('meta', 'readwrite', (store) => store.put(value, key))
}

export async function deleteMetaKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await withStore('meta', 'readwrite', (store) => {
    for (const key of keys) store.delete(key)
    return store.getAllKeys()
  })
}

export async function getAllMetaKeys(): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly')
    const req = tx.objectStore('meta').getAllKeys()
    req.onsuccess = () => {
      resolve(req.result as string[])
      db.close()
    }
    req.onerror = () => {
      reject(req.error)
      db.close()
    }
  })
}

export async function clearOfflineData(): Promise<void> {
  const db = await openDb()
  await Promise.all(
    ['syncQueue', 'cached', 'meta'].map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(name, 'readwrite')
          tx.objectStore(name).clear()
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
    )
  )
  db.close()
}

// مسح شامل بعد تفريغ قاعدة البيانات (منطقة الخطر): يفرّغ المخازن ثم يحذف قاعدة IndexedDB
export async function resetOfflineStorage(): Promise<void> {
  try {
    await clearOfflineData()
  } catch {
    // نتجاهل أخطاء الفراغ (قد لا توجد قاعدة بعد)
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}
