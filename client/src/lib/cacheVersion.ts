import { metaGet, metaSet, deleteMetaKeys, getAllMetaKeys } from './db'

const CACHE_VERSION_PREFIX = 'cache_version:'

export async function getCacheVersion(entity: string): Promise<number> {
  const version = await metaGet<number>(`${CACHE_VERSION_PREFIX}${entity}`)
  return version ?? 0
}

export async function incCacheVersion(entity: string): Promise<number> {
  const current = await getCacheVersion(entity)
  const next = current + 1
  await metaSet(`${CACHE_VERSION_PREFIX}${entity}`, next)
  return next
}

export async function clearAllCacheVersions(): Promise<void> {
  const allKeys = await getAllMetaKeys()
  const versionKeys = allKeys.filter((k) => k.startsWith(CACHE_VERSION_PREFIX))
  if (versionKeys.length > 0) {
    await deleteMetaKeys(versionKeys)
  }
}