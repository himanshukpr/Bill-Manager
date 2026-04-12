'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Building2, Save, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { houseConfigApi, housesApi, type House, type HouseConfig } from '@/lib/api'
import { toast } from 'sonner'

type AlertRow = {
  configId: number
  houseId: number
  houseNo: string
  area: string
  shift: 'morning' | 'evening'
  supplierId: string
  dailyAlerts: string
}

export default function AdminDailyAlertsPage() {
  const [rows, setRows] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState<Record<number, boolean>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [savingAll, setSavingAll] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [houses, configs] = await Promise.all([housesApi.list(), houseConfigApi.list()])

      const houseMap = new Map<number, House>()
      for (const house of houses) houseMap.set(house.id, house)

      const nextRows: AlertRow[] = configs
        .map((config) => {
          const house = houseMap.get(config.houseId)
          if (!house) return null
          return {
            configId: config.id,
            houseId: house.id,
            houseNo: house.houseNo,
            area: house.area ?? '',
            shift: config.shift,
            supplierId: config.supplierId ?? '',
            dailyAlerts: config.dailyAlerts ?? '',
          }
        })
        .filter((row): row is AlertRow => row !== null)
        .sort((a, b) => a.houseNo.localeCompare(b.houseNo))

      setRows(nextRows)
      setDirty({})
    } catch (error: any) {
      toast.error(error.message || 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows

    return rows.filter((row) => {
      return (
        row.houseNo.toLowerCase().includes(q) ||
        row.area.toLowerCase().includes(q) ||
        row.shift.toLowerCase().includes(q) ||
        row.supplierId.toLowerCase().includes(q) ||
        row.dailyAlerts.toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const dirtyCount = useMemo(() => Object.values(dirty).filter(Boolean).length, [dirty])

  function updateAlert(houseId: number, value: string) {
    setRows((prev) => prev.map((row) => (row.houseId === houseId ? { ...row, dailyAlerts: value } : row)))
    setDirty((prev) => ({ ...prev, [houseId]: true }))
  }

  async function saveRow(houseId: number, showToast = true) {
    const row = rows.find((item) => item.houseId === houseId)
    if (!row) return

    setSaving((prev) => ({ ...prev, [houseId]: true }))
    try {
      await houseConfigApi.update(row.configId, {
        houseId: row.houseId,
        shift: row.shift,
        supplierId: row.shift === 'morning' ? row.supplierId || undefined : undefined,
        dailyAlerts: row.dailyAlerts || undefined,
      })
      setDirty((prev) => ({ ...prev, [houseId]: false }))
      if (showToast) toast.success('Alert saved')
    } catch (error: any) {
      toast.error(error.message || 'Could not save alert')
    } finally {
      setSaving((prev) => ({ ...prev, [houseId]: false }))
    }
  }

  async function saveAll() {
    const ids = Object.keys(dirty)
      .filter((key) => dirty[Number(key)])
      .map(Number)

    if (ids.length === 0) {
      toast.message('No pending alert changes')
      return
    }

    setSavingAll(true)
    for (const houseId of ids) {
      await saveRow(houseId, false)
    }
    setSavingAll(false)
    toast.success('All alert changes saved')
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Daily Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set custom daily notes for each house. Example: call before arrival, collect dues, skip Sunday.
        </p>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {dirtyCount > 0 ? `${dirtyCount} house alerts changed.` : 'No unsaved alert changes.'}
          </p>
          <Button onClick={saveAll} disabled={savingAll || dirtyCount === 0} className="gap-2 self-start sm:self-auto">
            <Save className="h-4 w-4" />
            {savingAll ? 'Saving...' : 'Save All Alerts'}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by house, shift, supplier id, or alert text"
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
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="mb-3 h-12 w-12 opacity-30" />
            <p className="font-medium">No configured houses found</p>
            <p className="mt-1 text-sm">Set house configuration first, then add alerts.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filteredRows.map((row) => {
                const isDirty = !!dirty[row.houseId]
                const isSaving = !!saving[row.houseId]

                return (
                  <div
                    key={row.houseId}
                    className={`rounded-xl border p-3 ${isDirty ? 'border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-500/5' : 'border-border bg-background'}`}
                  >
                    <div className="mb-2">
                      <p className="font-semibold">{row.houseNo}</p>
                      <p className="text-xs text-muted-foreground">{row.area || 'Area not set'}</p>
                    </div>
                    <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Shift: </span>
                        <span className="capitalize">{row.shift}</span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Supplier: </span>
                        <span>{row.supplierId || 'Shared'}</span>
                      </div>
                    </div>
                    <div className="relative">
                      <Bell className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={row.dailyAlerts}
                        onChange={(event) => updateAlert(row.houseId, event.target.value)}
                        placeholder="Type daily alert for this house"
                        className="h-9 pl-8"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant={isDirty ? 'default' : 'outline'}
                      disabled={isSaving || !isDirty}
                      onClick={() => saveRow(row.houseId)}
                      className="mt-3 w-full gap-2"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">House</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Shift</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Supplier ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Daily Alert</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => {
                    const isDirty = !!dirty[row.houseId]
                    const isSaving = !!saving[row.houseId]

                    return (
                      <tr
                        key={row.houseId}
                        className={`border-b border-border/60 transition-colors hover:bg-muted/20 ${isDirty ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''} ${index === filteredRows.length - 1 ? 'border-b-0' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <p className="font-semibold">{row.houseNo}</p>
                            <p className="text-xs text-muted-foreground">{row.area || 'Area not set'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize">{row.shift}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{row.supplierId || 'Shared/Unassigned'}</td>
                        <td className="px-4 py-3">
                          <div className="relative min-w-[16rem]">
                            <Bell className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={row.dailyAlerts}
                              onChange={(event) => updateAlert(row.houseId, event.target.value)}
                              placeholder="Type daily alert for this house"
                              className="h-9 pl-8"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant={isDirty ? 'default' : 'outline'}
                            disabled={isSaving || !isDirty}
                            onClick={() => saveRow(row.houseId)}
                            className="gap-2"
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
