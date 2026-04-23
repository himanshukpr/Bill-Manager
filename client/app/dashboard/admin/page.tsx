'use client'

import { useEffect, useState } from 'react'
import {
  FileText, Home, DollarSign, Users,
  TrendingUp, AlertCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { billsApi, housesApi } from '@/lib/api'

export default function AdminDashboardPage() {
  const [houseStats, setHouseStats] = useState({ totalHouses: 0, totalPreviousBalance: '0' })
  const [billStats, setBillStats] = useState({ totalBills: 0, billsThisMonth: 0, totalPendingBalance: '0' })
  const [recentBills, setRecentBills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  useEffect(() => {
    async function load() {
      try {
        const [hs, bs, bills] = await Promise.all([
          housesApi.stats(),
          billsApi.dashboardStats(),
          billsApi.list({ year: new Date().getFullYear() })
        ])
        setHouseStats(hs)
        setBillStats(bs)
        setRecentBills(bills.slice(0, 5))
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

      {/* Recent Bills */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">Recent Bills</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Latest generated bills this year</p>
        </div>
        {loading ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">Loading...</div>
        ) : recentBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">No bills generated yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">House</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Period</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Total</th>
                  <th className="hidden sm:table-cell px-5 py-3 text-left font-semibold text-muted-foreground">Generated</th>
                </tr>
              </thead>
              <tbody>
                {recentBills.map((b, i) => (
                  <tr key={b.id}
                    className={`border-b border-border/60 hover:bg-muted/20 transition-colors ${i === recentBills.length - 1 ? 'border-b-0' : ''}`}>
                    <td className="px-5 py-3 font-semibold">{b.house?.houseNo}</td>
                    <td className="px-5 py-3 text-muted-foreground">{MONTH_NAMES[b.month]} {b.year}</td>
                    <td className="px-5 py-3 font-bold text-primary">₹{Number(b.totalAmount).toLocaleString('en-IN')}</td>
                    <td className="hidden sm:table-cell px-5 py-3 text-muted-foreground text-xs">
                      {new Date(b.generatedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
