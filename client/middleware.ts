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
  if (pathname.startsWith("/dairy/")) return true
  return false
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

  const isLoggedIn = Boolean(token && role)
  const isDairyAuthed = Boolean(dairyToken)
  const isDashboard = pathname.startsWith("/dashboard")
  const isAuthPage = matchAuthPage(pathname)
  const isPendingPage = pathname === "/pending"
  const isDairyAuth = /^\/dairy\/\d+\/auth$/.test(pathname)
  const isDairyUsers = /^\/dairy\/\d+\/users$/.test(pathname)

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
  if (!isLoggedIn && isDairyUsers && !isDairyAuthed) {
    // Extract dairyId from path and redirect to auth page
    const match = pathname.match(/^\/dairy\/(\d+)\/users$/)
    if (match) {
      return NextResponse.redirect(new URL(`/dairy/${match[1]}/auth`, request.url))
    }
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

