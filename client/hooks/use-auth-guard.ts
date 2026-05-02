'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { getSessionAuth, type AppRole, type SessionAuth } from '@/lib/auth'

export function useAuthGuard(requiredRole: AppRole) {
  const router = useRouter()
  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    const syncAuth = () => {
      const session = getSessionAuth()

      if (!session?.token || session.role !== requiredRole) {
        router.replace('/')
        return false
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

    const intervalId = window.setInterval(syncAuth, 1000)

    window.addEventListener('storage', handleStorage)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('storage', handleStorage)
    }
  }, [requiredRole, router])

  return { auth, ready }
}