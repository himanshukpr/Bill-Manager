'use client'

import { useEffect, useState, useMemo } from 'react'
import { ArrowRight, BarChart3, ClipboardPlus, FileText, Home, Truck, Calculator } from 'lucide-react'
import { deliveryLogsApi, housesApi, balanceApi, type DeliveryLog, type DeliveryLogItem, type House } from '@/lib/api'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

type ProductSummary = {
  milkType: string
  qty: number
}

type ShiftSupplierSummary = {
  shift: string
  supplier: string
  products: ProductSummary[]
  totalQty: number
}

export default function AdminDashboardPage() {
  const [todayLogs, setTodayLogs] = useState<DeliveryLog[]>([])
  const [loading, setLoading] = useState(true)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryDate, setSummaryDate] = useState<Date>(() => new Date())
  const [shiftSupplierSummaries, setShiftSupplierSummaries] = useState<ShiftSupplierSummary[]>([])

  useEffect(() => {
    async function load() {
      try {
        const logs = await deliveryLogsApi.list()
        const today = new Date()
        const filteredLogs = (logs as DeliveryLog[]).filter((log) => {
          const logDate = new Date(log.createdAt)
          return isSameLocalDate(logDate, today)
        })
        setTodayLogs(filteredLogs.slice(0, 5))
      } catch { /* silently fail on dashboard */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const loadSummary = async (date: Date) => {
    setSummaryLoading(true)
    try {
      const [logs, houses] = await Promise.all([
        deliveryLogsApi.list(),
        housesApi.list(),
      ])
      const filteredLogs = (logs as DeliveryLog[]).filter((log) => {
        const logDate = new Date(log.deliveredAt || log.createdAt)
        return isSameLocalDate(logDate, date)
      })

      const groups = new Map<string, Map<string, ProductSummary>>()

      for (const log of filteredLogs) {
        const supplier = log.shift === 'shop' ? 'Shop' : (log.supplier?.username || 'Unassigned')
        const groupKey = log.shift === 'shop' ? 'Shop' : `${log.shift} - ${supplier}`

        if (!groups.has(groupKey)) {
          groups.set(groupKey, new Map())
        }
        const productMap = groups.get(groupKey)!
        for (const item of log.items || []) {
          if (!productMap.has(item.milkType)) {
            productMap.set(item.milkType, { milkType: item.milkType, qty: 0 })
          }
          const existing = productMap.get(item.milkType)!
          existing.qty += item.qty
        }
      }

      const result: ShiftSupplierSummary[] = []
      for (const [groupKey, productMap] of groups.entries()) {
        const parts = groupKey.split(' - ')
        const shift = parts[0]
        const supplier = parts.length > 1 ? parts.slice(1).join(' - ') : ''
        const products = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty || a.milkType.localeCompare(b.milkType))
        result.push({ shift, supplier: shift === 'Shop' ? '' : supplier, products, totalQty: products.reduce((sum, p) => sum + p.qty, 0) })
      }

      result.sort((a, b) => {
        const order = { Shop: 0, Evening: 1, Morning: 2 }
        const aOrder = order[a.shift as keyof typeof order] ?? 99
        const bOrder = order[b.shift as keyof typeof order] ?? 99
        if (aOrder !== bOrder) return aOrder - bOrder
        if (a.shift !== b.shift) return a.shift.localeCompare(b.shift)
        return a.supplier.localeCompare(b.supplier)
      })

      setShiftSupplierSummaries(result)
    } catch {
      setShiftSupplierSummaries([])
    } finally {
      setSummaryLoading(false)
    }
  }

  const quickLinks = [
    {
      label: 'Houses',
      description: 'Manage registered delivery locations and house details.',
      href: '/dashboard/admin/houses',
      icon: Home,
      accent: 'from-sky-500/10 to-sky-600/10',
      iconBg: 'bg-sky-500/15',
      iconColor: 'text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Direct Entry',
      description: 'Record delivery logs quickly from the field.',
      href: '/dashboard/admin/direct-entry',
      icon: ClipboardPlus,
      accent: 'from-emerald-500/10 to-emerald-600/10',
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Receipts',
      description: 'Open payment receipts and log collections.',
      href: '/dashboard/admin/recipts',
      icon: FileText,
      accent: 'from-amber-500/10 to-amber-600/10',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
  ]

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-base sm:text-lg text-muted-foreground">
          Welcome back! Here&apos;s your dairy operations overview.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {quickLinks.map((link) => {
          const Icon = link.icon
          return (
            <Link
              key={link.label}
              href={link.href}
              className={`group relative overflow-hidden rounded-2xl border border-neutral-200/50 bg-linear-to-br ${link.accent} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-neutral-800/50`}
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-base sm:text-lg font-semibold text-muted-foreground">{link.label}</p>
                  <p className="mt-2 text-base sm:text-lg font-medium text-foreground/90">{link.description}</p>
                </div>
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${link.iconBg}`}>
                  <Icon className={`h-5 w-5 ${link.iconColor}`} />
                </div>
              </div>
              <div className="relative mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                Open
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Operations Analysis</p>
              <h2 className="mt-2 text-xl font-bold">Delivery Plan vs Delivery Logs</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Compare supplier plans with actual delivery records to spot overdraws or short deliveries.
              </p>
            </div>
            <div className="rounded-xl bg-emerald-500/15 p-3">
              <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="mt-5">
            <Link
              href="/dashboard/admin/delivery-analysis"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
            >
              Open analysis
            </Link>
          </div>
        </div>
      </div>

      {/* Today's Delivery Logs */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-bold">Today&apos;s Delivery Logs</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Deliveries recorded today</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/admin/delivery-logs"
              className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90"
            >
              View All
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                loadSummary(summaryDate)
                setSummaryOpen(true)
              }}
            >
              <Calculator className="h-4 w-4 mr-2" />
              Product Summary
            </Button>
          </div>
        </div>
{loading ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">Loading...</div>
          ) : todayLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Truck className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">No deliveries recorded today</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-3 text-left font-semibold text-muted-foreground">House</th>
                    <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Shift</th>
                    <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Delivery Date</th>
                    <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Items</th>
                    <th className="hidden sm:table-cell px-5 py-3 text-left font-semibold text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {todayLogs.map((log, i) => (
                    <tr key={log.id}
                      className={`border-b border-border/60 hover:bg-muted/20 transition-colors ${i === todayLogs.length - 1 ? 'border-b-0' : ''}`}>
                      <td className="px-5 py-3 font-semibold">{log.house?.houseNo}</td>
                      <td className="px-5 py-3 text-muted-foreground capitalize">{log.shift}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {log.deliveredAt ? new Date(log.deliveredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {log.items?.map((item: DeliveryLogItem) => item.milkType).join(', ')}
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3 font-bold text-primary">
                        ₹{Number(log.totalAmount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Product Summary - {summaryDate.toLocaleDateString('en-IN')}</DialogTitle>
            <DialogDescription>
              Total quantities by shift and supplier
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 px-5 pt-5">
            <Input
              type="date"
              value={summaryDate.toISOString().split('T')[0]}
              onChange={(e) => {
                const newDate = new Date(e.target.value)
                setSummaryDate(newDate)
                loadSummary(newDate)
              }}
              className="w-auto"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date()
                setSummaryDate(today)
                loadSummary(today)
              }}
            >
              Today
            </Button>
          </div>
          {summaryLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <span className="text-sm">Loading...</span>
            </div>
          ) : shiftSupplierSummaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">No deliveries recorded for this date</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto px-5">
              {shiftSupplierSummaries.map((summary, i) => (
                <div key={i} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">
                      {summary.shift}
                      {summary.supplier ? ` - ${summary.supplier}` : ''}
                    </h3>
                    <span className="text-xs text-muted-foreground">Total: {summary.totalQty}L</span>
                  </div>
                  <div className="space-y-1">
                    {summary.products.map((p) => (
                      <div key={p.milkType} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{p.milkType}</span>
                        <span>{p.qty.toLocaleString('en-IN')}L</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
