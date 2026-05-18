import type { HouseConfig } from './api'

const HOUSE_CONFIG_CACHE_EVENT = 'bill-manager-house-configs-updated'

let inMemoryConfigs: HouseConfig[] = []

function hasWindow() {
  return typeof window !== 'undefined'
}

export function readHouseConfigSessionCache(): HouseConfig[] {
  return inMemoryConfigs.slice()
}

export function writeHouseConfigSessionCache(configs: HouseConfig[]): void {
  inMemoryConfigs = Array.isArray(configs) ? configs.slice() : []
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
}

export function clearHouseConfigSessionCache(): void {
  inMemoryConfigs = []
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
}

export function removeHouseConfigSessionCacheByHouseId(houseId: number): void {
  inMemoryConfigs = inMemoryConfigs.filter((config) => config.houseId !== houseId)
  if (hasWindow()) window.dispatchEvent(new Event(HOUSE_CONFIG_CACHE_EVENT))
}

export function subscribeHouseConfigSessionCache(listener: () => void): () => void {
  if (!hasWindow()) return () => {}

  window.addEventListener(HOUSE_CONFIG_CACHE_EVENT, listener)
  return () => window.removeEventListener(HOUSE_CONFIG_CACHE_EVENT, listener)
}
