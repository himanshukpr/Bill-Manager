import type { HouseConfig } from './api'

const HOUSE_CONFIG_CACHE_KEY = 'bill-manager-house-configs'
const HOUSE_CONFIG_CACHE_EVENT = 'bill-manager-house-configs-updated'

function hasWindow() {
  return typeof window !== 'undefined'
}

export function readHouseConfigSessionCache(): HouseConfig[] {
  if (!hasWindow()) return []

  try {
    const raw = window.sessionStorage.getItem(HOUSE_CONFIG_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HouseConfig[]) : []
  } catch {
    return []
  }
}

export function writeHouseConfigSessionCache(configs: HouseConfig[]): void {
  if (!hasWindow()) return

  try {
    window.sessionStorage.setItem(HOUSE_CONFIG_CACHE_KEY, JSON.stringify(configs))
    window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
  } catch {
    // Best-effort cache only.
  }
}

export function clearHouseConfigSessionCache(): void {
  if (!hasWindow()) return

  try {
    window.sessionStorage.removeItem(HOUSE_CONFIG_CACHE_KEY)
    window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
  } catch {
    // Best-effort cache only.
  }
}

export function subscribeHouseConfigSessionCache(listener: () => void): () => void {
  if (!hasWindow()) return () => {}

  window.addEventListener(HOUSE_CONFIG_CACHE_EVENT, listener)
  return () => window.removeEventListener(HOUSE_CONFIG_CACHE_EVENT, listener)
}
