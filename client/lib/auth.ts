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
  loginAt: string
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
}

export function getAuthHeader(): Record<string, string> {
  const session = getSessionAuth()
  if (!session?.token) return {}
  return { Authorization: `Bearer ${session.token}` }
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
 * POST /auth/login
 * Returns the stored SessionAuth on success.
 * Throws Error with a human-readable message on failure.
 */
export async function apiLogin(
  username: string,
  password: string,
): Promise<SessionAuth> {
  const res = await fetchApi('/auth/login', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })

  const data = await handleResponse<{
    access_token: string
    user: {
      uuid: string
      username: string
      email: string
      role: AppRole
      isVerified: boolean
    }
  }>(res)

  const session: SessionAuth = {
    token: data.access_token,
    uuid: data.user.uuid,
    username: data.user.username,
    email: data.user.email,
    role: data.user.role,
    isVerified: data.user.isVerified,
    loginAt: new Date().toISOString(),
  }

  saveSessionAuth(session)
  return session
}

/**
 * POST /auth/register
 * Registers the user then auto-logs-in to obtain a JWT.
 * Returns the stored SessionAuth on success.
 * Throws Error with a human-readable message on failure.
 */
export async function apiRegister(
  username: string,
  password: string,
): Promise<SessionAuth> {
  const safeUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '') || 'user';
  const email = `${safeUsername}@bill-manager.local`;

  const res = await fetchApi('/auth/register', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  })

  await handleResponse<unknown>(res) // throws on conflict / validation error

  // Auto-login after registration to get the JWT
  return apiLogin(username, password)
}
