'use client'

import { useEffect, useState } from 'react'
import { ensureClientSessionStoragePolicy } from '@/lib/api'

type StorageGateProps = {
  children: React.ReactNode
}

export function StorageGate({ children }: StorageGateProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    ensureClientSessionStoragePolicy()
      .catch(() => {
      })
      .finally(() => {
        if (active) setReady(true)
      })

    return () => {
      active = false
    }
  }, [])

  if (!ready) return null
  return <>{children}</>
}
