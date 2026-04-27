'use client'

import { useCallback, useEffect, useState } from 'react'
import { houseConfigApi, type HouseConfig } from '@/lib/api'
import { readHouseConfigSessionCache, subscribeHouseConfigSessionCache } from '@/lib/house-config-cache'

export function useHouseConfigs() {
  const [configs, setConfigs] = useState<HouseConfig[]>(() => readHouseConfigSessionCache())
  const [loading, setLoading] = useState(() => readHouseConfigSessionCache().length === 0)

  const refresh = useCallback(async (background = false) => {
    if (!background && configs.length === 0) {
      setLoading(true)
    }
    try {
      const latest = await houseConfigApi.list()
      setConfigs(latest)
      return latest
    } finally {
      if (!background) {
        setLoading(false)
      }
    }
  }, [configs.length])

  useEffect(() => {
    setConfigs(readHouseConfigSessionCache())
    void refresh(false)
  }, [refresh])

  useEffect(() => {
    const unsubscribe = subscribeHouseConfigSessionCache(() => {
      setConfigs(readHouseConfigSessionCache())
    })

    const intervalId = window.setInterval(() => {
      if (navigator.onLine) {
        void refresh(true)
      }
    }, 5000)

    return () => {
      unsubscribe()
      window.clearInterval(intervalId)
    }
  }, [refresh])

  return { configs, loading, refresh, setConfigs }
}
