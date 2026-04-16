'use client'

import React, { useMemo, useState } from 'react'
import { Bell } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

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
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function AdminAlertsPanel() {
  const [open, setOpen] = useState(false)
  
  const houses = useLiveQuery(() => db.houses.toArray())
  const rawConfigs = useLiveQuery(() => db.houseConfigs.toArray())

  const [todayKey] = useMemo(() => {
    const daysString = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return [daysString[new Date().getDay()] as keyof AlertDays]
  }, [])

  const activeAlerts = useMemo(() => {
    if (!houses || !rawConfigs) return []

    const houseMap = new Map()
    for (const h of houses) houseMap.set(h.id, h)

    const alertsList: Array<{ houseNo: string, text: string }> = []

    for (const config of rawConfigs) {
      const house = houseMap.get(config.houseId)
      if (!house) continue

      const allAlerts = parseAlerts(config.dailyAlerts)
      const todaysAlerts = allAlerts.filter(a => a.schedule[todayKey])
      
      for (const alert of todaysAlerts) {
         const displayText = alert.text.trim() || 'Left over house'
         alertsList.push({ houseNo: house.houseNo, text: displayText })
      }
    }

    return alertsList.sort((a, b) => a.houseNo.localeCompare(b.houseNo))
  }, [houses, rawConfigs, todayKey])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-11 w-11 sm:h-9 sm:w-9 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <Bell className="h-5 w-5 sm:h-4 sm:w-4" />
          {activeAlerts.length > 0 && (
            <span className="absolute top-1.5 right-1.5 sm:top-1 sm:right-1 flex h-4 w-4 sm:h-3.5 sm:w-3.5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
              {activeAlerts.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl pb-2 border-b">
            <Bell className="w-5 h-5 text-amber-500" /> Today's Alerts
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-4">
           {activeAlerts.length === 0 ? (
             <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-xl border border-dashed border-border/60">
               <Bell className="w-8 h-8 opacity-20 mx-auto mb-2" />
               <p>No active alerts for your route today.</p>
             </div>
           ) : (
             activeAlerts.map((alert, i) => (
                <div key={i} className="p-4 rounded-xl border border-amber-200/50 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-500/10 shadow-sm relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                   <div className="flex items-start justify-between mb-1">
                      <span className="font-bold text-sm tracking-wide">{alert.houseNo}</span>
                   </div>
                   <p className="text-base font-medium text-amber-900 dark:text-amber-100">
                     {alert.text}
                   </p>
                </div>
             ))
           )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
