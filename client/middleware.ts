import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// ─── Route → required role mapping ───────────────────────────────────────────
const ROLE_ROUTES: Record<string, string> = {
  "/dashboard/admin": "admin",
  "/dashboard/supplier": "supplier",
  "/dashboard/member": "member",
}

// Pages only for unauthenticated users
function matchAuthPage(pathname: string): boolean {
  if (pathname === "/" || pathname === "/signup") return true
  if (/^\/dairy\/\d+\/(auth|users|register)$/.test(pathname)) return true
  return false
}

function clearCookieResponse(response: NextResponse, name: string): void {
  response.cookies.set(name, "", { expires: new Date(0), path: "/" })
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  const token = request.cookies.get("bill-manager-token")?.value
  const role = request.cookies.get("bill-manager-role")?.value
  const verified = request.cookies.get("bill-manager-verified")?.value
  const dairyToken = request.cookies.get("bill-manager-dairy-token")?.value
  const dairyId = request.cookies.get("bill-manager-dairy-id")?.value
  const planExpiry = request.cookies.get("bill-manager-plan-expiry")?.value

  const isLoggedIn = Boolean(token && role)
  const isDairyAuthed = Boolean(dairyToken)
  const isDashboard = pathname.startsWith("/dashboard")
  const isAuthPage = matchAuthPage(pathname)
  const isPendingPage = pathname === "/pending"
  const isDairyAuth = /^\/dairy\/\d+\/auth$/.test(pathname)
  const isDairyUsers = /^\/dairy\/\d+\/users$/.test(pathname)

  // ── 0. Plan expired → force logout everything ──────────────────────────────
  if (planExpiry) {
    const decoded = (() => { try { return decodeURIComponent(planExpiry) } catch { return planExpiry } })()
    const expiryDate = new Date(decoded)
    if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
      const response = NextResponse.redirect(new URL("/?plan-expired=1", request.url))
      clearCookieResponse(response, "bill-manager-token")
      clearCookieResponse(response, "bill-manager-role")
      clearCookieResponse(response, "bill-manager-verified")
      clearCookieResponse(response, "bill-manager-dairy-id")
      clearCookieResponse(response, "bill-manager-dairy-token")
      clearCookieResponse(response, "bill-manager-plan-expiry")
      return response
    }
  }

  // ── 1. Not logged in → block all dashboard routes ──────────────────────────
  if (!isLoggedIn && isDashboard) {
    // If dairy session exists, redirect to user login; otherwise dairy selection
    const loginUrl = new URL(dairyId ? `/dairy/${dairyId}/users` : "/", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── 2. Not logged in → block /pending (nothing to wait for) ────────────────
  if (!isLoggedIn && isPendingPage) {
    return NextResponse.redirect(new URL(dairyId ? `/dairy/${dairyId}/users` : "/", request.url))
  }

  // ── 3. Already logged in → redirect away from auth pages ───────────────────
  if (isLoggedIn && isAuthPage) {
    if (verified !== "true") {
      return NextResponse.redirect(new URL("/pending", request.url))
    }
    const dest =
      role === "admin"
        ? "/dashboard/admin"
        : role === "supplier"
          ? "/dashboard/supplier"
          : "/dashboard/member"
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // ── 4. Not dairy-authed → block /dairy/[id]/users (need dairy password first)
  //    But allow if the dairyId cookie matches (dairy was previously authenticated)
  if (!isLoggedIn && isDairyUsers && !isDairyAuthed && !dairyId) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // ── 5. User not yet verified → block everything except /pending ─────────
  if (isLoggedIn && verified !== "true" && !isPendingPage) {
    return NextResponse.redirect(new URL("/pending", request.url))
  }

  // ── 6. Logged in → enforce role-based access on every dashboard prefix ──────
  if (isLoggedIn && isDashboard) {
    for (const [prefix, requiredRole] of Object.entries(ROLE_ROUTES)) {
      if (pathname.startsWith(prefix) && role !== requiredRole) {
        const dest =
          role === "admin"
            ? "/dashboard/admin"
            : role === "supplier"
              ? "/dashboard/supplier"
              : "/dashboard/member"
        return NextResponse.redirect(new URL(dest, request.url))
      }
    }
  }

  return NextResponse.next()
}

// ─── Matcher: run on all routes, skip static assets ──────────────────────────
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\..*$).*)",
  ],
}

