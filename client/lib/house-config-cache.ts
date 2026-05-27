import type { HouseConfig } from './api'

const HOUSE_CONFIG_CACHE_EVENT = 'bill-manager-house-configs-updated'
const SESSION_STORAGE_KEY = 'bill-manager-house-configs'

function hasWindow() {
  return typeof window !== 'undefined'
}

export function readHouseConfigSessionCache(): HouseConfig[] {
  if (!hasWindow()) return []
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HouseConfig[]
  } catch {
    return []
  }
}

export function writeHouseConfigSessionCache(configs: HouseConfig[]): void {
  if (hasWindow()) {
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(configs))
    } catch {
      // Storage full or unavailable
    }
  }
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
}

export function clearHouseConfigSessionCache(): void {
  if (hasWindow()) {
    try {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // Ignore
    }
  }
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
}

export function removeHouseConfigSessionCacheByHouseId(houseId: number): void {
  if (!hasWindow()) return
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return
    const configs = JSON.parse(raw) as HouseConfig[]
    const filtered = configs.filter((config) => config.houseId !== houseId)
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(filtered))
  } catch {
    // Ignore
  }
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
}

export function subscribeHouseConfigSessionCache(listener: () => void): () => void {
  if (!hasWindow()) return () => {}

  window.addEventListener(HOUSE_CONFIG_CACHE_EVENT, listener)
  return () => window.removeEventListener(HOUSE_CONFIG_CACHE_EVENT, listener)
}
