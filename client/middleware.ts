import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// ─── Route → required role mapping ───────────────────────────────────────────
const ROLE_ROUTES: Record<string, string> = {
  "/dashboard/admin": "admin",
  "/dashboard/supplier": "supplier",
  "/dashboard/member": "member",
}

// Pages only for unauthenticated users
const AUTH_PAGES = ["/", "/signup"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const token = request.cookies.get("bill-manager-token")?.value
  const role = request.cookies.get("bill-manager-role")?.value
  const verified = request.cookies.get("bill-manager-verified")?.value

  const isLoggedIn = Boolean(token && role)
  const isDashboard = pathname.startsWith("/dashboard")
  const isAuthPage = AUTH_PAGES.includes(pathname)
  const isPendingPage = pathname === "/pending"

  // ── 1. Not logged in → block all dashboard routes ──────────────────────────
  if (!isLoggedIn && isDashboard) {
    const loginUrl = new URL("/", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── 2. Not logged in → block /pending (nothing to wait for) ────────────────
  if (!isLoggedIn && isPendingPage) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // ── 3. Already logged in → redirect away from login / signup ───────────────
  if (isLoggedIn && isAuthPage) {
    // Any unverified user gets sent to /pending even from login page
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

  // ── 4. User not yet verified → block everything except /pending ─────────
  if (isLoggedIn && verified !== "true" && !isPendingPage) {
    return NextResponse.redirect(new URL("/pending", request.url))
  }

  // ── 5. Logged in → enforce role-based access on every dashboard prefix ──────
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

