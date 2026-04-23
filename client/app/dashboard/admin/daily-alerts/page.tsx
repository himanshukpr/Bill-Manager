'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Building2, Save, Search, Plus, Trash2, Settings, CalendarDays } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'


import { houseConfigApi, housesApi, usersApi, type House, type HouseConfig, type User } from '@/lib/api'
import { db } from '@/lib/db'
import { toast } from 'sonner'

export type AlertDays = {
  Monday: boolean;
  Tuesday: boolean;
  Wednesday: boolean;
  Thursday: boolean;
  Friday: boolean;
  Saturday: boolean;
  Sunday: boolean;
}

export type HouseAlert = {
  id: string; 
  text: string;
  schedule: AlertDays;
}

function parseAlerts(jsonStr: string | null | undefined): HouseAlert[] {
  if (!jsonStr) return [];
  const trimmed = jsonStr.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // Backward compatibility for legacy plain-text alert values.
    return [
      {
        id: 'legacy-alert',
        text: trimmed,
        schedule: {
          Monday: true,
          Tuesday: true,
          Wednesday: true,
          Thursday: true,
          Friday: true,
          Saturday: true,
          Sunday: true,
        },
      },
    ];
  }
}

const DAYS_KEYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DAYS_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ManageAlertsDialog({
  house,
  config,
  open,
  onOpenChange,
  showTrigger = true,
}: {
  house: House
  config: HouseConfig | undefined
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [alerts, setAlerts] = useState<HouseAlert[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const dialogOpen = open ?? internalOpen

  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setInternalOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [open, onOpenChange],
  )

  useEffect(() => {
    if (dialogOpen) {
      setAlerts(parseAlerts(config?.dailyAlerts))
    }
  }, [dialogOpen, config?.dailyAlerts])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const newAlertsStr = JSON.stringify(alerts)
      if (config?.id) {
         await houseConfigApi.update(config.id, { dailyAlerts: newAlertsStr })
      } else {
         await houseConfigApi.create({ houseId: house.id, shift: 'morning', dailyAlerts: newAlertsStr, position: 0 })
      }
      toast.success('Alerts successfully synced')
      setDialogOpen(false)
    } catch {
      toast.error('Failed to sync alerts')
    } finally {
      setIsSaving(false)
    }
  }

  const addAlert = () => {
     setAlerts(prev => [...prev, { 
       id: crypto.randomUUID(), 
       text: '', 
       schedule: { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true }
     }])
  }

  const updateAlertText = (index: number, text: string) => {
    setAlerts(prev => {
      const next = [...prev]
      next[index] = { ...next[index], text }
      return next
    })
  }

  const toggleDay = (index: number, day: typeof DAYS_KEYS[number]) => {
    setAlerts(prev => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        schedule: {
          ...next[index].schedule,
          [day]: !next[index].schedule[day]
        }
      }
      return next
    })
  }

  const removeAlert = (index: number) => {
    setAlerts(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 shrink-0">
             <Settings className="w-4 h-4" /> Manage
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-2xl bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
             <Bell className="w-5 h-5 text-primary" />
             Manage Alerts for {house.houseNo}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-4 mt-4">
           {alerts.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border rounded-xl border-dashed">
                <CalendarDays className="mb-3 h-10 w-10 opacity-30" />
                <p className="font-medium">No alerts configured</p>
                <p className="text-xs mt-1">Create an alert schedule to notify suppliers.</p>
             </div>
           ) : (
             <div className="space-y-4">
                {alerts.map((alert, index) => (
                  <div key={alert.id} className="p-4 rounded-xl border border-border bg-muted/20 relative group">
                     <div className="flex gap-3 mb-4">
                        <Input 
                          placeholder="E.g., Call before arrival, Only 1L today..."
                          value={alert.text}
                          onChange={(e) => updateAlertText(index, e.target.value)}
                          className="bg-background flex-1"
                        />
                        <Button variant="destructive" size="icon" onClick={() => removeAlert(index)} className="shrink-0" title="Delete Alert">
                           <Trash2 className="w-4 h-4" />
                        </Button>
                     </div>
                     <div>
                       <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Active Days</p>
                       <div className="flex flex-wrap gap-2">
                         {DAYS_KEYS.map((day, i) => (
                            <Button 
                              key={day}
                              variant={alert.schedule[day] ? 'default' : 'outline'}
                              size="sm"
                              className={`h-8 font-medium ${alert.schedule[day] ? 'bg-primary/90' : 'bg-background'}`}
                              onClick={() => toggleDay(index, day)}
                            >
                              {DAYS_LABELS[i]}
                            </Button>
                         ))}
                       </div>
                     </div>
                  </div>
                ))}
             </div>
           )}
           <Button onClick={addAlert} variant="secondary" className="w-full mt-4 gap-2 border border-dashed border-border">
             <Plus className="w-4 h-4" /> Create New Alert
           </Button>
        </div>
        
        <DialogFooter className="mt-4 pt-4 border-t border-border/40">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
           <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Schedule'}
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


export default function AdminDailyAlertsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [addAlertOpen, setAddAlertOpen] = useState(false)
  const [addHouseSearch, setAddHouseSearch] = useState('')
  const [selectedAddHouseId, setSelectedAddHouseId] = useState<number | null>(null)
  const [addDialogAlerts, setAddDialogAlerts] = useState<HouseAlert[]>([])
  const [addDialogSaving, setAddDialogSaving] = useState(false)

  // LIVE QUERIES
  const houses = useLiveQuery(() => db.houses.toArray())
  const rawConfigs = useLiveQuery(() => db.houseConfigs.toArray())
  const suppliers = useLiveQuery(() => db.users.where('role').equals('supplier').toArray())

  const loading = !houses || !rawConfigs

  const loadData = useCallback(async () => {
    try {
      housesApi.list()
      houseConfigApi.list()
      usersApi.list('supplier')
    } catch {
      toast.error('Failed to trigger background sync')
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
    }, 200)
    return () => clearTimeout(handler)
  }, [search])

  const supplierById = useMemo(() => {
    const mapped = new Map<string, User>()
    if (suppliers) {
      for (const supplier of suppliers) mapped.set(supplier.uuid, supplier)
    }
    return mapped
  }, [suppliers])

  const mappedConfigs = useMemo(() => {
    const mapped = new Map<number, HouseConfig>()
    if (rawConfigs) {
      for (const config of rawConfigs) mapped.set(config.houseId, config)
    }
    return mapped
  }, [rawConfigs])

  const housesWithAlerts = useMemo(() => {
    if (!houses) return []
    return houses.filter((house) => {
      const config = mappedConfigs.get(house.id)
      return parseAlerts(config?.dailyAlerts).length > 0
    })
  }, [houses, mappedConfigs])

  const filteredHouses = useMemo(() => {
    if (!housesWithAlerts) return []

    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return [...housesWithAlerts].sort((a, b) => a.houseNo.localeCompare(b.houseNo))

    return housesWithAlerts.filter((house) => {
      const config = mappedConfigs.get(house.id)
      const supplierName = config?.supplierId ? supplierById.get(config.supplierId)?.username : ''
      return (
        house.houseNo.toLowerCase().includes(q) ||
        (house.area || '').toLowerCase().includes(q) ||
        (config?.shift || '').toLowerCase().includes(q) ||
        (supplierName || '').toLowerCase().includes(q)
      )
    }).sort((a, b) => a.houseNo.localeCompare(b.houseNo))
  }, [housesWithAlerts, mappedConfigs, supplierById, debouncedSearch])

  const housesWithoutAlerts = useMemo(() => {
    if (!houses) return []
    return houses.filter((house) => {
      const config = mappedConfigs.get(house.id)
      return parseAlerts(config?.dailyAlerts).length === 0
    })
  }, [houses, mappedConfigs])

  const filteredAddHouseOptions = useMemo(() => {
    if (selectedAddHouseId) {
      return housesWithoutAlerts.filter((house) => house.id === selectedAddHouseId)
    }

    const q = addHouseSearch.trim().toLowerCase()
    if (!q) return [...housesWithoutAlerts].sort((a, b) => a.houseNo.localeCompare(b.houseNo))

    return housesWithoutAlerts
      .filter((house) =>
        house.houseNo.toLowerCase().includes(q) ||
        (house.area || '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.houseNo.localeCompare(b.houseNo))
  }, [addHouseSearch, housesWithoutAlerts, selectedAddHouseId])

  const selectedAddHouse = useMemo(() => {
    if (!houses || !selectedAddHouseId) return undefined
    return houses.find((house) => house.id === selectedAddHouseId)
  }, [houses, selectedAddHouseId])

  const selectedAddHouseConfig = useMemo(() => {
    if (!selectedAddHouseId) return undefined
    return mappedConfigs.get(selectedAddHouseId)
  }, [selectedAddHouseId, mappedConfigs])

  useEffect(() => {
    if (!addAlertOpen) {
      setSelectedAddHouseId(null)
      setAddHouseSearch('')
      setAddDialogAlerts([])
    }
  }, [addAlertOpen])

  useEffect(() => {
    if (!selectedAddHouseId) {
      setAddDialogAlerts([])
      return
    }

    setAddDialogAlerts(parseAlerts(selectedAddHouseConfig?.dailyAlerts))
  }, [selectedAddHouseId, selectedAddHouseConfig?.dailyAlerts])

  const handleSelectHouseForAlert = (houseId: number) => {
    if (selectedAddHouseId) return
    setSelectedAddHouseId(houseId)
  }

  const handleAddDialogAddAlert = () => {
    setAddDialogAlerts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: '',
        schedule: {
          Monday: true,
          Tuesday: true,
          Wednesday: true,
          Thursday: true,
          Friday: true,
          Saturday: true,
          Sunday: true,
        },
      },
    ])
  }

  const handleAddDialogUpdateText = (index: number, text: string) => {
    setAddDialogAlerts((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], text }
      return next
    })
  }

  const handleAddDialogToggleDay = (index: number, day: typeof DAYS_KEYS[number]) => {
    setAddDialogAlerts((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        schedule: {
          ...next[index].schedule,
          [day]: !next[index].schedule[day],
        },
      }
      return next
    })
  }

  const handleAddDialogRemoveAlert = (index: number) => {
    setAddDialogAlerts((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveSelectedHouseAlerts = async () => {
    if (!selectedAddHouse) return

    setAddDialogSaving(true)
    try {
      const payload = JSON.stringify(addDialogAlerts)
      if (selectedAddHouseConfig?.id) {
        await houseConfigApi.update(selectedAddHouseConfig.id, { dailyAlerts: payload })
      } else {
        await houseConfigApi.create({
          houseId: selectedAddHouse.id,
          shift: 'morning',
          dailyAlerts: payload,
          position: 0,
        })
      }

      toast.success('Alerts successfully synced')
      setAddAlertOpen(false)
    } catch {
      toast.error('Failed to sync alerts')
    } finally {
      setAddDialogSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Daily Alerts Manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build custom delivery alert schedules tailored for each day of the week, per house.
        </p>
      </div>

      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by house, shift, or supplier..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9 bg-card"
            />
          </div>

          <Dialog open={addAlertOpen} onOpenChange={setAddAlertOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 whitespace-nowrap">
                <Plus className="h-4 w-4" /> Add Alert
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-card border-border/60">
              <DialogHeader>
                <DialogTitle>
                  Add Alert
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <Input
                  placeholder="Search house by number or area"
                  value={addHouseSearch}
                  onChange={(event) => setAddHouseSearch(event.target.value)}
                  disabled={!!selectedAddHouseId}
                  className="bg-background"
                />

                <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-border/60">
                  {filteredAddHouseOptions.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {housesWithoutAlerts.length === 0
                        ? 'All houses already have alerts configured.'
                        : 'No house matches your search.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {filteredAddHouseOptions.map((house) => {
                        const isSelected = selectedAddHouseId === house.id
                        if (selectedAddHouseId && !isSelected) return null
                        return (
                          <button
                            key={house.id}
                            type="button"
                            className={`flex w-full items-center justify-between px-4 py-3 text-left transition-all duration-200 hover:bg-muted/20 ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                            onClick={() => handleSelectHouseForAlert(house.id)}
                          >
                            <div>
                              <p className="font-semibold">{house.houseNo}</p>
                              <p className="text-xs text-muted-foreground">{house.area || 'Area not set'}</p>
                            </div>
                            <span className="text-xs text-primary">{isSelected ? 'Selected' : 'Select'}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`overflow-hidden transition-all duration-500 ease-out ${selectedAddHouse ? 'mt-4 max-h-[80vh] opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-3 pointer-events-none'}`}
              >
                {selectedAddHouse ? (
                  <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Editing house</p>
                        <p className="font-semibold">{selectedAddHouse.houseNo}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedAddHouseId(null)}>Clear</Button>
                    </div>

                    <div className="max-h-[42vh] overflow-y-auto pr-2">
                      {addDialogAlerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border rounded-xl border-dashed">
                          <CalendarDays className="mb-3 h-10 w-10 opacity-30" />
                          <p className="font-medium">No alerts configured</p>
                          <p className="text-xs mt-1">Create an alert schedule to notify suppliers.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {addDialogAlerts.map((alert, index) => (
                            <div key={alert.id} className="p-4 rounded-xl border border-border bg-background/70 relative group">
                              <div className="flex gap-3 mb-4">
                                <Input
                                  placeholder="E.g., Call before arrival, Only 1L today..."
                                  value={alert.text}
                                  onChange={(e) => handleAddDialogUpdateText(index, e.target.value)}
                                  className="bg-background flex-1"
                                />
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => handleAddDialogRemoveAlert(index)}
                                  className="shrink-0"
                                  title="Delete Alert"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Active Days</p>
                                <div className="flex flex-wrap gap-2">
                                  {DAYS_KEYS.map((day, i) => (
                                    <Button
                                      key={day}
                                      variant={alert.schedule[day] ? 'default' : 'outline'}
                                      size="sm"
                                      className={`h-8 font-medium ${alert.schedule[day] ? 'bg-primary/90' : 'bg-background'}`}
                                      onClick={() => handleAddDialogToggleDay(index, day)}
                                    >
                                      {DAYS_LABELS[i]}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <Button onClick={handleAddDialogAddAlert} variant="secondary" className="w-full mt-4 gap-2 border border-dashed border-border">
                        <Plus className="w-4 h-4" /> Create New Alert
                      </Button>
                    </div>

                    <DialogFooter className="mt-4 pt-4 border-t border-border/40">
                      <Button variant="ghost" onClick={() => setAddAlertOpen(false)}>Cancel</Button>
                      <Button onClick={handleSaveSelectedHouseAlerts} disabled={addDialogSaving} className="gap-2">
                        <Save className="w-4 h-4" />
                        {addDialogSaving ? 'Saving...' : 'Save Schedule'}
                      </Button>
                    </DialogFooter>
                  </div>
                ) : null}
              </div>
            </DialogContent>
          </Dialog>
        </div>
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
            <p className="font-medium">No configured alerts found</p>
            <p className="mt-1 text-sm">Click Add Alert to set alerts for a house.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filteredHouses.map((house) => {
                const config = mappedConfigs.get(house.id)
                const activeAlerts = parseAlerts(config?.dailyAlerts)

                return (
                  <div
                    key={house.id}
                    className="rounded-xl border border-border bg-background p-3 relative"
                  >
                    <div className="mb-2">
                       <div className="flex items-center gap-2">
                          <p className="font-semibold">{house.houseNo}</p>
                          {activeAlerts.length > 0 && (
                            <Badge variant="secondary" className="gap-1 h-5 hover:bg-secondary pointer-events-none">
                              <Bell className="w-3 h-3 text-amber-500" /> {activeAlerts.length}
                            </Badge>
                          )}
                       </div>
                      <p className="text-xs text-muted-foreground">{house.area || 'Area not set'}</p>
                    </div>
                    <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Shift: </span>
                        <span className="capitalize">{config?.shift || 'Morning'}</span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Supplier: </span>
                        <span>{config?.supplierId ? supplierById.get(config.supplierId)?.username : 'Unassigned'}</span>
                      </div>
                    </div>
                    
                    <ManageAlertsDialog house={house} config={config} />
                  </div>
                )
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground w-1/4">House</th>
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground w-1/5">Shift / Supplier</th>
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground w-1/3">Active Alerts</th>
                    <th className="px-4 py-3.5 text-right font-semibold text-muted-foreground w-1/5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHouses.map((house, index) => {
                    const config = mappedConfigs.get(house.id)
                    const activeAlerts = parseAlerts(config?.dailyAlerts)

                    return (
                      <tr
                        key={house.id}
                        className={`border-b border-border/60 transition-colors hover:bg-muted/20 ${index === filteredHouses.length - 1 ? 'border-b-0' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <p className="font-semibold">{house.houseNo}</p>
                            <p className="text-xs text-muted-foreground">{house.area || 'Area not set'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="capitalize font-medium block">{config?.shift || 'Morning'}</span>
                          <span className="text-muted-foreground">
                             {config?.supplierId ? supplierById.get(config.supplierId)?.username : 'Unassigned'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                           {activeAlerts.length > 0 ? (
                             <Badge variant="secondary" className="gap-1.5 px-2.5 py-0.5 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-50 dark:hover:bg-amber-500/10 pointer-events-none">
                               <Bell className="w-3 h-3 fill-current" /> {activeAlerts.length} {activeAlerts.length === 1 ? 'Alert' : 'Alerts'}
                             </Badge>
                           ) : (
                             <span className="text-xs text-muted-foreground">No alerts set</span>
                           )}
                        </td>
                        <td className="px-4 py-3 text-right">
                           <ManageAlertsDialog house={house} config={config} />
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
