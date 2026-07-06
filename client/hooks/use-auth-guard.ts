'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

import { getSessionAuth, clearAllAuth, getDairyIdFromCookie, type AppRole, type SessionAuth } from '@/lib/auth'

export function useAuthGuard(requiredRole: AppRole) {
  const router = useRouter()
  const pathname = usePathname()
  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    const syncAuth = () => {
      if (typeof window !== "undefined" && window.location.search.includes("plan-expired=1")) {
        return false
      }

      const session = getSessionAuth()

      if (!session?.token) {
        clearAllAuth()
        const dairyId = getDairyIdFromCookie()
        router.replace(dairyId ? `/dairy/${dairyId}/users` : "/")
        return false
      }

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

      // Check plan expiry
      if (session.planExpiry) {
        const expiryDate = new Date(session.planExpiry)
        if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
          clearAllAuth()
          router.replace("/?plan-expired=1")
          return false
        }
      }

      if (active) {
        setAuth(session)
        setReady(true)
      }

      return true
    }

    syncAuth()

    const handleStorage = () => {
      syncAuth()
    }

    const intervalId = window.setInterval(syncAuth, 30000)

    window.addEventListener('storage', handleStorage)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('storage', handleStorage)
    }
  }, [requiredRole, router, pathname])

  return { auth, ready }
}