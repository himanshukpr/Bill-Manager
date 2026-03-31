'use client'

import {
  FileText,
  Home,
  DollarSign,
  Users,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

const stats = [
  {
    label: 'Total Houses',
    value: '24',
    change: '+4.2%',
    icon: Home,
    bgGradient: 'from-blue-500/10 to-blue-600/10',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-600',
    lightBg: 'light:from-blue-50 light:to-blue-100',
  },
  {
    label: 'Total Bills',
    value: '156',
    change: '+12.5%',
    icon: FileText,
    bgGradient: 'from-purple-500/10 to-purple-600/10',
    iconBg: 'bg-purple-500/20',
    iconColor: 'text-purple-600',
    lightBg: 'light:from-purple-50 light:to-purple-100',
  },
  {
    label: 'Pending Amount',
    value: '$4,250',
    change: '-8.1%',
    icon: DollarSign,
    bgGradient: 'from-amber-500/10 to-amber-600/10',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-600',
    lightBg: 'light:from-amber-50 light:to-amber-100',
  },
  {
    label: 'Active Users',
    value: '42',
    change: '+2.3%',
    icon: Users,
    bgGradient: 'from-emerald-500/10 to-emerald-600/10',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-600',
    lightBg: 'light:from-emerald-50 light:to-emerald-100',
  },
]

const recentBills = [
  {
    ref: 'BILL-901',
    vendor: 'Fresh Foods',
    amount: '$420',
    status: 'Pending',
    date: 'Mar 28, 2025',
  },
  {
    ref: 'BILL-902',
    vendor: 'Power Utilities',
    amount: '$1,100',
    status: 'Paid',
    date: 'Mar 27, 2025',
  },
  {
    ref: 'BILL-903',
    vendor: 'Office Mart',
    amount: '$265',
    status: 'Pending',
    date: 'Mar 26, 2025',
  },
  {
    ref: 'BILL-904',
    vendor: 'Metro Water',
    amount: '$160',
    status: 'Paid',
    date: 'Mar 25, 2025',
  },
  {
    ref: 'BILL-905',
    vendor: 'Security Services',
    amount: '$890',
    status: 'Processing',
    date: 'Mar 24, 2025',
  },
]

const alerts = [
  {
    icon: AlertCircle,
    message: '3 invoices are due in the next 24 hours',
    type: 'warning',
  },
  {
    icon: TrendingUp,
    message: 'Monthly spend is at 70% of budget target',
    type: 'info',
  },
  {
    icon: Users,
    message: '2 new user registrations pending approval',
    type: 'info',
  },
]

function StatCard({
  icon: Icon,
  label,
  value,
  change,
  bgGradient,
  iconBg,
  iconColor,
}) {
  const isPositive = change.startsWith('+')

  return (
    <div className={`smooth-motion smooth-surface relative overflow-hidden rounded-2xl border border-neutral-200/50 bg-linear-to-br ${bgGradient} p-4 sm:p-6 backdrop-blur-0 sm:backdrop-blur-sm hover:translate-y-0 sm:hover:-translate-y-0.5 hover:border-neutral-300/80 hover:shadow-md sm:hover:shadow-lg dark:border-neutral-800/50 dark:hover:border-neutral-700/80`}>
      {/* Background Accent */}
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-linear-to-br from-white/10 to-transparent" />

      <div className="relative z-10 flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-2 sm:mt-3 text-2xl sm:text-4xl font-bold text-neutral-900 dark:text-white">
            {value}
          </p>
          <div className="mt-3 sm:mt-4 flex items-center gap-2">
            <span
              className={`flex items-center gap-1 text-xs sm:text-sm font-semibold ${isPositive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
                }`}
            >
              {isPositive ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              {change}
            </span>
            <span className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-500">
              from last month
            </span>
          </div>
        </div>
        <div className={`rounded-xl ${iconBg} p-2.5 sm:p-3`}>
          <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-1.5 sm:mt-2 text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
            Welcome back! Here's your bills overview.
          </p>
        </div>
      </div>

      {/* Stats Grid - Responsive */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4 lg:gap-5">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Bills - Takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <div className="smooth-surface rounded-2xl border border-neutral-200/50 bg-white/50 backdrop-blur-0 sm:backdrop-blur-sm dark:border-neutral-800/50 dark:bg-neutral-950/50 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="border-b border-neutral-200/50 px-4 sm:px-6 py-3 sm:py-4 dark:border-neutral-800/50">
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                Recent Bills
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                Latest invoice activities
              </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-neutral-200/50 dark:border-neutral-800/50 bg-neutral-50/50 dark:bg-neutral-900/50">
                    <th className="px-3 sm:px-6 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      Ref
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      Vendor
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      Amount
                    </th>
                    <th className="hidden sm:table-cell px-3 sm:px-6 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      Date
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentBills.map((bill, index) => (
                    <tr
                      key={bill.ref}
                      className={`border-b border-neutral-200/50 smooth-surface hover:bg-neutral-50/50 dark:border-neutral-800/50 dark:hover:bg-neutral-900/30 ${index === recentBills.length - 1 ? 'border-b-0' : ''
                        }`}
                    >
                      <td className="px-3 sm:px-6 py-3 font-semibold text-neutral-900 dark:text-white text-xs sm:text-sm">
                        {bill.ref}
                      </td>
                      <td className="px-3 sm:px-6 py-3 text-neutral-700 dark:text-neutral-300 text-xs sm:text-sm truncate">
                        {bill.vendor}
                      </td>
                      <td className="px-3 sm:px-6 py-3 font-semibold text-neutral-900 dark:text-white text-xs sm:text-sm">
                        {bill.amount}
                      </td>
                      <td className="hidden sm:table-cell px-3 sm:px-6 py-3 text-neutral-600 dark:text-neutral-400 text-xs sm:text-sm whitespace-nowrap">
                        {bill.date}
                      </td>
                      <td className="px-3 sm:px-6 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 sm:px-3 py-1 text-xs font-semibold whitespace-nowrap ${bill.status === 'Paid'
                            ? 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : bill.status === 'Pending'
                              ? 'bg-amber-100/80 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'bg-blue-100/80 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            }`}
                        >
                          {bill.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Alerts Sidebar */}
        <div className="lg:col-span-1">
          <div className="smooth-surface rounded-2xl border border-neutral-200/50 bg-white/50 backdrop-blur-0 sm:backdrop-blur-sm dark:border-neutral-800/50 dark:bg-neutral-950/50 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="border-b border-neutral-200/50 px-4 sm:px-6 py-3 sm:py-4 dark:border-neutral-800/50">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                Alerts & Updates
              </h2>
            </div>

            {/* Content */}
            <div className="space-y-2 sm:space-y-3 p-4 sm:p-6">
              {alerts.map((alert, idx) => {
                const AlertIcon = alert.icon
                return (
                  <div
                    key={idx}
                    className={`rounded-lg sm:rounded-xl border-l-4 p-3 sm:p-4 backdrop-blur-sm transition-colors duration-200 ${alert.type === 'warning'
                      ? 'border-l-amber-500 bg-amber-50/50 dark:border-l-amber-600 dark:bg-amber-950/20'
                      : 'border-l-blue-500 bg-blue-50/50 dark:border-l-blue-600 dark:bg-blue-950/20'
                      }`}
                  >
                    <div className="flex gap-2 sm:gap-3">
                      <AlertIcon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${alert.type === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-blue-600 dark:text-blue-400'
                          }`}
                      />
                      <p
                        className={`text-xs sm:text-sm font-medium ${alert.type === 'warning'
                          ? 'text-amber-800 dark:text-amber-200'
                          : 'text-blue-800 dark:text-blue-200'
                          }`}
                      >
                        {alert.message}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
