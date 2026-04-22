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

function ManageAlertsDialog({ house, config }: { house: House, config: HouseConfig | undefined }) {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<HouseAlert[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setAlerts(parseAlerts(config?.dailyAlerts))
    }
  }, [open, config?.dailyAlerts])

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
      setOpen(false)
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

  const actAlerts = parseAlerts(config?.dailyAlerts)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0">
           <Settings className="w-4 h-4" /> Manage
        </Button>
      </DialogTrigger>
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
           <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
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

  const filteredHouses = useMemo(() => {
    if (!houses) return []
    const housesWithAlerts = houses.filter((house) => {
      const config = mappedConfigs.get(house.id)
      return parseAlerts(config?.dailyAlerts).length > 0
    })

    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return housesWithAlerts.sort((a, b) => a.houseNo.localeCompare(b.houseNo))

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
  }, [houses, mappedConfigs, supplierById, debouncedSearch])

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
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by house, shift, or supplier..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9 bg-card"
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
            <p className="font-medium">No daily alerts found</p>
            <p className="mt-1 text-sm">Create a daily alert while adding/updating house config.</p>
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
