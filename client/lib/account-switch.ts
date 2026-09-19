'use client'

import {
  dashboardPath,
  getSessionAuth,
  listSavedProfiles,
  saveSessionAuth,
  upsertSavedProfile,
  type SavedProfile,
  type SessionAuth,
} from './auth'
import { clearHouseConfigSessionCache } from './house-config-cache'

export type { SavedProfile }

export function profileLabel(profile: SavedProfile): string {
  return profile.dairyName ?? `Dairy ${profile.dairyId}`
}

function sessionFromProfile(profile: SavedProfile): SessionAuth {
  return {
    token: profile.token,
    uuid: profile.uuid,
    username: profile.username,
    email: profile.email,
    role: profile.role,
    isVerified: profile.isVerified,
    permissions: profile.permissions,
    loginAt: profile.loginAt,
    impersonator: profile.impersonator,
    dairyId: profile.dairyId,
    planExpiry: profile.planExpiry,
    maxHouses: profile.maxHouses,
  }
}

export async function clearProfileScopedCaches(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const { resetAccountQueryState } = await import('./api')
    await resetAccountQueryState()
  } catch {
    // Ignore cache-clear failures; the next load will refetch.
    clearHouseConfigSessionCache()
  }
  clearHouseConfigSessionCache()
  try {
    window.sessionStorage.removeItem('adminSession')
  } catch {
    // Ignore storage failures.
  }
}

/** Activate a remembered profile without requiring its password again. */
export async function switchSavedProfile(profileId: string): Promise<SessionAuth | null> {
  const target = listSavedProfiles().find((profile) => profile.profileId === profileId)
  if (!target) return null
  const session = sessionFromProfile(target)
  upsertSavedProfile(session, target.dairyName)
  saveSessionAuth(session)
  await clearProfileScopedCaches()
  window.location.replace(dashboardPath(session.role))
  return session
}

export function addAccountHref(): string {
  return '/?add-account=1'
}

export async function refreshProfileDairyNames(
  profiles: SavedProfile[],
  onUpdate: (profiles: SavedProfile[]) => void,
): Promise<void> {
  if (typeof window === 'undefined') return
  const missing = profiles.filter((profile) => !profile.dairyName)
  if (missing.length === 0) return
  try {
    const { apiGetDairy } = await import('./auth')
    const updates = await Promise.all(
      missing.map(async (profile) => {
        try {
          const dairy = await apiGetDairy(profile.dairyId)
          return { profileId: profile.profileId, dairyName: dairy.name }
        } catch {
          return null
        }
      }),
    )
    let changed = false
    let current = listSavedProfiles()
    for (const update of updates) {
      if (!update) continue
      const existing = current.find((profile) => profile.profileId === update.profileId)
      if (existing && !existing.dairyName) {
        current = upsertSavedProfile(sessionFromProfile(existing), update.dairyName)
        changed = true
      }
    }
    if (changed) onUpdate(current)
  } catch {
    // Dairy names are a display nicety; profiles remain usable without them.
  }
}

export function currentSessionSnapshot(): SessionAuth | null {
  return getSessionAuth()
}
