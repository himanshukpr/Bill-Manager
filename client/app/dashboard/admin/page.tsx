'use client'

import { useEffect, useState } from 'react'
import {
  FileText, Home, DollarSign,
  BarChart3, Truck,
} from 'lucide-react'
import { billsApi, housesApi, deliveryLogsApi } from '@/lib/api'
import Link from 'next/link'

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

export default function AdminDashboardPage() {
  const [houseStats, setHouseStats] = useState({ totalHouses: 0, totalPreviousBalance: '0' })
  const [billStats, setBillStats] = useState({ totalBills: 0, billsThisMonth: 0, totalPendingBalance: '0' })
  const [todayLogs, setTodayLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  useEffect(() => {
    async function load() {
      try {
        const [hs, bs, logs] = await Promise.all([
          housesApi.stats(),
          billsApi.dashboardStats(),
          deliveryLogsApi.list()
        ])
        setHouseStats(hs)
        setBillStats(bs)
        // Filter for today's logs based on createdAt
        const today = new Date()
        const filteredLogs = (logs as any[]).filter((log) => {
          const logDate = new Date(log.createdAt)
          return isSameLocalDate(logDate, today)
        })
        setTodayLogs(filteredLogs.slice(0, 5))
      } catch { /* silently fail on dashboard */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const pendingBalance = Number(billStats.totalPendingBalance)

  const stats = [
    {
      label: 'Total Houses',
      value: loading ? '—' : String(houseStats.totalHouses),
      sub: 'registered delivery locations',
      icon: Home,
      bgGradient: 'from-blue-500/10 to-blue-600/10',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Total Bills',
      value: loading ? '—' : String(billStats.totalBills),
      sub: `${billStats.billsThisMonth} this month`,
      icon: FileText,
      bgGradient: 'from-purple-500/10 to-purple-600/10',
      iconBg: 'bg-purple-500/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Pending Balance',
      value: loading ? '—' : `₹${pendingBalance.toLocaleString('en-IN')}`,
      sub: 'outstanding from all houses',
      icon: DollarSign,
      bgGradient: 'from-amber-500/10 to-amber-600/10',
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
  ]

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Welcome back! Here&apos;s your dairy operations overview.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label}
              className={`relative overflow-hidden rounded-2xl border border-neutral-200/50 bg-linear-to-br ${stat.bgGradient} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-neutral-800/50`}>
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
                </div>
                <div className={`rounded-xl ${stat.iconBg} p-3`}>
                  <Icon className={`h-5 w-5 ${stat.iconColor}`} />
                </div>
              </div>
            </div>
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
            <h2 className="text-base font-bold">Today's Delivery Logs</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Deliveries recorded today</p>
          </div>
          <Link
            href="/dashboard/admin/delivery-logs"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            View All
          </Link>
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
                      {log.items?.map((item: any) => item.milkType).join(', ')}
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
    </div>
  )
}
