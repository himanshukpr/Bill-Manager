'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

import { getSessionAuth, clearSessionAuth, ensurePlanValid, getDairyIdFromCookie, type AppRole, type SessionAuth } from '@/lib/auth'

export function useAuthGuard(requiredRole: AppRole) {
  const router = useRouter()
  const pathname = usePathname()
  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [ready, setReady] = useState(false)
  const activeProfileId = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    const syncAuth = async () => {
      if (typeof window !== "undefined" && window.location.search.includes("plan-expired=1")) {
        return false
      }

      const session = getSessionAuth()

      if (!session?.token) {
        activeProfileId.current = null
        clearSessionAuth()
        const dairyId = getDairyIdFromCookie()
        router.replace(dairyId ? `/dairy/${dairyId}/users` : "/")
        return false
      }

      const nextProfileId = `${session.dairyId}:${session.uuid}`
      if (activeProfileId.current && activeProfileId.current !== nextProfileId) {
        // Another tab switched accounts; reload so cookies, guards, and caches
        // are re-established for the newly active profile.
        window.location.reload()
        return false
      }
      activeProfileId.current = nextProfileId

      if (session.role !== requiredRole) {
        // Role mismatch — redirect to the correct dashboard WITHOUT clearing the session.
        // This prevents a race condition where switching accounts briefly triggers the
        // old layout's auth guard, which would wipe the newly-saved session.
        const dest =
          session.role === "admin"
            ? "/dashboard/admin"
            : session.role === "supplier"
              ? "/dashboard/supplier"
              : "/dashboard/member"
        router.replace(dest)
        return false
      }

      // Revalidate with the server before treating the plan as expired —
      // the session snapshot may be stale and must never wipe accounts alone.
      if (!(await ensurePlanValid())) return false

      if (active) {
        setAuth(session)
        setReady(true)
      }

      return true
    }

    void syncAuth()

    const handleStorage = () => {
      void syncAuth()
    }

    const intervalId = window.setInterval(() => { void syncAuth() }, 30000)

    window.addEventListener('storage', handleStorage)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('storage', handleStorage)
    }
  }, [requiredRole, router, pathname])

  return { auth, ready }
}