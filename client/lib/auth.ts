import { fetchApi } from './api-base'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AppRole = "admin" | "supplier" | "member"

export type SessionAuth = {
  token: string
  uuid: string
  username: string
  email: string
  role: AppRole
  isVerified: boolean
  permissions?: Record<string, boolean>
  loginAt: string
  impersonator?: string
  dairyId: number
}

export type DairyInfo = {
  id: number
  name: string
  email: string
  phone?: string
  address?: string
  ownerName?: string
  isActive?: boolean
  createdAt?: string
}

export type DairySession = {
  dairyToken: string
  dairyId: number
  dairyName: string
  dairyEmail: string
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

// ─── Storage helpers (localStorage only) ─────────────────────────────────────

const STORAGE_KEY = "bill-manager-auth"

export function saveSessionAuth(auth: SessionAuth): void {
  if (typeof window === "undefined") return
  const serialized = JSON.stringify(auth)
  try { window.localStorage.setItem(STORAGE_KEY, serialized) } catch { /* noop */ }
  // Write cookies so Next.js Edge Middleware can read them
  setCookie("bill-manager-token", auth.token)
  setCookie("bill-manager-role", auth.role)
  setCookie("bill-manager-verified", String(auth.isVerified))
  setCookie("bill-manager-dairy-id", String(auth.dairyId))
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
  // Clear cookies so middleware stops protecting immediately
  deleteCookie("bill-manager-token")
  deleteCookie("bill-manager-role")
  deleteCookie("bill-manager-verified")
  deleteCookie("bill-manager-dairy-id")
}

export function getAuthHeader(): Record<string, string> {
  const session = getSessionAuth()
  if (!session?.token) return {}
  return { Authorization: `Bearer ${session.token}` }
}

// ─── Dairy Session (dairy-level auth, separate from user auth) ───────────────

const DAIRY_STORAGE_KEY = "bill-manager-dairy-session"

export function saveDairySession(dairy: DairySession): void {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(DAIRY_STORAGE_KEY, JSON.stringify(dairy)) } catch { /* noop */ }
  setCookie("bill-manager-dairy-token", dairy.dairyToken)
  setCookie("bill-manager-dairy-id", String(dairy.dairyId))
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
    dairy: { id: number; name: string; email: string }
  }>(res)

  const dairySession: DairySession = {
    dairyToken: data.access_token,
    dairyId: data.dairy.id,
    dairyName: data.dairy.name,
    dairyEmail: data.dairy.email,
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
  const safeUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '') || 'user';
  const email = `${safeUsername}@bill-manager.local`;

  const res = await fetchApi('/auth/register', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password, dairyId }),
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
