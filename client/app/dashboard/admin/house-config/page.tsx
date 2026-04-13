'use client'

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Building2, MapPin, Phone, Search, Check, Loader2, AlertCircle } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { houseConfigApi, housesApi, usersApi, type House, type HouseConfig, type User } from '@/lib/api'
import { db } from '@/lib/db'
import { toast } from 'sonner'

type RowConfigForm = {
  configId: number | null
  shift: 'morning' | 'evening'
  supplierId: string
}

type GlobalSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const HouseRow = React.memo(({ house, draft, suppliers, onUpdateShift, onUpdateSupplier, isLast }: any) => {
  return (
    <tr
      className={`border-b border-border/60 transition-colors hover:bg-muted/20 ${isLast ? 'border-b-0' : ''}`}
    >
      <td className="px-4 py-3 align-top">
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground">{house.houseNo}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {house.area || 'Area not set'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {house.phoneNo}
            </span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <Select
          value={draft.shift}
          onValueChange={(value) => onUpdateShift(house.id, value as 'morning' | 'evening')}
        >
          <SelectTrigger className="h-9 min-w-[9rem]">
            <SelectValue placeholder="Select shift" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="morning">Morning</SelectItem>
            <SelectItem value="evening">Evening</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-4 py-3 align-top">
        <Select
          value={draft.supplierId || '__none__'}
          onValueChange={(value) => onUpdateSupplier(house.id, value === '__none__' ? '' : value)}
          disabled={draft.shift === 'evening'}
        >
          <SelectTrigger className="h-9 w-full min-w-[12rem]">
            <SelectValue placeholder="Select supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unassigned</SelectItem>
            {suppliers.map((item: User) => (
              <SelectItem key={item.uuid} value={item.uuid}>
                {item.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  )
})
HouseRow.displayName = 'HouseRow'

const HouseCard = React.memo(({ house, draft, suppliers, onUpdateShift, onUpdateSupplier }: any) => {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-3">
        <p className="font-semibold text-foreground">{house.houseNo}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {house.area || 'Area not set'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {house.phoneNo}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <Select
          value={draft.shift}
          onValueChange={(value) => onUpdateShift(house.id, value as 'morning' | 'evening')}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select shift" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="morning">Morning</SelectItem>
            <SelectItem value="evening">Evening</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={draft.supplierId || '__none__'}
          onValueChange={(value) => onUpdateSupplier(house.id, value === '__none__' ? '' : value)}
          disabled={draft.shift === 'evening'}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unassigned</SelectItem>
            {suppliers.map((item: User) => (
              <SelectItem key={item.uuid} value={item.uuid}>
                {item.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
})
HouseCard.displayName = 'HouseCard'

export default function AdminHouseConfigPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [shiftFilter, setShiftFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [globalStatus, setGlobalStatus] = useState<GlobalSaveStatus>('idle')

  const pendingSavesCount = useRef(0)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // -- Dexie Live Queries (Local First) --
  const houses = useLiveQuery(() => db.houses.toArray())
  const rawConfigs = useLiveQuery(() => db.houseConfigs.toArray())
  const suppliers = useLiveQuery(() => db.users.where('role').equals('supplier').toArray())

  const loading = !houses || !rawConfigs || !suppliers;

  // Debounce search input for better performance
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
    }, 200)
    return () => clearTimeout(handler)
  }, [search])

  const incrementPending = useCallback(() => {
    pendingSavesCount.current += 1
    setGlobalStatus('saving')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
  }, [])

  const decrementPending = useCallback((hasError = false) => {
    pendingSavesCount.current -= 1
    if (pendingSavesCount.current <= 0) {
      pendingSavesCount.current = 0
      setGlobalStatus(hasError ? 'error' : 'saved')
      saveTimeoutRef.current = setTimeout(() => {
        setGlobalStatus('idle')
      }, 3000)
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      // Fire background network syncs (Stale-While-Revalidate)
      // These will silently update Dexie when finished, natively triggering re-renders
      housesApi.list()
      houseConfigApi.list()
      usersApi.list('supplier')
    } catch (error: any) {
      toast.error('Failed to trigger background sync')
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const supplierById = useMemo(() => {
    const mapped = new Map<string, User>()
    if (suppliers) {
      for (const supplier of suppliers) mapped.set(supplier.uuid, supplier)
    }
    return mapped
  }, [suppliers])

  const drafts = useMemo(() => {
    if (!houses || !rawConfigs) return {}

    const mappedConfigs = new Map<number, HouseConfig>()
    for (const c of rawConfigs) mappedConfigs.set(c.houseId, c)

    const result: Record<number, RowConfigForm> = {}
    for (const house of houses) {
      const config = mappedConfigs.get(house.id)
      result[house.id] = {
        configId: config?.id ?? null,
        shift: config?.shift ?? 'morning',
        supplierId: config?.shift === 'evening' ? '' : (config?.supplierId || ''),
      }
    }
    return result
  }, [houses, rawConfigs])

  const filteredHouses = useMemo(() => {
    if (!houses) return []
    return houses.filter(house => {
      const draft = drafts[house.id]
      if (!draft) return false
      
      if (shiftFilter !== 'all' && draft.shift !== shiftFilter) return false
      if (supplierFilter !== 'all') {
        if (supplierFilter === 'unassigned' && draft.supplierId) {
            return false
        } else if (supplierFilter !== 'unassigned' && supplierFilter !== draft.supplierId) {
            return false
        }
      }

      const searchText = debouncedSearch.trim().toLowerCase()
      if (searchText) {
        const supplier = draft.supplierId ? supplierById.get(draft.supplierId) : undefined
        const matchesSearch = house.houseNo.toLowerCase().includes(searchText) ||
          (house.area || '').toLowerCase().includes(searchText) ||
          house.phoneNo.includes(searchText) ||
          (draft.shift || '').toLowerCase().includes(searchText) ||
          (supplier?.username || '').toLowerCase().includes(searchText)
        
        if (!matchesSearch) return false
      }
      return true
    })
  }, [houses, drafts, supplierById, debouncedSearch, shiftFilter, supplierFilter])

  const updateShift = useCallback(async (houseId: number, shift: 'morning' | 'evening') => {
    const current = drafts[houseId]
    if (!current) return

    incrementPending()
    try {
      const newSupplierId = shift === 'evening' ? '' : current.supplierId
      if (current.configId) {
        await houseConfigApi.update(current.configId, { shift, supplierId: newSupplierId })
      } else {
        await houseConfigApi.create({ houseId, shift, supplierId: newSupplierId, position: 0 })
      }
      decrementPending(false)
    } catch {
      decrementPending(true)
    }
  }, [drafts, incrementPending, decrementPending])

  const updateSupplier = useCallback(async (houseId: number, supplierId: string) => {
    const current = drafts[houseId]
    if (!current) return
    if (current.shift === 'evening') return

    incrementPending()
    try {
      if (current.configId) {
        await houseConfigApi.update(current.configId, { supplierId })
      } else {
        await houseConfigApi.create({ houseId, shift: current.shift, supplierId, position: 0 })
      }
      decrementPending(false)
    } catch {
      decrementPending(true)
    }
  }, [drafts, incrementPending, decrementPending])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">House Configuration</h1>
        </div>
        
        <div className="h-8 flex items-center justify-end">
          {globalStatus === 'saving' && (
            <span className="text-yellow-600 dark:text-yellow-500 flex items-center gap-1.5 text-sm font-medium animate-in fade-in">
              <Loader2 className="w-4 h-4 animate-spin" /> Syncing...
            </span>
          )}
          {globalStatus === 'saved' && (
            <span className="text-emerald-600 dark:text-emerald-500 flex items-center gap-1.5 text-sm font-medium animate-in fade-in">
              <Check className="w-4 h-4" /> Fully Synced
            </span>
          )}
          {globalStatus === 'error' && (
            <span className="text-red-600 dark:text-red-500 flex items-center gap-1.5 text-sm font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4" /> Pending Offline Sync
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by house no, area, phone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={shiftFilter} onValueChange={setShiftFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
             <SelectValue placeholder="Filter shift" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Shifts</SelectItem>
            <SelectItem value="morning">Morning</SelectItem>
            <SelectItem value="evening">Evening</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
             <SelectValue placeholder="Filter supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {suppliers?.map(s => (
              <SelectItem key={s.uuid} value={s.uuid}>{s.username}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(6)].map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredHouses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="mb-3 h-12 w-12 opacity-30" />
            <p className="font-medium">No houses found</p>
            <p className="mt-1 text-sm">Try a different search query or filter.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filteredHouses.map((house) => {
                const draft = drafts[house.id]
                if (!draft) return null

                return (
                  <HouseCard
                    key={house.id}
                    house={house}
                    draft={draft}
                    suppliers={suppliers}
                    onUpdateShift={updateShift}
                    onUpdateSupplier={updateSupplier}
                  />
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[800px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[20%]" />
                  <col className="w-[40%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground w-1/3">House</th>
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground w-1/4">Shift</th>
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground w-1/3">Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHouses.map((house, index) => {
                    const draft = drafts[house.id]
                    if (!draft) return null

                    return (
                      <HouseRow
                        key={house.id}
                        house={house}
                        draft={draft}
                        suppliers={suppliers}
                        onUpdateShift={updateShift}
                        onUpdateSupplier={updateSupplier}
                        isLast={index === filteredHouses.length - 1}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
