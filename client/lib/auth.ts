import { fetchApi } from './api-base'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AppRole = "admin" | "supplier" | "member"

export type SessionAuth = {
  token: string
  uuid: string
  username: string
  email?: string
  role: AppRole
  isVerified: boolean
  permissions?: Record<string, boolean>
  loginAt: string
  impersonator?: string
  dairyId: number
  planExpiry?: string | null
  maxHouses?: number | null
}

export type DairyInfo = {
  id: number
  name: string
  email: string
  phone?: string
  address?: string
  ownerName?: string
  isActive?: boolean
  planExpiry?: string | null
  maxHouses?: number | null
  createdAt?: string
  _count?: { houses: number }
}

export type DairySession = {
  dairyToken: string
  dairyId: number
  dairyName: string
  dairyEmail: string
  planExpiry?: string | null
  maxHouses?: number | null
}

export type SavedProfile = SessionAuth & {
  profileId: string
  dairyName?: string
  savedAt: string
}

export const MAX_SAVED_PROFILES = 8

const PROFILES_KEY = "bill-manager-profiles"

export function profileIdForSession(auth: Pick<SessionAuth, "dairyId" | "uuid">): string {
  return `${auth.dairyId}:${auth.uuid}`
}

export function listSavedProfiles(): SavedProfile[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedProfile[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((profile) => Boolean(profile?.token && profile?.uuid && profile?.dairyId))
  } catch {
    return []
  }
}

function writeSavedProfiles(profiles: SavedProfile[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.slice(0, MAX_SAVED_PROFILES)))
    window.dispatchEvent(new Event("bill-manager-profiles-updated"))
  } catch { /* noop */ }
}

export function upsertSavedProfile(auth: SessionAuth, dairyName?: string): SavedProfile[] {
  const profileId = profileIdForSession(auth)
  const existing = listSavedProfiles()
  const sameProfile = existing.find((profile) => profile.profileId === profileId)
  const sameDairy = existing.find((profile) => profile.dairyId === auth.dairyId && profile.dairyName)
  const next: SavedProfile = {
    ...auth,
    profileId,
    dairyName: dairyName ?? sameProfile?.dairyName ?? sameDairy?.dairyName,
    savedAt: new Date().toISOString(),
  }
  const rest = existing.filter((profile) => profile.profileId !== profileId)
  const updated = [next, ...rest].slice(0, MAX_SAVED_PROFILES)
  writeSavedProfiles(updated)
  return updated
}

export function removeSavedProfile(profileId: string): SavedProfile[] {
  const updated = listSavedProfiles().filter((profile) => profile.profileId !== profileId)
  writeSavedProfiles(updated)
  return updated
}

export function removeSavedProfilesForDairy(dairyId: number): SavedProfile[] {
  const updated = listSavedProfiles().filter((profile) => profile.dairyId !== dairyId)
  writeSavedProfiles(updated)
  return updated
}

/** Remove the active remembered profile without touching other accounts. */
export function removeActiveSavedProfile(): SavedProfile[] {
  if (typeof window === "undefined") return []
  const active = getSessionAuth()
  if (active) removeSavedProfile(profileIdForSession(active))
  clearSessionAuth()
  return listSavedProfiles()
}

/** Drop every remembered login for an expired dairy and deactivate it. */
export function handleExpiredDairySession(): void {
  if (typeof window === "undefined") return
  const active = getSessionAuth()
  if (active) removeSavedProfilesForDairy(active.dairyId)
  clearSessionAuth()
  clearDairySession()
}

/** Remove one remembered profile and deactivate it if it is active. */
export function logoutSavedProfile(profileId?: string): void {
  if (typeof window === "undefined") return
  const active = getSessionAuth()
  const targetId = profileId ?? (active ? profileIdForSession(active) : null)
  if (targetId) removeSavedProfile(targetId)
  if (!profileId || (active && profileIdForSession(active) === targetId)) {
    clearSessionAuth()
  }
}

// ─── Cookie helpers (used by Edge Middleware) ─────────────────────────────────

function setCookie(name: string, value: string, days = 7): void {
  if (typeof document === "undefined") return
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}

function deleteCookie(name: string): void {
  if (typeof document === "undefined") return
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`
}

export function getDairyIdFromCookie(): number | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)bill-manager-dairy-id=(\d+)/)
  return match ? Number(match[1]) : null
}

// ─── Storage helpers (localStorage only) ─────────────────────────────────────

const STORAGE_KEY = "bill-manager-auth"

export function saveSessionAuth(auth: SessionAuth): void {
  if (typeof window === "undefined") return
  const serialized = JSON.stringify(auth)
  try { window.localStorage.setItem(STORAGE_KEY, serialized) } catch { /* noop */ }
  // Remember this login separately so users can switch dairies/profiles
  // without losing the other sessions.
  upsertSavedProfile(auth)
  // Write cookies so Next.js Edge Middleware can read them
  setCookie("bill-manager-token", auth.token)
  setCookie("bill-manager-role", auth.role)
  setCookie("bill-manager-verified", String(auth.isVerified))
  setCookie("bill-manager-dairy-id", String(auth.dairyId))
  setCookie("bill-manager-plan-expiry", auth.planExpiry || "")
}

export function getSessionAuth(): SessionAuth | null {
  if (typeof window === "undefined") return null
  let raw: string | null = null
  try { raw = window.localStorage.getItem(STORAGE_KEY) } catch { /* noop */ }
  if (!raw) {
    try {
      raw = window.sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        try { window.localStorage.setItem(STORAGE_KEY, raw) } catch { /* noop */ }
        try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
      }
    } catch { /* noop */ }
  }
  if (!raw) return null
  try { return JSON.parse(raw) as SessionAuth } catch { return null }
}

export function clearSessionAuth(): void {
  if (typeof window === "undefined") return
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
  // Clear only the active user session. Remembered profiles are intentionally
  // retained so the user can switch back without entering credentials again.
  deleteCookie("bill-manager-token")
  deleteCookie("bill-manager-role")
  deleteCookie("bill-manager-verified")
  // bill-manager-dairy-id is kept — it identifies which dairy the user was in
}

export function clearAllAuth(): void {
  if (typeof window === "undefined") return
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
  try { window.localStorage.removeItem(PROFILES_KEY) } catch { /* noop */ }
  try { window.localStorage.removeItem(DAIRY_STORAGE_KEY) } catch { /* noop */ }
  deleteCookie("bill-manager-token")
  deleteCookie("bill-manager-role")
  deleteCookie("bill-manager-verified")
  deleteCookie("bill-manager-dairy-id")
  deleteCookie("bill-manager-dairy-token")
  deleteCookie("bill-manager-plan-expiry")
}

export function getAuthHeader(): Record<string, string> {
  const session = getSessionAuth()
  if (!session?.token) return {}
  return { Authorization: `Bearer ${session.token}` }
}

// ─── Dairy Session (dairy-level auth, separate from user auth) ───────────────

export const DAIRY_STORAGE_KEY = "bill-manager-dairy-session"

export function saveDairySession(dairy: DairySession): void {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(DAIRY_STORAGE_KEY, JSON.stringify(dairy)) } catch { /* noop */ }
  setCookie("bill-manager-dairy-token", dairy.dairyToken)
  setCookie("bill-manager-dairy-id", String(dairy.dairyId))
  setCookie("bill-manager-plan-expiry", dairy.planExpiry || "")
}

export function getDairySession(): DairySession | null {
  if (typeof window === "undefined") return null
  let raw: string | null = null
  try { raw = window.localStorage.getItem(DAIRY_STORAGE_KEY) } catch { /* noop */ }
  if (!raw) return null
  try { return JSON.parse(raw) as DairySession } catch { return null }
}

export function clearDairySession(): void {
  if (typeof window === "undefined") return
  try { window.localStorage.removeItem(DAIRY_STORAGE_KEY) } catch { /* noop */ }
  deleteCookie("bill-manager-dairy-token")
  deleteCookie("bill-manager-dairy-id")
  deleteCookie("bill-manager-plan-expiry")
}

/**
 * Returns true when the browser still holds a dairy cookie for the given dairy.
 * The dairy JWT itself is long-lived; a missing cookie usually means the
 * 7-day cookie lapsed or was cleared, not that the dairy password changed.
 */
export function hasDairyCookie(dairyId: number): boolean {
  if (typeof document === "undefined") return false
  const token = document.cookie.match(/(?:^|;\s*)bill-manager-dairy-token=([^;]+)/)
  const id = document.cookie.match(/(?:^|;\s*)bill-manager-dairy-id=(\d+)/)
  return Boolean(token?.[1]) && Number(id?.[1]) === dairyId
}

/**
 * Re-issue dairy cookies from the persisted dairy session.
 * localStorage survives longer than the 7-day cookies, so a valid dairy
 * session can be restored without asking for the dairy password again.
 */
export function syncDairySessionCookies(): DairySession | null {
  const dairy = getDairySession()
  if (!dairy) return null
  setCookie("bill-manager-dairy-token", dairy.dairyToken)
  setCookie("bill-manager-dairy-id", String(dairy.dairyId))
  setCookie("bill-manager-plan-expiry", dairy.planExpiry || "")
  return dairy
}

// ─── Destination helper ───────────────────────────────────────────────────────

export function dashboardPath(role: AppRole): string {
  if (role === "admin") return "/dashboard/admin"
  if (role === "supplier") return "/dashboard/supplier"
  return "/dashboard/member"
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export type ApiError = { message: string | string[]; statusCode: number }

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = body as ApiError
    const msg = Array.isArray(err.message) ? err.message[0] : err.message ?? "Unknown error"
    if (msg === 'PLAN_EXPIRED') {
      if (typeof window !== 'undefined' && !window.location.search.includes('plan-expired=1')) {
        handleExpiredDairySession()
        window.location.replace('/?plan-expired=1')
      }
      throw new Error('PLAN_EXPIRED')
    }
    throw new Error(msg)
  }
  return body as T
}

/**
 * GET /dairies
 * Lists all registered dairies
 */
/**
 * GET /dairies/:id
 * Fetches details for a single dairy (public).
 */
export async function apiGetDairy(id: number): Promise<DairyInfo> {
  const res = await fetchApi(`/dairies/${id}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })
  return handleResponse<DairyInfo>(res)
}

export async function apiListDairies(): Promise<DairyInfo[]> {
  const res = await fetchApi('/dairies', {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })
  return handleResponse<DairyInfo[]>(res)
}

/**
 * POST /auth/dairy/login
 * Authenticates a dairy by email + password.
 * Returns a dairy-scoped token (not a user token).
 */
export async function apiDairyLogin(email: string, password: string): Promise<DairySession> {
  const res = await fetchApi('/auth/dairy/login', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  const data = await handleResponse<{
    access_token: string
    dairy: { id: number; name: string; email: string; planExpiry?: string | null; maxHouses?: number | null }
  }>(res)

  const dairySession: DairySession = {
    dairyToken: data.access_token,
    dairyId: data.dairy.id,
    dairyName: data.dairy.name,
    dairyEmail: data.dairy.email,
    planExpiry: data.dairy.planExpiry,
    maxHouses: data.dairy.maxHouses,
  }

  saveDairySession(dairySession)
  return dairySession
}

/**
 * POST /auth/dairy/register
 * Registers a new dairy with an admin user account.
 */
export async function apiDairyRegister(dto: {
  dairyName: string
  email: string
  phone?: string
  address?: string
  username: string
  password: string
  ownerName?: string
}): Promise<SessionAuth> {
  const res = await fetchApi('/auth/dairy/register', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  })

  const data = await handleResponse<{
    access_token: string
    user: {
      uuid: string
      username: string
      email: string
      role: AppRole
      isVerified: boolean
      dairyId: number
    }
  }>(res)

  const session: SessionAuth = {
    token: data.access_token,
    uuid: data.user.uuid,
    username: data.user.username,
    email: data.user.email,
    role: data.user.role,
    isVerified: data.user.isVerified,
    permissions: (data.user as { permissions?: Record<string, boolean> }).permissions,
    loginAt: new Date().toISOString(),
    dairyId: data.user.dairyId,
  }

  const { clearProfileScopedCaches } = await import('./account-switch')
  await clearProfileScopedCaches()
  saveSessionAuth(session)
  return session
}

/**
 * POST /auth/login
 * Logs in a user within a specific dairy.
 * Returns the stored SessionAuth on success.
 */
export async function apiLogin(
  username: string,
  password: string,
  dairyId?: number,
): Promise<SessionAuth> {
  const res = await fetchApi('/auth/login', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, dairyId }),
  })

  const data = await handleResponse<{
    access_token: string
    user: {
      uuid: string
      username: string
      email: string
      role: AppRole
      isVerified: boolean
      dairyId: number
      planExpiry?: string | null
      maxHouses?: number | null
    }
  }>(res)

  const session: SessionAuth = {
    token: data.access_token,
    uuid: data.user.uuid,
    username: data.user.username,
    email: data.user.email,
    role: data.user.role,
    isVerified: data.user.isVerified,
    permissions: (data.user as { permissions?: Record<string, boolean> }).permissions,
    loginAt: new Date().toISOString(),
    dairyId: data.user.dairyId,
    planExpiry: data.user.planExpiry,
    maxHouses: data.user.maxHouses,
  }

  const { clearProfileScopedCaches } = await import('./account-switch')
  await clearProfileScopedCaches()
  saveSessionAuth(session)
  return session
}

/**
 * POST /auth/register
 * Registers a new user within a dairy and auto-logs-in.
 */
export async function apiRegister(
  username: string,
  password: string,
  dairyId?: number,
): Promise<SessionAuth> {
  const res = await fetchApi('/auth/register', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, dairyId }),
  })

  await handleResponse<unknown>(res) // throws on conflict / validation error

  // Auto-login after registration to get the JWT
  return apiLogin(username, password, dairyId)
}

/**
 * POST /auth/impersonate/:uuid
 * Admin-only: returns a new session for the target supplier.
 */
export async function apiImpersonate(uuid: string): Promise<SessionAuth> {
  const session = getSessionAuth()
  if (!session) throw new Error('Not authenticated')

  const res = await fetchApi(`/auth/impersonate/${uuid}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
  })

  const data = await handleResponse<{
    access_token: string
    user: {
      uuid: string
      username: string
      email: string
      role: AppRole
      isVerified: boolean
      dairyId: number
    }
  }>(res)

  const impersonated: SessionAuth = {
    token: data.access_token,
    uuid: data.user.uuid,
    username: data.user.username,
    email: data.user.email,
    role: data.user.role,
    isVerified: data.user.isVerified,
    permissions: (data.user as { permissions?: Record<string, boolean> }).permissions,
    loginAt: new Date().toISOString(),
    impersonator: session.uuid,
    dairyId: data.user.dairyId,
  }

  return impersonated
}

/** Save the current admin session to sessionStorage under the given key */
export function saveAdminSession(key: string, auth: SessionAuth): void {
  if (typeof window === "undefined") return
  try { window.sessionStorage.setItem(key, JSON.stringify(auth)) } catch { /* noop */ }
}

/** Restore and activate a saved admin session from sessionStorage */
export function restoreAdminSession(key: string): SessionAuth | null {
  if (typeof window === "undefined") return null
  let raw: string | null = null
  try { raw = window.sessionStorage.getItem(key) } catch { /* noop */ }
  if (!raw) return null
  try { return JSON.parse(raw) as SessionAuth } catch { return null }
}

/** Remove a saved admin session from sessionStorage */
export function removeAdminSession(key: string): void {
  if (typeof window === "undefined") return
  try { window.sessionStorage.removeItem(key) } catch { /* noop */ }
}

export async function apiValidatePassword(username: string, password: string): Promise<boolean> {
  try {
    const session = getSessionAuth()
    const res = await fetchApi('/auth/validate-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, dairyId: session?.dairyId }),
    })
    if (!res.ok) return false
    const data = await res.json() as { valid: boolean }
    return data.valid
  } catch {
    return false
  }
}

export async function apiValidateDairyPassword(password: string): Promise<boolean> {
  try {
    const session = getSessionAuth()
    if (!session?.token) return false
    const res = await fetchApi('/auth/validate-dairy-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) return false
    const data = await res.json() as { valid: boolean }
    return data.valid
  } catch {
    return false
  }
}
