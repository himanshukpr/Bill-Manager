import type { HouseConfig } from './api'
import { db } from './db'

const HOUSE_CONFIG_CACHE_EVENT = 'bill-manager-house-configs-updated'

let inMemoryConfigs: HouseConfig[] = []

function hasWindow() {
  return typeof window !== 'undefined'
}

// Load persisted Dexie cache into memory (best-effort, async)
;(async () => {
  try {
    const rows = await db.houseConfigs.toArray()
    if (Array.isArray(rows) && rows.length > 0) {
      inMemoryConfigs = rows
      if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
    }
  } catch {
    // ignore
  }
})()

export function readHouseConfigSessionCache(): HouseConfig[] {
  return inMemoryConfigs.slice()
}

export function writeHouseConfigSessionCache(configs: HouseConfig[]): void {
  inMemoryConfigs = Array.isArray(configs) ? configs.slice() : []
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))

  // Persist asynchronously to Dexie (site cache)
  void (async () => {
    try {
      await db.transaction('rw', db.houseConfigs, async () => {
        await db.houseConfigs.clear()
        if (inMemoryConfigs.length > 0) await db.houseConfigs.bulkPut(inMemoryConfigs)
      })
    } catch {
      // best-effort
    }
  })()
}

export function clearHouseConfigSessionCache(): void {
  inMemoryConfigs = []
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))

  void (async () => {
    try {
      await db.houseConfigs.clear()
    } catch {
      // ignore
    }
  })()
}

export function removeHouseConfigSessionCacheByHouseId(houseId: number): void {
  inMemoryConfigs = inMemoryConfigs.filter((config) => config.houseId !== houseId)
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))

  void (async () => {
    try {
      await db.houseConfigs.where('houseId').equals(houseId).delete()
    } catch {
      // ignore
    }
  })()
}

export function subscribeHouseConfigSessionCache(listener: () => void): () => void {
  if (!hasWindow()) return () => {}

  window.addEventListener(HOUSE_CONFIG_CACHE_EVENT, listener)
  return () => window.removeEventListener(HOUSE_CONFIG_CACHE_EVENT, listener)
}
