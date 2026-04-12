'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, MapPin, Phone, Save, Search } from 'lucide-react'

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
import { toast } from 'sonner'

type RowConfigForm = {
  configId: number | null
  shift: 'morning' | 'evening'
  supplierId: string
  position: string
}

export default function AdminHouseConfigPage() {
  const [houses, setHouses] = useState<House[]>([])
  const [configs, setConfigs] = useState<HouseConfig[]>([])
  const [suppliers, setSuppliers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [draftByHouse, setDraftByHouse] = useState<Record<number, RowConfigForm>>({})
  const [dirtyByHouse, setDirtyByHouse] = useState<Record<number, boolean>>({})
  const [savingByHouse, setSavingByHouse] = useState<Record<number, boolean>>({})
  const [savingAll, setSavingAll] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [housesData, configsData, suppliersData] = await Promise.all([
        housesApi.list(),
        houseConfigApi.list(),
        usersApi.list('supplier'),
      ])
      setHouses(housesData)
      setConfigs(configsData)
      setSuppliers(suppliersData)

      const mappedConfigs = new Map<number, HouseConfig>()
      for (const config of configsData) {
        if (!mappedConfigs.has(config.houseId)) {
          mappedConfigs.set(config.houseId, config)
        }
      }

      const sharedEveningSupplierId =
        configsData.find((config) => config.shift === 'evening' && config.supplierId)?.supplierId ?? ''

      const nextDrafts: Record<number, RowConfigForm> = {}
      for (const house of housesData) {
        const config = mappedConfigs.get(house.id)
        nextDrafts[house.id] = {
          configId: config?.id ?? null,
          shift: config?.shift ?? 'morning',
          supplierId:
            config?.shift === 'evening'
              ? sharedEveningSupplierId
              : (config?.supplierId ?? ''),
          position: String(config?.position ?? 0),
        }
      }
      setDraftByHouse(nextDrafts)
      setDirtyByHouse({})
    } catch (error: any) {
      toast.error(error.message || 'Failed to load house configuration data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const configByHouse = useMemo(() => {
    const mapped = new Map<number, HouseConfig>()
    for (const config of configs) {
      if (!mapped.has(config.houseId)) {
        mapped.set(config.houseId, config)
      }
    }
    return mapped
  }, [configs])

  const supplierById = useMemo(() => {
    const mapped = new Map<string, User>()
    for (const supplier of suppliers) {
      mapped.set(supplier.uuid, supplier)
    }
    return mapped
  }, [suppliers])

  const filteredHouses = useMemo(() => {
    const searchText = search.trim().toLowerCase()
    if (!searchText) return houses

    return houses.filter((house) => {
      const draft = draftByHouse[house.id]
      const supplier = draft?.supplierId ? supplierById.get(draft.supplierId) : undefined

      return (
        house.houseNo.toLowerCase().includes(searchText) ||
        (house.area || '').toLowerCase().includes(searchText) ||
        house.phoneNo.includes(searchText) ||
        (draft?.shift || '').toLowerCase().includes(searchText) ||
        (draft?.supplierId || '').toLowerCase().includes(searchText) ||
        (supplier?.username || '').toLowerCase().includes(searchText)
      )
    })
  }, [houses, draftByHouse, supplierById, search])

  function updateDraft(houseId: number, patch: Partial<RowConfigForm>) {
    setDraftByHouse((prev) => ({
      ...prev,
      [houseId]: {
        ...prev[houseId],
        ...patch,
      },
    }))
    setDirtyByHouse((prev) => ({ ...prev, [houseId]: true }))
  }

  function updateSupplier(houseId: number, supplierId: string) {
    const current = draftByHouse[houseId]
    if (!current) return

    // For evening shift: sync and persist to all evening rows immediately.
    if (current.shift === 'evening') {
      syncEveningSupplier(supplierId)
      return
    }

    setDraftByHouse((prev) => ({
      ...prev,
      [houseId]: {
        ...prev[houseId],
        supplierId,
      },
    }))
    setDirtyByHouse((prev) => ({ ...prev, [houseId]: true }))
  }

  async function syncEveningSupplier(supplierId: string) {
    const eveningIds = Object.keys(draftByHouse)
      .map(Number)
      .filter((id) => draftByHouse[id]?.shift === 'evening')

    if (eveningIds.length === 0) return

    setDraftByHouse((prev) => {
      const next = { ...prev }
      for (const id of eveningIds) {
        next[id] = { ...next[id], supplierId }
      }
      return next
    })

    setSavingByHouse((prev) => {
      const next = { ...prev }
      for (const id of eveningIds) next[id] = true
      return next
    })

    try {
      const results = await Promise.all(
        eveningIds.map(async (houseId) => {
          const draft = draftByHouse[houseId]
          if (!draft) return null

          const position = Number.parseInt(draft.position, 10)
          const payload = {
            houseId,
            shift: 'evening' as const,
            supplierId: supplierId || undefined,
            position: Number.isFinite(position) ? position : 0,
          }

          if (draft.configId) return houseConfigApi.update(draft.configId, payload)
          return houseConfigApi.create(payload)
        }),
      )

      const savedConfigs = results.filter((item): item is HouseConfig => item !== null)

      setConfigs((prev) => {
        const eveningSet = new Set(eveningIds)
        const withoutEvening = prev.filter((item) => !eveningSet.has(item.houseId))
        return [...withoutEvening, ...savedConfigs]
      })

      setDraftByHouse((prev) => {
        const next = { ...prev }
        for (const saved of savedConfigs) {
          next[saved.houseId] = {
            ...next[saved.houseId],
            configId: saved.id,
            shift: saved.shift,
            supplierId: saved.supplierId ?? '',
            position: String(saved.position),
          }
        }
        return next
      })

      setDirtyByHouse((prev) => {
        const next = { ...prev }
        for (const id of eveningIds) next[id] = false
        return next
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to sync evening supplier')
    } finally {
      setSavingByHouse((prev) => {
        const next = { ...prev }
        for (const id of eveningIds) next[id] = false
        return next
      })
    }
  }

  function updateShift(houseId: number, shift: 'morning' | 'evening') {
    setDraftByHouse((prev) => {
      const current = prev[houseId]
      if (!current) return prev

      if (shift === 'evening') {
        const sharedEveningSupplierId =
          Object.values(prev).find((item) => item.shift === 'evening' && item.supplierId)?.supplierId ?? ''
        return {
          ...prev,
          [houseId]: {
            ...current,
            shift,
            supplierId: sharedEveningSupplierId,
          },
        }
      }

      return {
        ...prev,
        [houseId]: {
          ...current,
          shift,
        },
      }
    })
    setDirtyByHouse((prev) => ({ ...prev, [houseId]: true }))
  }

  async function persistRow(houseId: number, withToast = true) {
    const draft = draftByHouse[houseId]
    if (!draft) return

    if (draft.shift === 'morning' && !draft.supplierId) {
      throw new Error('Supplier is required for morning shift')
    }

    setSavingByHouse((prev) => ({ ...prev, [houseId]: true }))
    try {
      const position = Number.parseInt(draft.position, 10)
      const payload = {
        houseId,
        shift: draft.shift,
        supplierId: draft.supplierId || undefined,
        position: Number.isFinite(position) ? position : 0,
      }

      let saved: HouseConfig
      if (draft.configId) {
        saved = await houseConfigApi.update(draft.configId, payload)
      } else {
        saved = await houseConfigApi.create(payload)
      }

      setConfigs((prev) => {
        const withoutHouse = prev.filter((item) => item.houseId !== houseId)
        return [...withoutHouse, saved]
      })

      setDraftByHouse((prev) => ({
        ...prev,
        [houseId]: {
          ...prev[houseId],
          configId: saved.id,
          shift: saved.shift,
          supplierId: saved.supplierId ?? '',
          position: String(saved.position),
        },
      }))
      setDirtyByHouse((prev) => ({ ...prev, [houseId]: false }))
      if (withToast) toast.success('Configuration saved')
    } finally {
      setSavingByHouse((prev) => ({ ...prev, [houseId]: false }))
    }
  }

  async function saveRow(houseId: number) {
    try {
      await persistRow(houseId)
    } catch (error: any) {
      toast.error(error.message || 'Failed to save configuration')
    }
  }

  async function saveAllChanges() {
    const ids = Object.keys(dirtyByHouse)
      .filter((houseId) => dirtyByHouse[Number(houseId)])
      .map(Number)

    if (ids.length === 0) {
      toast.message('No pending changes')
      return
    }

    setSavingAll(true)
    try {
      for (const houseId of ids) {
        await persistRow(houseId, false)
      }
      toast.success('All changes saved')
    } catch (error: any) {
      toast.error(error.message || 'Some changes could not be saved')
    } finally {
      setSavingAll(false)
    }
  }

  const dirtyCount = useMemo(
    () => Object.values(dirtyByHouse).filter(Boolean).length,
    [dirtyByHouse],
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">House Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spreadsheet mode: edit cells directly, then save row-wise or save all changes together.
        </p>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {dirtyCount > 0
              ? `${dirtyCount} row${dirtyCount > 1 ? 's' : ''} have unsaved changes.`
              : 'No unsaved changes.'}
          </p>
          <Button onClick={saveAllChanges} disabled={savingAll || dirtyCount === 0} className="gap-2 self-start sm:self-auto">
            <Save className="h-4 w-4" />
            {savingAll ? 'Saving All...' : 'Save All Changes'}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by house no, area, phone, shift, supplier..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
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
            <p className="mt-1 text-sm">Try a different search query.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filteredHouses.map((house) => {
                const draft = draftByHouse[house.id]
                if (!draft) return null
                const supplier = draft.supplierId ? supplierById.get(draft.supplierId) : undefined
                const isDirty = !!dirtyByHouse[house.id]
                const isSaving = !!savingByHouse[house.id]

                return (
                  <div
                    key={house.id}
                    className={`rounded-xl border p-3 ${isDirty ? 'border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-500/5' : 'border-border bg-background'}`}
                  >
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
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Shift</p>
                        <Select
                          value={draft.shift}
                          onValueChange={(value) => updateShift(house.id, value as 'morning' | 'evening')}
                        >
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="Select shift" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="morning">Morning</SelectItem>
                            <SelectItem value="evening">Evening</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Supplier</p>
                        <Select
                          value={draft.supplierId || '__none__'}
                          onValueChange={(value) => updateSupplier(house.id, value === '__none__' ? '' : value)}
                        >
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="Select supplier" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {suppliers.map((item) => (
                              <SelectItem key={item.uuid} value={item.uuid}>
                                {item.username} - {item.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Supplier ID: {draft.supplierId || 'Not assigned'}
                        </p>
                        {draft.shift === 'evening' && (
                          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">Evening shift is synced across all evening rows</p>
                        )}
                        {supplier && (
                          <p className="mt-1 text-xs text-muted-foreground">Selected: {supplier.username}</p>
                        )}
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Position</p>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={draft.position}
                          onChange={(event) => updateDraft(house.id, { position: event.target.value })}
                          className="h-9 w-full"
                        />
                      </div>

                      <Button
                        variant={isDirty ? 'default' : 'outline'}
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => saveRow(house.id)}
                        disabled={isSaving || !isDirty}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[18%]" />
                  <col className="w-[29%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground">House</th>
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground">Shift</th>
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground">Supplier / ID</th>
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground">Position</th>
                    <th className="px-4 py-3.5 text-right font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHouses.map((house, index) => {
                    const draft = draftByHouse[house.id]
                    if (!draft) return null
                    const supplier = draft.supplierId ? supplierById.get(draft.supplierId) : undefined
                    const isDirty = !!dirtyByHouse[house.id]
                    const isSaving = !!savingByHouse[house.id]

                    return (
                      <tr
                        key={house.id}
                        className={`border-b border-border/60 transition-colors hover:bg-muted/20 ${isDirty ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''} ${index === filteredHouses.length - 1 ? 'border-b-0' : ''}`}
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
                            onValueChange={(value) => updateShift(house.id, value as 'morning' | 'evening')}
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
                          <div className="min-w-[15rem] space-y-1.5">
                            <Select
                              value={draft.supplierId || '__none__'}
                              onValueChange={(value) => updateSupplier(house.id, value === '__none__' ? '' : value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select supplier" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Unassigned</SelectItem>
                                {suppliers.map((item) => (
                                  <SelectItem key={item.uuid} value={item.uuid}>
                                    {item.username} - {item.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Supplier ID: {draft.supplierId || 'Not assigned'}
                            </p>
                            {draft.shift === 'evening' && (
                              <p className="text-xs text-blue-600 dark:text-blue-400">Evening shift is synced across all evening rows</p>
                            )}
                            {supplier && (
                              <p className="text-xs text-muted-foreground">Selected: {supplier.username}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={draft.position}
                            onChange={(event) => updateDraft(house.id, { position: event.target.value })}
                            className="h-9 w-24"
                          />
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <Button
                            variant={isDirty ? 'default' : 'outline'}
                            size="sm"
                            className="w-24 gap-2"
                            onClick={() => saveRow(house.id)}
                            disabled={isSaving || !isDirty}
                          >
                            <Save className="h-3.5 w-3.5" />
                            {isSaving ? 'Saving...' : 'Save'}
                          </Button>
                        </td>
                      </tr>
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
