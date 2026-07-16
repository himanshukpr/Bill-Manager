'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, Search, X, Phone, MapPin, Building2, Bell, CalendarDays,
  Pencil, Trash2, Eye, Settings2, Save, Rows3, ChevronLeft, ChevronRight, Edit2, History, PowerOff
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { balanceApi, billsApi, deliveryLogsApi, houseConfigApi, housesApi, productRatesApi, usersApi, type Bill, type BillItem, type DeliveryLog, type House, type HouseBalance, type HouseConfig, type PaymentHistory, type ProductRate, type User } from '@/lib/api'
import { getSessionAuth, getAuthHeader } from '@/lib/auth'
import { fetchApi } from '@/lib/api-base'
import { db } from '@/lib/db'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  parseDailyAlerts,
  createAlertId,
  ALL_DAYS_ALERT_SCHEDULE,
  type HouseAlert,
} from '@/lib/alerts'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const HOUSES_PER_PAGE = 25

type HouseDeliverySummaryRow = {
  dateKey: string
  dayLabel: string
  productsLabel: string
  hasDelivery: boolean
  logId?: number
  log?: DeliveryLog
  allLogs?: DeliveryLog[]
}

type MonthlyProductSummary = {
  product: string
  months: { month: number; year: number; quantity: number }[]
  totalQuantity: number
}

type PaymentSummaryRow = {
  id: number
  paidAt: string
  paidAmount: number
  discount: number
  remainingAmount: number
  note?: string
}

type DeliveryEditForm = {
  items: Array<{ milkType: string; qty: number; rate: number; amount: number }>
  note?: string
}

function normalizeMilkType(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  if (lower === 'milk') return ''
  if (lower === 'cow milk' || lower === 'cow milk milk' || lower.startsWith('cow milk ') || lower.startsWith('cow milk milk ')) return 'Cow Milk'
  if (lower === 'buffalo milk' || lower === 'buffalo milk milk' || lower.startsWith('buffalo milk ') || lower.startsWith('buffalo milk milk ')) return 'Buffalo Milk'
  const stripped = lower.replace(/ milk$/, '').trim()
  if (stripped) return stripped.charAt(0).toUpperCase() + stripped.slice(1)
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function cleanItemName(name: string): string {
  const text = name.trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  if (lower === 'milk') return ''
  if (lower === 'buffalo milk' || lower === 'buffalo milk milk' || lower.startsWith('buffalo milk ') || lower.startsWith('buffalo milk milk ')) return 'Buffalo Milk'
  if (lower === 'cow milk' || lower === 'cow milk milk' || lower.startsWith('cow milk ') || lower.startsWith('cow milk milk ')) return 'Cow Milk'
  const stripped = lower.replace(/ milk$/, '').trim()
  if (stripped) return stripped.charAt(0).toUpperCase() + stripped.slice(1)
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function parseDateOnly(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date()
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return new Date(dateStr)
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
}

function normalizeRateType(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase()
  if (text.includes('buffalo')) return 'buffalo'
  if (text.includes('cow')) return 'cow'
  return text
}

function normalizeDeliveryItems(items: unknown): DeliveryEditForm['items'] {
  if (!Array.isArray(items)) return []

  return items.map((item) => {
    const row = item as { milkType?: unknown; qty?: unknown; rate?: unknown; amount?: unknown }
    const milkType = normalizeMilkType(row.milkType)
    const qty = Number(row.qty ?? 0)
    const rate = Number(row.rate ?? 0)
    const amount = Number(row.amount ?? (qty * rate))
    return { milkType, qty, rate, amount }
  })
}

function getRateByProductName(rates: ProductRate[], productName: string): number {
  const normalized = (productName || '').toLowerCase().trim()
  for (const rate of rates) {
    if ((rate.name || '').toLowerCase().trim() === normalized) {
      return Number(rate.rate)
    }
  }
  return 0
}

function getActiveProducts(rates: ProductRate[]): ProductRate[] {
  return rates.filter(r => r.isActive && Number(r.rate) > 0).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.name || '').localeCompare(b.name || ''))
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getLogPeriod(logs: DeliveryLog[]): { year: number; month: number } {
  const latest = logs
    .map((log) => new Date(log.deliveredAt))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0]

  if (!latest) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }

  return {
    year: latest.getFullYear(),
    month: latest.getMonth(),
  }
}

function buildHouseDeliverySummary(logs: DeliveryLog[], year: number, month: number): HouseDeliverySummaryRow[] {
  const byDate = new Map<string, HouseDeliverySummaryRow>()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  for (const log of logs) {
    const deliveredAt = new Date(log.deliveredAt)
    if (deliveredAt.getFullYear() !== year || deliveredAt.getMonth() !== month) continue

    const dateKey = getLocalDateKey(deliveredAt)
    const existing = byDate.get(dateKey) ?? {
      dateKey,
      dayLabel: deliveredAt.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      productsLabel: '',
      hasDelivery: false,
      logId: undefined,
      log: undefined,
      allLogs: [],
    }

    existing.hasDelivery = true
    existing.allLogs = [...(existing.allLogs ?? []), log]
    // Store the first log for backwards compat
    if (!existing.logId) {
      existing.logId = log.id
      existing.log = log
    }

    const productParts = (log.items ?? []).map((item) => {
      const qty = Number(item.qty ?? 0)
      if (!qty) return null
      const milkType = normalizeMilkType(item.milkType)
      if (!milkType) return null
      return `${milkType} ${qty.toLocaleString('en-IN')}L`
    }).filter((part): part is string => Boolean(part))

    const productText = productParts.join(', ')
    existing.productsLabel = existing.productsLabel
      ? `${existing.productsLabel}, ${productText}`
      : productText || '-'

    byDate.set(dateKey, existing)
  }

  const rows: HouseDeliverySummaryRow[] = []
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day)
    const dateKey = getLocalDateKey(date)
    const row = byDate.get(dateKey)

    rows.push(
      row ?? {
        dateKey,
        dayLabel: date.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        productsLabel: '-',
        hasDelivery: false,
        logId: undefined,
        log: undefined,
        allLogs: [],
      },
    )
  }

  return rows
}

function buildMonthlyProductSummary(logs: DeliveryLog[], year: number, month: number): MonthlyProductSummary[] {
  const productMap = new Map<string, number>()

  // Group quantities by product for the selected month only.
  for (const log of logs) {
    const deliveredAt = new Date(log.deliveredAt)
    const logYear = deliveredAt.getFullYear()
    const logMonth = deliveredAt.getMonth()

    if (logYear !== year || logMonth !== month) continue

    for (const item of log.items ?? []) {
      const product = normalizeMilkType(item.milkType)
      const qty = Number(item.qty ?? 0)

      if (!product || qty <= 0) continue

      productMap.set(product, (productMap.get(product) ?? 0) + qty)
    }
  }

  // Convert to summary format
  const summary: MonthlyProductSummary[] = Array.from(productMap.entries()).map(([product, quantity]) => {
    return {
      product,
      months: [{ month, year, quantity }],
      totalQuantity: quantity,
    }
  })

  return summary.sort((a, b) => b.totalQuantity - a.totalQuantity)
}

function isValidMonth(year: number, month: number): boolean {
  return month >= 0 && month <= 11 && year > 0
}

function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 0) {
    return { year: year - 1, month: 11 }
  }
  return { year, month: month - 1 }
}

function getNextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 11) {
    return { year: year + 1, month: 0 }
  }
  return { year, month: month + 1 }
}

function parseAlerts(jsonStr: string | null | undefined): HouseAlert[] {
  return parseDailyAlerts(jsonStr)
}

function formatAlertPreview(rawValue: string | null | undefined): string {
  const text = parseAlerts(rawValue)
    .map((alert) => alert.text.trim())
    .filter(Boolean)
    .join(', ')

  if (!text) return ''
  return text.length > 96 ? `${text.slice(0, 93)}...` : text
}

function toAlertStorageValue(input: string): string | undefined {
  const text = input.trim()
  if (!text) return undefined

  const parsed = parseAlerts(text)
  if (parsed.length > 0) {
    return serializeAlerts(parsed)
  }

  return JSON.stringify([
    {
      id: createAlertId('auto'),
      text,
      schedule: ALL_DAYS_ALERT_SCHEDULE,
    },
  ])
}

function toAlertInputValue(rawValue: string | null | undefined): string {
  const parsed = parseAlerts(rawValue)
  return serializeAlerts(parsed) ?? ''
}

function serializeAlerts(alerts: HouseAlert[]): string | undefined {
  const normalized = alerts
    .map((alert) => ({
      id: alert.id || createAlertId(),
      text: alert.text.trim(),
      schedule: alert.schedule,
    }))
    .filter((alert) => alert.text.length > 0)

  if (normalized.length === 0) return undefined

  return JSON.stringify(normalized)
}

type HouseForm = {
  houseNo: string; area: string; phoneNo: string; alternativePhone: string;
  description: string; rate1Type: string; rate1: string; rate2Type: string; rate2: string;
  shift: 'morning' | 'evening' | 'shop'; supplierId: string; position: string; dailyAlerts: string; previousBalance: string;
}

type HouseConfigForm = {
  houseId: string
  shift: 'morning' | 'evening' | 'shop'
  supplierId: string
  position: string
  dailyAlerts: string
}

const emptyForm: HouseForm = {
  houseNo: '', area: '', phoneNo: '', alternativePhone: '',
  description: '', rate1Type: '', rate1: '', rate2Type: '', rate2: '',
  shift: 'evening', supplierId: '', position: '0', dailyAlerts: '', previousBalance: '',
}

const emptyConfigForm: HouseConfigForm = {
  houseId: '',
  shift: 'morning',
  supplierId: '',
  position: '0',
  dailyAlerts: '',
}

type ShiftFilter = 'all' | 'morning' | 'evening' | 'shop'
type PaymentFilter = 'all' | 'clear' | 'pending' | 'advance'
type HouseStatusFilter = 'activated' | 'deactivated' | 'all'
type HouseToggleAction = 'deactivate' | 'reactivate' | 'delete'
type ToggleDialogMode = 'deactivate-confirm' | 'inactive-choice' | null

function getHouseShift(house: House): 'morning' | 'evening' | 'shop' {
  return house.configs?.[0]?.shift ?? 'evening'
}

function getHousePaymentStatus(house: House): Exclude<PaymentFilter, 'all'> {
  const balance = Number(house.balance?.previousBalance ?? 0)
  if (balance > 0) return 'pending'
  if (balance < 0) return 'advance'
  return 'clear'
}

function matchesHouseStatusFilter(house: House, filter: HouseStatusFilter): boolean {
  if (filter === 'all') return true
  return filter === 'activated' ? house.active : !house.active
}

function getHouseConfigWithAlerts(configs?: HouseConfig[]): HouseConfig | undefined {
  if (!Array.isArray(configs) || configs.length === 0) return undefined

  return configs.find((config) => parseDailyAlerts(config.dailyAlerts).length > 0) ?? configs[0]
}

function getFilteredHouses(houses: House[], query: string): House[] {
  const q = query.trim().toLowerCase()
  if (!q) return houses.sort((a, b) => a.houseNo.localeCompare(b.houseNo))

  const exactMatches: typeof houses = []
  const partialMatches: typeof houses = []

  houses.forEach((house) => {
    const houseNo = house.houseNo.toLowerCase()
    const area = (house.area || '').toLowerCase()

    if (houseNo === q || area === q) {
      exactMatches.push(house)
    } else if (houseNo.includes(q) || area.includes(q)) {
      partialMatches.push(house)
    }
  })

  exactMatches.sort((a, b) => a.houseNo.localeCompare(b.houseNo))
  partialMatches.sort((a, b) => a.houseNo.localeCompare(b.houseNo))

  return [...exactMatches, ...partialMatches]
}

export default function HousesPage() {
  const cachedHouses = useLiveQuery(() => db.houses.toArray())
  const cachedSuppliers = useLiveQuery(() => db.users.where('role').equals('supplier').toArray())
  const houses = useMemo(() => (cachedHouses ?? []).filter((h) => h.id > 0), [cachedHouses])
  const suppliers = useMemo(() => cachedSuppliers ?? [], [cachedSuppliers])
  const [hydrated, setHydrated] = useState(false)
  const [search, setSearch] = useState('')
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('all')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [houseStatusFilter, setHouseStatusFilter] = useState<HouseStatusFilter>('activated')
  const [form, setForm] = useState<HouseForm>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toggleId, setToggleId] = useState<number | null>(null)
  const [toggleDialogMode, setToggleDialogMode] = useState<ToggleDialogMode>(null)
  const [viewHouse, setViewHouse] = useState<House | null>(null)
  const [saving, setSaving] = useState(false)
  const [formConfigId, setFormConfigId] = useState<number | null>(null)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [configEditingId, setConfigEditingId] = useState<number | null>(null)
  const [configForm, setConfigForm] = useState<HouseConfigForm>(emptyConfigForm)
  const [dialogSuppliers, setDialogSuppliers] = useState<User[]>([])
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryHouse, setSummaryHouse] = useState<House | null>(null)
  const [summaryBalance, setSummaryBalance] = useState<HouseBalance | null>(null)
  const [summaryLogs, setSummaryLogs] = useState<DeliveryLog[]>([])
  const [productRates, setProductRates] = useState<ProductRate[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryBills, setSummaryBills] = useState<Bill[]>([])
  const [summaryPeriod, setSummaryPeriod] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [summaryFromDate, setSummaryFromDate] = useState<string>('')
  const [summaryToDate, setSummaryToDate] = useState<string>('')
  const [editDeliveryDialogOpen, setEditDeliveryDialogOpen] = useState(false)
  const [editingDeliveryLog, setEditingDeliveryLog] = useState<DeliveryLog | null>(null)
  const [editingDeliveryShifts, setEditingDeliveryShifts] = useState<string[]>([])
  const [editingDeliveryAllLogs, setEditingDeliveryAllLogs] = useState<DeliveryLog[]>([])
  const [deletingDeliveryLog, setDeletingDeliveryLog] = useState<DeliveryLog | null>(null)
  const [editDeliveryForm, setEditDeliveryForm] = useState<DeliveryEditForm>({ items: [], note: '' })
  const [editDeliverySaving, setEditDeliverySaving] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [allExportOpen, setAllExportOpen] = useState(false)
  const [allExportMonth, setAllExportMonth] = useState(new Date().getMonth() + 1)
  const [allExportYear, setAllExportYear] = useState(new Date().getFullYear())
  const [allExportLoading, setAllExportLoading] = useState(false)
  const [visibleHouseCount, setVisibleHouseCount] = useState(HOUSES_PER_PAGE)
  const loading = !hydrated && (!cachedHouses || !cachedSuppliers)
  const loadMoreSentinelRef = useRef<HTMLTableRowElement | null>(null)
  const houseLoadMoreLockRef = useRef(false)
  const summaryRequestIdRef = useRef(0)

  const filteredSummaryLogs = useMemo(() => {
    if (!summaryFromDate || !summaryToDate) return summaryLogs
    const from = new Date(summaryFromDate)
    const to = new Date(summaryToDate)
    to.setHours(23, 59, 59, 999)
    return summaryLogs.filter(log => {
      const d = new Date(log.deliveredAt)
      return d >= from && d <= to
    })
  }, [summaryLogs, summaryFromDate, summaryToDate])

  const summaryRows = useMemo(() => {
    if (!summaryHouse) return []
    return buildHouseDeliverySummary(filteredSummaryLogs, summaryPeriod.year, summaryPeriod.month)
  }, [summaryHouse, filteredSummaryLogs, summaryPeriod])

  const matchingBills = useMemo(() => {
    const monthStart = new Date(summaryPeriod.year, summaryPeriod.month, 1)
    const monthEnd = new Date(summaryPeriod.year, summaryPeriod.month + 1, 1)
    return summaryBills.filter(b => {
      const bFrom = new Date(b.fromDate ?? `${b.year}-${String(b.month).padStart(2, '0')}-01`)
      const bTo = new Date(b.toDate ?? `${b.year}-${String(b.month).padStart(2, '0')}-28`)
      return bFrom < monthEnd && bTo > monthStart
    })
  }, [summaryBills, summaryPeriod])

  const monthlyProductSummary = useMemo(() => {
    if (!summaryHouse) return []

    // Compute ALL logs for this month (don't rely on billGenerated flag which may be stale in client cache)
    const allMonthLogs = filteredSummaryLogs.filter(log => {
      const d = new Date(log.deliveredAt)
      return d.getFullYear() === summaryPeriod.year && d.getMonth() === summaryPeriod.month
    })

    // Total quantities from all delivery logs
    const totalMap = new Map<string, number>()
    for (const log of allMonthLogs) {
      for (const item of log.items ?? []) {
        const product = normalizeMilkType(item.milkType)
        const qty = Number(item.qty ?? 0)
        if (product && qty > 0) {
          totalMap.set(product, (totalMap.get(product) ?? 0) + qty)
        }
      }
    }

    // If bills exist, subtract all bill items to get pending-only quantities
    for (const bill of matchingBills) {
      if (bill.items?.length) {
        const items = bill.items as BillItem[]
        for (const item of items) {
          if (item.name && item.qty > 0) {
            const product = cleanItemName(item.name)
            const current = totalMap.get(product) ?? 0
            totalMap.set(product, Math.max(0, current - item.qty))
          }
        }
      }
    }

    return Array.from(totalMap.entries())
      .filter(([, qty]) => qty > 0)
      .map(([product, quantity]) => ({
        product,
        months: [{ month: summaryPeriod.month, year: summaryPeriod.year, quantity }],
        totalQuantity: quantity,
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
  }, [summaryHouse, filteredSummaryLogs, summaryPeriod, matchingBills])

  const pdfMonthlyProductSummary = useMemo(() => {
    if (!summaryHouse) return []

    const allMonthLogs = filteredSummaryLogs.filter(log => {
      const d = new Date(log.deliveredAt)
      return d.getFullYear() === summaryPeriod.year && d.getMonth() === summaryPeriod.month
    })

    const totalMap = new Map<string, { qty: number; amount: number }>()
    for (const log of allMonthLogs) {
      for (const item of log.items ?? []) {
        const product = normalizeMilkType(item.milkType)
        const qty = Number(item.qty ?? 0)
        const amount = Number(item.amount ?? 0)
        if (product && qty > 0) {
          const existing = totalMap.get(product) ?? { qty: 0, amount: 0 }
          totalMap.set(product, { qty: existing.qty + qty, amount: existing.amount + amount })
        }
      }
    }

    return Array.from(totalMap.entries())
      .filter(([, data]) => data.qty > 0)
      .map(([product, data]) => ({
        product,
        months: [{ month: summaryPeriod.month, year: summaryPeriod.year, quantity: data.qty }],
        totalQuantity: data.qty,
        totalAmount: data.amount,
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
  }, [summaryHouse, filteredSummaryLogs, summaryPeriod])

  const paymentSummaryRows = useMemo<PaymentSummaryRow[]>(() => {
    if (!summaryHouse) return []

    const allPayments = [...(summaryBalance?.payments ?? [])].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    )

    const payments = allPayments.filter((payment) => {
      const d = new Date(payment.paidAt || payment.createdAt)
      return d.getFullYear() === summaryPeriod.year && d.getMonth() === summaryPeriod.month
    })

    const baseOutstanding = Number(
      summaryBalance?.previousBalance ??
      summaryBalance?.currentBalance ??
      summaryHouse.balance?.previousBalance ??
      summaryHouse.balance?.currentBalance ??
      0,
    )

    const totalApplied = payments.reduce(
      (sum, payment) => sum + Number(payment.amount ?? 0) + Number(payment.discount ?? 0),
      0,
    )

    let remainingAmount = Math.max(0, baseOutstanding + totalApplied)

    return payments.map((payment) => {
      const paidAmount = Number(payment.amount ?? 0)
      const discount = Number(payment.discount ?? 0)
      remainingAmount = Math.max(0, remainingAmount - paidAmount - discount)

      return {
        id: payment.id,
        paidAt: payment.paidAt || payment.createdAt,
        paidAmount,
        discount,
        remainingAmount,
        note: payment.note,
      }
    })
  }, [summaryBalance, summaryHouse, summaryPeriod])

  const hasDateRangeFilter = summaryFromDate !== '' && summaryToDate !== ''

  const displaySummaryRows = useMemo(() => {
    if (!hasDateRangeFilter) return summaryRows
    const from = new Date(summaryFromDate)
    const to = new Date(summaryToDate)
    to.setHours(23, 59, 59, 999)
    return summaryRows.filter(row => {
      const d = new Date(row.dateKey)
      return d >= from && d <= to
    })
  }, [summaryRows, summaryFromDate, summaryToDate, hasDateRangeFilter])

  const summaryTotals = useMemo(() => {
    if (!summaryHouse) return { productTotals: [] as Array<{ product: string; quantity: number; amount: number }>, grandTotal: 0, previousBalance: 0, pendingTotal: 0 }

    // Compute ALL logs for this month (don't rely on stale billGenerated flag)
    const allMonthLogs = filteredSummaryLogs.filter(log => {
      const d = new Date(log.deliveredAt)
      return d.getFullYear() === summaryPeriod.year && d.getMonth() === summaryPeriod.month
    })

    // Total quantities and amounts from all delivery logs
    const totalMap = new Map<string, { qty: number; amount: number }>()
    let allLogsGrandTotal = 0
    for (const log of allMonthLogs) {
      allLogsGrandTotal += Number(log.totalAmount ?? 0)
      for (const item of log.items ?? []) {
        const product = normalizeMilkType(item.milkType)
        const qty = Number(item.qty ?? 0)
        const amount = Number(item.amount ?? 0)
        if (product && qty > 0) {
          const existing = totalMap.get(product) ?? { qty: 0, amount: 0 }
          totalMap.set(product, { qty: existing.qty + qty, amount: existing.amount + amount })
        }
      }
    }

    // If bills exist, subtract all bill items to get pending-only quantities
    for (const bill of matchingBills) {
      const billItems = (bill.items as BillItem[]) ?? []
      for (const item of billItems) {
        if (item.name && item.qty > 0) {
          const product = cleanItemName(item.name)
          const existing = totalMap.get(product) ?? { qty: 0, amount: 0 }
          totalMap.set(product, {
            qty: Math.max(0, existing.qty - item.qty),
            amount: Math.max(0, existing.amount - item.amount),
          })
        }
      }
    }

    const billsTotalAmount = matchingBills.reduce((sum, b) => sum + Number(b.totalAmount), 0)
    const pendingGrandTotal = allLogsGrandTotal - billsTotalAmount
    const pendingTotal = Array.from(totalMap.values()).reduce((sum, d) => sum + d.amount, 0)

    return {
      productTotals: Array.from(totalMap.entries())
        .filter(([, data]) => data.qty > 0)
        .map(([product, data]) => ({ product, quantity: data.qty, amount: data.amount })),
      grandTotal: matchingBills.length > 0 ? billsTotalAmount + Math.max(0, pendingGrandTotal) : allLogsGrandTotal,
      previousBalance: matchingBills.length > 0 ? Number(matchingBills[0].previousBalance ?? 0) : Number(summaryBalance?.previousBalance ?? 0),
      pendingTotal,
    }
  }, [summaryHouse, filteredSummaryLogs, summaryPeriod, matchingBills])

  const editDeliveryTotal = useMemo(() => {
    return (editDeliveryForm.items || []).reduce((sum, it) => sum + Number(it?.amount ?? 0), 0)
  }, [editDeliveryForm.items])

  const handleExportSummaryPdf = useCallback(() => {
    if (!summaryHouse) return

    if (summaryRows.length === 0) {
      toast.error('No summary data available to export')
      return
    }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const title = `House ${summaryHouse.houseNo} Delivery Summary`
    const periodLabel = `${MONTH_NAMES[summaryPeriod.month + 1]} ${summaryPeriod.year}`

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(title, 14, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (hasDateRangeFilter) {
      doc.text(`Date Range: ${summaryFromDate} to ${summaryToDate}`, 14, 21)
    } else {
      doc.text(`Period: ${periodLabel}`, 14, 21)
    }
    if (summaryHouse.area) {
      doc.text(`Area: ${summaryHouse.area}`, 14, 26)
    }

    let currentY = 30

    const monthKeys = Array.from(new Set(pdfMonthlyProductSummary.flatMap((row) => row.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort()
    const monthLabels = monthKeys.map((monthKey) => {
      const [year, month] = monthKey.split('-').map(Number)
      return `${MONTH_NAMES[month]} ${year}`
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const leftMargin = 14
    const bottom = 10
    const headerHeight = 9
    const rowHeight = 8
    const paddingX = 2
    const lineHeight = 3.6

    const paymentsExist = paymentSummaryRows.length > 0
    const splitX = 94
    const rightSideX = paymentsExist ? splitX : leftMargin
    const rightTableWidth = paymentsExist ? (pageWidth - leftMargin - splitX) : (pageWidth - leftMargin - leftMargin)
    const productColWidth = monthLabels.length > 0 ? Math.max(50, Math.min(68, rightTableWidth * 0.4)) : rightTableWidth
    const monthColWidth = monthLabels.length > 0 ? (rightTableWidth - productColWidth) / monthLabels.length : 0

    const toLines = (text: string, width: number): string[] => {
      const lines = doc.splitTextToSize(text, Math.max(8, width - (paddingX * 2)))
      return Array.isArray(lines) ? lines : [String(lines)]
    }

    const drawCell = (
      x: number,
      y: number,
      width: number,
      height: number,
      text: string | string[],
      align: 'left' | 'right' = 'left',
      bold = false,
      fillColor: [number, number, number] = [255, 255, 255],
      textColor: [number, number, number] = [17, 24, 39],
    ) => {
      doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
      doc.setDrawColor(210, 214, 220)
      doc.rect(x, y, width, height, 'FD')
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(textColor[0], textColor[1], textColor[2])
      const lines = Array.isArray(text) ? text : toLines(text, width)
      const contentHeight = lines.length * lineHeight
      const textY = y + Math.max(2, (height - contentHeight) / 2) + (lineHeight - 1)
      const textX = align === 'right' ? x + width - paddingX : x + paddingX
      doc.text(lines, textX, textY, { align })
    }

    // Side by side: payments left, product summary right
    let paymentsEndY = currentY
    if (paymentsExist) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Received Payments', leftMargin, currentY)
      paymentsEndY = currentY + 4

      const totalReceived = paymentSummaryRows.reduce((sum, row) => sum + row.paidAmount, 0)
      const totalDiscount = paymentSummaryRows.reduce((sum, row) => sum + row.discount, 0)
      autoTable(doc, {
        startY: paymentsEndY,
        head: [['Date', 'Paid (₹)', 'Discount (₹)']],
        body: [
          ...paymentSummaryRows.map((row) => [
            new Date(row.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
            row.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
            row.discount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
          ]),
          ['Total Received', totalReceived.toLocaleString('en-IN', { maximumFractionDigits: 2 }), totalDiscount.toLocaleString('en-IN', { maximumFractionDigits: 2 })],
        ],
        margin: { left: leftMargin, right: pageWidth - splitX + 4 },
        styles: { fontSize: 7 },
        headStyles: { fillColor: [200, 200, 200] },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 16 },
          2: { cellWidth: 16 },
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paymentsEndY = (doc as any).lastAutoTable.finalY + 4
    }

    // Monthly Product Summary (right column when payments exist)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(17, 24, 39)
    doc.text('Monthly Product Summary', rightSideX, currentY)

    let summaryY = currentY + 4
    drawCell(rightSideX, summaryY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
    monthLabels.forEach((label, index) => {
      const x = rightSideX + productColWidth + (index * monthColWidth)
      drawCell(x, summaryY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
    })

    summaryY += headerHeight

    if (pdfMonthlyProductSummary.length === 0) {
      drawCell(rightSideX, summaryY, rightTableWidth, rowHeight, 'No product data available', 'left', false)
      summaryY += rowHeight
    } else {
      pdfMonthlyProductSummary.forEach((row) => {
        if (summaryY > pageHeight - bottom - rowHeight) {
          doc.addPage()
          summaryY = 10
          drawCell(rightSideX, summaryY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
          monthLabels.forEach((label, index) => {
            const x = rightSideX + productColWidth + (index * monthColWidth)
            drawCell(x, summaryY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
          })
          summaryY += headerHeight
        }

        const productTotal = pdfMonthlyProductSummary.find((item) => item.product === row.product)
        const rowValues = monthKeys.map((monthKey) => {
          const [year, month] = monthKey.split('-').map(Number)
          const monthData = row.months.find((item) => item.year === year && item.month === month - 1)
          return monthData ? `${monthData.quantity.toLocaleString('en-IN')}L - Rs ${(productTotal?.totalAmount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'
        })

        const productLines = toLines(row.product, productColWidth)
        const valueLines = rowValues.map((value) => toLines(value, monthColWidth))
        const maxLines = Math.max(productLines.length, ...valueLines.map((lines) => lines.length))
        const cellHeight = Math.max(rowHeight, (maxLines * lineHeight) + 4)

        drawCell(rightSideX, summaryY, productColWidth, cellHeight, productLines, 'left')
        valueLines.forEach((value, index) => {
          const x = rightSideX + productColWidth + (index * monthColWidth)
          drawCell(x, summaryY, monthColWidth, cellHeight, value, 'right')
        })
        summaryY += cellHeight
      })

      if (summaryY > pageHeight - bottom - rowHeight) {
        doc.addPage()
        summaryY = 10
        drawCell(rightSideX, summaryY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
        monthLabels.forEach((label, index) => {
          const x = rightSideX + productColWidth + (index * monthColWidth)
          drawCell(x, summaryY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
        })
        summaryY += headerHeight
      }

      // Total row
      const pdfTotalAmount = pdfMonthlyProductSummary.reduce((sum, row) => sum + row.totalAmount, 0)
      drawCell(rightSideX, summaryY, productColWidth, rowHeight, 'Total', 'left', true, [248, 250, 252])
      monthLabels.forEach((_, index) => {
        const x = rightSideX + productColWidth + (index * monthColWidth)
        drawCell(x, summaryY, monthColWidth, rowHeight, `Rs ${pdfTotalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [248, 250, 252])
      })
      summaryY += rowHeight

      // Previous Balance row
      if (summaryTotals.previousBalance > 0) {
        drawCell(rightSideX, summaryY, productColWidth, rowHeight, 'Previous Balance', 'left', true, [255, 255, 255])
        monthLabels.forEach((_, index) => {
          const x = rightSideX + productColWidth + (index * monthColWidth)
          drawCell(x, summaryY, monthColWidth, rowHeight, `Rs ${summaryTotals.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [255, 255, 255])
        })
        summaryY += rowHeight

        const grandTotalWithPrev = pdfTotalAmount + summaryTotals.previousBalance
        drawCell(rightSideX, summaryY, productColWidth, rowHeight, 'Grand Total', 'left', true, [255, 255, 255])
        monthLabels.forEach((_, index) => {
          const x = rightSideX + productColWidth + (index * monthColWidth)
          drawCell(x, summaryY, monthColWidth, rowHeight, `Rs ${grandTotalWithPrev.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [255, 255, 255])
        })
        summaryY += rowHeight
      }
    }

    currentY = Math.max(paymentsEndY, summaryY) + 4

    let deliveriesTitleY = currentY + 5
    if (deliveriesTitleY > pageHeight - 16) {
      doc.addPage()
      deliveriesTitleY = 14
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(17, 24, 39)
    doc.text('Daily Deliveries', 14, deliveriesTitleY)

    const daysLeft = displaySummaryRows.slice(0, 15)
    const daysRight = displaySummaryRows.slice(15)
    const deliveriesSplitX = 100
    const makeDeliveriesTable = (rows: any[], marginLeft: number, marginRight: number) => {
      if (rows.length === 0) return
      autoTable(doc, {
        startY: deliveriesTitleY + 4,
        head: [['Date', 'Products']],
        body: rows.map((row) => [row.dayLabel, row.hasDelivery ? row.productsLabel : '-']),
        styles: { font: 'helvetica', fontSize: 11, cellPadding: 1.5, overflow: 'linebreak', textColor: [0, 0, 0] },
        headStyles: { fillColor: [17, 24, 39], textColor: 255 },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 'auto' } },
        margin: { left: marginLeft, right: marginRight },
      })
    }
    makeDeliveriesTable(daysLeft, 14, pageWidth - deliveriesSplitX + 4)
    makeDeliveriesTable(daysRight, deliveriesSplitX, 14)

    // Add page numbers
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 5, { align: 'right' })
    }

    doc.save(`house-${summaryHouse.houseNo}-summary-${summaryPeriod.year}-${String(summaryPeriod.month + 1).padStart(2, '0')}.pdf`)
  }, [summaryHouse, summaryPeriod, summaryRows, pdfMonthlyProductSummary, summaryTotals, paymentSummaryRows, hasDateRangeFilter, summaryFromDate, summaryToDate, displaySummaryRows])

  const handleExportAllHousesSummaryPdf = useCallback(async (month: number, year: number) => {
    const activeHouses = houses.filter(h => h.active)
    if (activeHouses.length === 0) {
      toast.error('No active houses to export')
      return
    }

    // Sort: shop → evening → morning (morning grouped by supplier)
    const sortedHouses = [...activeHouses].sort((a, b) => {
      const aConfig = a.configs?.[0]
      const bConfig = b.configs?.[0]
      const aShift = aConfig?.shift
      const bShift = bConfig?.shift
      const aPosition = aConfig?.position ?? 999
      const bPosition = bConfig?.position ?? 999

      // Shop first
      if (aShift === 'shop' && bShift !== 'shop') return -1
      if (aShift !== 'shop' && bShift === 'shop') return 1

      // Then evening
      if (aShift === 'evening' && bShift === 'morning') return -1
      if (aShift === 'morning' && bShift === 'evening') return 1

      // Same shift
      if (aShift === 'evening' && bShift === 'evening') {
        // Evening: sort by position
        if (aPosition !== bPosition) return aPosition - bPosition
        return Number(a.houseNo) - Number(b.houseNo)
      }

      // Morning: sort by supplier (alphabetically), then by position
      if (aShift === 'morning' && bShift === 'morning') {
        const aSupplier = aConfig?.supplierId ? suppliers.find(s => s.uuid === aConfig.supplierId) : null
        const bSupplier = bConfig?.supplierId ? suppliers.find(s => s.uuid === bConfig.supplierId) : null

        const aSupplierName = aSupplier?.username ?? 'ZZZ'
        const bSupplierName = bSupplier?.username ?? 'ZZZ'

        if (aSupplierName !== bSupplierName) return aSupplierName.localeCompare(bSupplierName)
        if (aPosition !== bPosition) return aPosition - bPosition
        return Number(a.houseNo) - Number(b.houseNo)
      }

      return 0
    })

    setAllExportLoading(true)
    const toastId = toast.loading(`Generating summary for ${sortedHouses.length} houses...`)

    try {
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const leftMargin = 14
      const bottom = 10
      const headerHeight = 9
      const rowHeight = 8
      const paddingX = 2
      const lineHeight = 3.6

      const toLines = (text: string, width: number): string[] => {
        const lines = doc.splitTextToSize(text, Math.max(8, width - (paddingX * 2)))
        return Array.isArray(lines) ? lines : [String(lines)]
      }

      const drawCell = (
        x: number, y: number, width: number, height: number,
        text: string | string[], align: 'left' | 'right' = 'left',
        bold = false, fillColor: [number, number, number] = [255, 255, 255],
        textColor: [number, number, number] = [17, 24, 39],
      ) => {
        doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
        doc.setDrawColor(210, 214, 220)
        doc.rect(x, y, width, height, 'FD')
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setTextColor(textColor[0], textColor[1], textColor[2])
        const lines = Array.isArray(text) ? text : toLines(text, width)
        const contentHeight = lines.length * lineHeight
        const textY = y + Math.max(2, (height - contentHeight) / 2) + (lineHeight - 1)
        const textX = align === 'right' ? x + width - paddingX : x + paddingX
        doc.text(lines, textX, textY, { align })
      }

      // Track page numbers for each house (index 0 = index page, then house pages)
      const houseStartPages: number[] = []

      // Pre-fetch all data for all houses in parallel to speed up generation
      const allHouseIds = sortedHouses.map(h => h.id)
      const [allBalances, allLogs, allBills, rates] = await Promise.all([
        Promise.all(allHouseIds.map(id => balanceApi.get(id).catch(() => ({ id: 0, houseId: id, previousBalance: '0', currentBalance: '0' } as HouseBalance)))),
        Promise.all(allHouseIds.map(id => deliveryLogsApi.list({ houseId: id }, true))),
        Promise.all(allHouseIds.map(id => billsApi.list({ houseId: id }))),
        productRatesApi.list(),
      ])

      // Generate house pages
      for (let i = 0; i < sortedHouses.length; i++) {
        houseStartPages.push(doc.getNumberOfPages() + 1)
        doc.addPage()
        const house = sortedHouses[i]

        const houseIndex = i + 1
        const balanceResult = allBalances[i]
        const logs = allLogs[i]
        const bills = allBills[i]

        const period = { year, month: month - 1 }
        const filteredLogs = logs.filter(log => {
          const d = new Date(log.deliveredAt)
          return d.getFullYear() === year && d.getMonth() === month - 1
        })

        const monthStartPdf = new Date(year, month - 1, 1)
        const monthEndPdf = new Date(year, month, 1)
        const matchingBills = bills.filter(b => {
          const bFrom = new Date(b.fromDate ?? `${b.year}-${String(b.month).padStart(2, '0')}-01`)
          const bTo = new Date(b.toDate ?? `${b.year}-${String(b.month).padStart(2, '0')}-28`)
          return bFrom < monthEndPdf && bTo > monthStartPdf
        })

        const summaryRowsData = buildHouseDeliverySummary(filteredLogs, year, month - 1)

        const monthlyProdSummary: MonthlyProductSummary[] = matchingBills.length > 0
          ? Array.from(
            ((billList) => {
              const map = new Map<string, number>()
              for (const bill of billList) {
                for (const item of (bill.items as BillItem[])) {
                  if (item.name && item.qty > 0) {
                    const product = cleanItemName(item.name)
                    map.set(product, (map.get(product) ?? 0) + item.qty)
                  }
                }
              }
              return map
            })(matchingBills)
          ).map(([product, totalQty]) => ({
            product,
            months: [{ month: month - 1, year, quantity: totalQty }],
            totalQuantity: totalQty,
          })).sort((a, b) => b.totalQuantity - a.totalQuantity)
          : buildMonthlyProductSummary(filteredLogs.filter(l => !l.billGenerated), year, month - 1)

        const payments = [...(balanceResult?.payments ?? [])].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
        const baseOutstanding = Number(balanceResult?.previousBalance ?? house.balance?.previousBalance ?? 0)
        const totalApplied = payments.reduce((s, p) => s + Number(p.amount ?? 0) + Number(p.discount ?? 0), 0)
        let remainingAmount = Math.max(0, baseOutstanding + totalApplied)
        const payRows: PaymentSummaryRow[] = payments.map(p => {
          const paidAmount = Number(p.amount ?? 0)
          const discount = Number(p.discount ?? 0)
          remainingAmount = Math.max(0, remainingAmount - paidAmount - discount)
          return { id: p.id, paidAt: p.paidAt || p.createdAt, paidAmount, discount, remainingAmount, note: p.note }
        })

        let productTotals: Array<{ product: string; quantity: number; amount: number }> = []
        let grandTotal = 0
        let previousBalance = 0
        const pm = new Map<string, { qty: number; amount: number }>()

        // Compute ALL logs for this month (don't rely on stale billGenerated flag)
        const allMonthLogs = filteredLogs.filter(l => {
          const d = new Date(l.deliveredAt)
          return d.getFullYear() === year && d.getMonth() === month - 1
        })
        for (const log of allMonthLogs) {
          grandTotal += Number(log.totalAmount ?? 0)
          for (const item of log.items ?? []) {
            const prod = normalizeMilkType(item.milkType)
            const qty = Number(item.qty ?? 0)
            const amt = Number(item.amount ?? 0)
            if (prod && qty > 0) {
              const existing = pm.get(prod) ?? { qty: 0, amount: 0 }
              pm.set(prod, { qty: existing.qty + qty, amount: existing.amount + amt })
            }
          }
        }

        // If bills exist, subtract all bill items to get pending-only quantities
        for (const bill of matchingBills) {
          const billItems = (bill.items as BillItem[]) ?? []
          for (const item of billItems) {
            if (item.name && item.qty > 0) {
              const prod = cleanItemName(item.name)
              const existing = pm.get(prod) ?? { qty: 0, amount: 0 }
              pm.set(prod, {
                qty: Math.max(0, existing.qty - item.qty),
                amount: Math.max(0, existing.amount - item.amount),
              })
            }
          }
          grandTotal = grandTotal - Number(bill.totalAmount)
        }
        previousBalance = matchingBills.length > 0
          ? Number(matchingBills[0].previousBalance ?? 0)
          : Number(balanceResult?.previousBalance ?? 0)
        productTotals = Array.from(pm.entries()).filter(([, d]) => d.qty > 0).map(([p, d]) => ({ product: p, quantity: d.qty, amount: d.amount }))

        const monthLabel = `${MONTH_NAMES[month]} ${year}`
        const config = house.configs?.[0]
        const shiftLabel = config?.shift ? (config.shift === 'shop' ? 'Shop' : config.shift === 'morning' ? 'Morning' : 'Evening') : ''
        const supplierName = config?.supplier?.username ?? ''

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.text(`${houseIndex}. House ${house.houseNo} — ${shiftLabel}${supplierName ? ` (${supplierName})` : ''}`, leftMargin, 14)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.text(`Period: ${monthLabel}`, leftMargin, 21)
        if (house.area) doc.text(`Area: ${house.area}`, leftMargin, 26)

        let currentY = 30
        const monthKeys = [`${year}-${String(month).padStart(2, '0')}`]
        const monthLabels = [monthLabel]

        const paymentsExist = payRows.length > 0
        const splitX = 90
        const rightSideX = paymentsExist ? splitX : leftMargin
        const rightTableWidth = paymentsExist ? (pageWidth - leftMargin - splitX) : (pageWidth - leftMargin - leftMargin)
        const productColWidth = Math.max(45, Math.min(65, rightTableWidth * 0.4))
        const monthColWidth = (rightTableWidth - productColWidth)

        let paymentsEndY = currentY
        if (paymentsExist) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.text('Received Payments', leftMargin, currentY)
          paymentsEndY = currentY + 4

          const totalReceived = payRows.reduce((s, r) => s + r.paidAmount, 0)
          const totalDiscount = payRows.reduce((s, r) => s + r.discount, 0)
          autoTable(doc, {
            startY: paymentsEndY,
            head: [['Date', 'Paid (₹)', 'Disc (₹)']],
            body: [
              ...payRows.map(r => [
                new Date(r.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                r.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
                r.discount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
              ]),
              ['Total', totalReceived.toLocaleString('en-IN', { maximumFractionDigits: 2 }), totalDiscount.toLocaleString('en-IN', { maximumFractionDigits: 2 })],
            ],
            margin: { left: leftMargin, right: pageWidth - splitX + 2 },
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [200, 200, 200] },
            columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 15 }, 2: { cellWidth: 15 } },
          })
          paymentsEndY = (doc as any).lastAutoTable.finalY + 4
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(17, 24, 39)
        doc.text('Monthly Product Summary', rightSideX, currentY)

        let summaryY = currentY + 4
        drawCell(rightSideX, summaryY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
        monthLabels.forEach((label, idx) => {
          drawCell(rightSideX + productColWidth + idx * monthColWidth, summaryY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
        })
        summaryY += headerHeight

        if (monthlyProdSummary.length === 0) {
          drawCell(rightSideX, summaryY, rightTableWidth, rowHeight, 'No product data available', 'left')
          summaryY += rowHeight
        } else {
          for (const row of monthlyProdSummary) {
            if (summaryY > pageHeight - bottom - rowHeight) {
              doc.addPage()
              summaryY = 10
              drawCell(rightSideX, summaryY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
              monthLabels.forEach((label, idx) => {
                drawCell(rightSideX + productColWidth + idx * monthColWidth, summaryY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
              })
              summaryY += headerHeight
            }

            const prodTotal = productTotals.find(pt => pt.product === row.product)
            const rowValues = monthKeys.map(() => prodTotal ? `${row.totalQuantity.toLocaleString('en-IN')}L - Rs ${prodTotal.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-')

            const prodLines = toLines(row.product, productColWidth)
            const valLines = rowValues.map(v => toLines(v, monthColWidth))
            const maxLines = Math.max(prodLines.length, ...valLines.map(l => l.length))
            const cellHeight = Math.max(rowHeight, maxLines * lineHeight + 4)

            drawCell(rightSideX, summaryY, productColWidth, cellHeight, prodLines, 'left')
            valLines.forEach((lines, idx) => {
              drawCell(rightSideX + productColWidth + idx * monthColWidth, summaryY, monthColWidth, cellHeight, lines, 'right')
            })
            summaryY += cellHeight
          }

          if (summaryY > pageHeight - bottom - rowHeight) {
            doc.addPage()
            summaryY = 10
            drawCell(rightSideX, summaryY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
            monthLabels.forEach((label, idx) => {
              drawCell(rightSideX + productColWidth + idx * monthColWidth, summaryY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
            })
            summaryY += headerHeight
          }

          drawCell(rightSideX, summaryY, productColWidth, rowHeight, 'Total', 'left', true, [248, 250, 252])
          monthLabels.forEach((_, idx) => {
            drawCell(rightSideX + productColWidth + idx * monthColWidth, summaryY, monthColWidth, rowHeight, `Rs ${grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [248, 250, 252])
          })
          summaryY += rowHeight

          if (previousBalance > 0) {
            drawCell(rightSideX, summaryY, productColWidth, rowHeight, 'Previous Balance', 'left', true, [255, 255, 255])
            monthLabels.forEach((_, idx) => {
              drawCell(rightSideX + productColWidth + idx * monthColWidth, summaryY, monthColWidth, rowHeight, `Rs ${previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [255, 255, 255])
            })
            summaryY += rowHeight
            const grandWithPrev = grandTotal + previousBalance
            drawCell(rightSideX, summaryY, productColWidth, rowHeight, 'Grand Total', 'left', true, [255, 255, 255])
            monthLabels.forEach((_, idx) => {
              drawCell(rightSideX + productColWidth + idx * monthColWidth, summaryY, monthColWidth, rowHeight, `Rs ${grandWithPrev.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [255, 255, 255])
            })
            summaryY += rowHeight
          }
        }

        currentY = Math.max(paymentsEndY, summaryY) + 4

        let deliveriesTitleY = currentY + 5
        if (deliveriesTitleY > pageHeight - 16) {
          doc.addPage()
          deliveriesTitleY = 14
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(17, 24, 39)
        doc.text('Daily Deliveries', leftMargin, deliveriesTitleY)

        const daysLeft = summaryRowsData.slice(0, 15)
        const daysRight = summaryRowsData.slice(15)
        const deliveriesSplitX = 100
        if (daysLeft.length > 0) {
          autoTable(doc, {
            startY: deliveriesTitleY + 4,
            head: [['Date', 'Products']],
            body: daysLeft.map(r => [r.dayLabel, r.hasDelivery ? r.productsLabel : '-']),
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.5, overflow: 'linebreak', textColor: [0, 0, 0] },
            headStyles: { fillColor: [17, 24, 39], textColor: 255 },
            columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 'auto' } },
            margin: { left: leftMargin, right: pageWidth - deliveriesSplitX + 2 },
          })
        }
        if (daysRight.length > 0) {
          autoTable(doc, {
            startY: deliveriesTitleY + 4,
            head: [['Date', 'Products']],
            body: daysRight.map(r => [r.dayLabel, r.hasDelivery ? r.productsLabel : '-']),
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.5, overflow: 'linebreak', textColor: [0, 0, 0] },
            headStyles: { fillColor: [17, 24, 39], textColor: 255 },
            columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 'auto' } },
            margin: { left: deliveriesSplitX, right: leftMargin + 2 },
          })
        }
      }

      // Calculate house page numbers AFTER determining index page count
      const housePageCount = doc.getNumberOfPages()
      const housesPerIndexPage = 180
      const indexPageCount = Math.ceil(sortedHouses.length / housesPerIndexPage)

      // Insert all index pages at the beginning (this shifts all house pages by indexPageCount)
      for (let i = 0; i < indexPageCount; i++) {
        doc.insertPage(1)
      }

      // Build index entries with correct page numbers (offset by indexPageCount)
      const indexBody = sortedHouses.map((house, idx) => ({
        page: houseStartPages[idx] + indexPageCount,
        houseNo: String(house.houseNo),
      }))

      const buildIndexTable = (data: Array<{ page: number; houseNo: string }>, startY: number) => {
        const cols = 5
        const perCol = 36
        const rows = []
        for (let r = 0; r < perCol; r++) {
          const row = []
          for (let c = 0; c < cols; c++) {
            const entry = data[r + c * perCol]
            if (entry) { row.push(String(entry.page), entry.houseNo) }
            else { row.push('', '') }
          }
          rows.push(row)
        }
        return autoTable(doc, {
          startY,
          head: [['Pg', 'House', 'Pg', 'House', 'Pg', 'House', 'Pg', 'House', 'Pg', 'House']],
          body: rows,
          styles: { font: 'helvetica', fontSize: 10, cellPadding: 1, textColor: [0, 0, 0] },
          headStyles: { fillColor: [17, 24, 39], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { cellWidth: 13 }, 1: { cellWidth: 25 }, 2: { cellWidth: 13 }, 3: { cellWidth: 25 }, 4: { cellWidth: 13 }, 5: { cellWidth: 25 }, 6: { cellWidth: 13 }, 7: { cellWidth: 25 }, 8: { cellWidth: 13 }, 9: { cellWidth: 25 } },
          theme: 'grid',
          margin: { left: 10, right: 10 },
        })
      }

      const indexPagesList: Array<Array<{ page: number; houseNo: string }>> = []
      for (let i = 0; i < indexBody.length; i += housesPerIndexPage) {
        indexPagesList.push(indexBody.slice(i, i + housesPerIndexPage))
      }

      // Add content to each index page
      for (let i = 0; i < indexPageCount; i++) {
        doc.setPage(i + 1)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.text(i === 0 ? `All Houses Summary - Index` : `All Houses Summary - Index (${i + 1})`, leftMargin, 16)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.text(`Period: ${MONTH_NAMES[month]} ${year}`, leftMargin, 24)
        buildIndexTable(indexPagesList[i], 30)
      }

      // Add page numbers to all pages
      const finalPageCount = doc.getNumberOfPages()
      for (let pi = 1; pi <= finalPageCount; pi++) {
        doc.setPage(pi)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(`Page ${pi} of ${finalPageCount}`, pageWidth - 14, pageHeight - 5, { align: 'right' })
      }

      doc.save(`all-houses-summary-${month}-${year}.pdf`)
      toast.success(`Exported ${sortedHouses.length} house summaries`, { id: toastId })
    } catch (err: unknown) {
      toast.error(getErrorMessage(err), { id: toastId })
    } finally {
      setAllExportLoading(false)
      setAllExportOpen(false)
    }
  }, [houses, suppliers])

  const refreshCachedData = useCallback(async (silent = false) => {
    try {
      await Promise.all([
        housesApi.list(),
        usersApi.list('supplier', true),
        productRatesApi.list(),
      ])
    } catch (error: unknown) {
      if (!silent) {
        toast.error(getErrorMessage(error))
      }
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    void refreshCachedData()
  }, [refreshCachedData])

  const filtered = useMemo(() => {
    const query = search.trim()
    const filtered = houses.filter((house) => {
      const shift = getHouseShift(house)
      if (shiftFilter !== 'all' && shift !== shiftFilter) return false

      const paymentStatus = getHousePaymentStatus(house)
      if (paymentFilter !== 'all' && paymentStatus !== paymentFilter) return false

      if (!matchesHouseStatusFilter(house, houseStatusFilter)) return false

      return true
    })

    return getFilteredHouses(filtered, query)
  }, [houses, search, shiftFilter, paymentFilter, houseStatusFilter])

  const visibleFiltered = useMemo(() => filtered.slice(0, visibleHouseCount), [filtered, visibleHouseCount])
  const hasMoreVisibleHouses = visibleHouseCount < filtered.length

  useEffect(() => {
    setVisibleHouseCount(HOUSES_PER_PAGE)
  }, [filtered.length, search, shiftFilter, paymentFilter, houseStatusFilter])

  const loadMoreHouses = useCallback(() => {
    if (houseLoadMoreLockRef.current) return

    houseLoadMoreLockRef.current = true
    setVisibleHouseCount((current) => {
      const next = Math.min(current + HOUSES_PER_PAGE, filtered.length)
      if (next === current) {
        houseLoadMoreLockRef.current = false
        return current
      }
      return next
    })
    window.setTimeout(() => {
      houseLoadMoreLockRef.current = false
    }, 250)
  }, [filtered.length])

  useEffect(() => {
    if (!hasMoreVisibleHouses) return

    const node = loadMoreSentinelRef.current
    if (!node || !('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreHouses()
      }
    }, { root: null, rootMargin: '300px 0px', threshold: 0.01 })

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMoreVisibleHouses, filtered.length, visibleHouseCount, loadMoreHouses])

  useEffect(() => {
    if (!hasMoreVisibleHouses) return

    const node = loadMoreSentinelRef.current
    if (!node) return

    const rect = node.getBoundingClientRect()
    if (rect.top <= window.innerHeight + 300 && rect.bottom >= -300) {
      loadMoreHouses()
    }
  }, [hasMoreVisibleHouses, filtered.length, visibleHouseCount, loadMoreHouses])

  useEffect(() => {
    if (!hasMoreVisibleHouses) return

    const handleScroll = () => {
      const remaining = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight)
      if (remaining <= 300) {
        loadMoreHouses()
      }
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [hasMoreVisibleHouses, loadMoreHouses])

  const searchSuggestions = useMemo(() => {
    const query = search.trim()
    if (!query) return []

    const filtered = houses.filter((house) => {
      const shift = getHouseShift(house)
      if (shiftFilter !== 'all' && shift !== shiftFilter) return false

      const paymentStatus = getHousePaymentStatus(house)
      if (paymentFilter !== 'all' && paymentStatus !== paymentFilter) return false

      if (!matchesHouseStatusFilter(house, houseStatusFilter)) return false

      return true
    })

    return getFilteredHouses(filtered, query).slice(0, 6)
  }, [houses, search, shiftFilter, paymentFilter, houseStatusFilter])

  const handleSearchSelect = useCallback((value: string) => {
    setSearch(value)
    setIsSearchOpen(false)
  }, [])

  const clearSearch = useCallback(() => {
    setSearch('')
  }, [])

  const selectedConfigHouse = houses.find(h => h.id === Number.parseInt(configForm.houseId, 10))

  async function loadDialogSuppliers() {
    try {
      const res = await fetchApi('/users?role=supplier', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      })
      if (res.ok) {
        setDialogSuppliers(await res.json())
      }
    } catch { /* ignore */ }
  }

  function openAdd() {
    const auth = getSessionAuth()
    const maxHouses = auth?.maxHouses
    if (maxHouses && houses.length >= maxHouses) {
      toast.error(`Maximum house limit reached (${maxHouses}). You cannot create more houses.`, { duration: 5000 })
      return
    }
    setForm(emptyForm)
    setFormConfigId(null)
    setEditingId(null)
    setDialogOpen(true)
    void loadDialogSuppliers()
  }

  async function openEdit(h: House) {
    try {
      const fresh = await housesApi.get(h.id)
      const primaryConfig = getHouseConfigWithAlerts(fresh.configs)
      setForm({
        houseNo: fresh.houseNo, area: fresh.area ?? '', phoneNo: fresh.phoneNo,
        alternativePhone: fresh.alternativePhone ?? '', description: fresh.description ?? '',
        rate1Type: fresh.rate1Type ?? '', rate1: fresh.rate1 ?? '',
        rate2Type: fresh.rate2Type ?? '', rate2: fresh.rate2 ?? '',
        shift: primaryConfig?.shift ?? 'evening',
        supplierId: primaryConfig?.supplierId ?? '',
        position: String(primaryConfig?.position ?? 0),
        dailyAlerts: toAlertInputValue(primaryConfig?.dailyAlerts),
        previousBalance: fresh.balance?.previousBalance ? String(fresh.balance.previousBalance) : '',
      })
      setFormConfigId(primaryConfig?.id ?? null)
      setEditingId(fresh.id)
      setDialogOpen(true)
      void loadDialogSuppliers()
      return
    } catch {
      const primaryConfig = getHouseConfigWithAlerts(h.configs)
      setForm({
        houseNo: h.houseNo, area: h.area ?? '', phoneNo: h.phoneNo,
        alternativePhone: h.alternativePhone ?? '', description: h.description ?? '',
        rate1Type: h.rate1Type ?? '', rate1: h.rate1 ?? '',
        rate2Type: h.rate2Type ?? '', rate2: h.rate2 ?? '',
        shift: primaryConfig?.shift ?? 'evening',
        supplierId: primaryConfig?.supplierId ?? '',
        position: String(primaryConfig?.position ?? 0),
        dailyAlerts: toAlertInputValue(primaryConfig?.dailyAlerts),
        previousBalance: h.balance?.previousBalance ? String(h.balance.previousBalance) : '',
      })
      setFormConfigId(primaryConfig?.id ?? null)
      setEditingId(h.id)
      setDialogOpen(true)
    }
  }

  async function handleSave() {
    if (!form.houseNo || !form.phoneNo) {
      toast.error('House No and Phone No are required')
      return
    }
    if (form.shift === 'morning' && !form.supplierId) {
      toast.error('Select a supplier for morning shift')
      return
    }

    setSaving(true)
    try {
      const payload = {
        houseNo: form.houseNo,
        area: form.area || undefined,
        phoneNo: form.phoneNo,
        alternativePhone: form.alternativePhone || undefined,
        description: form.description || undefined,
        rate1Type: form.rate1Type || null,
        rate1: form.rate1 ? form.rate1 : null,
        rate2Type: form.rate2Type || null,
        rate2: form.rate2 ? form.rate2 : null,
      } as Partial<House>

      const savedHouse = editingId
        ? await housesApi.update(editingId, payload)
        : await housesApi.createSync(payload)

      const houseId = editingId ?? savedHouse?.id
      if (!houseId) {
        throw new Error('Unable to resolve house id')
      }

      const configPayload = {
        houseId,
        shift: form.shift,
        supplierId: form.shift === 'morning' ? form.supplierId : undefined,
        position: Number.isFinite(Number.parseInt(form.position, 10)) ? Number.parseInt(form.position, 10) : 0,
        dailyAlerts: toAlertStorageValue(form.dailyAlerts),
      }

      if (formConfigId) {
        await houseConfigApi.update(formConfigId, configPayload)
      } else {
        await houseConfigApi.create(configPayload)
      }

      if (form.previousBalance.trim() !== '') {
        const parsedPreviousBalance = Number(form.previousBalance)
        if (!Number.isFinite(parsedPreviousBalance)) {
          throw new Error('Previous balance must be a valid number')
        }
        await balanceApi.updatePrevious(houseId, parsedPreviousBalance)
      }

      toast.success(editingId ? 'House updated' : 'House added')
      setDialogOpen(false)
      void refreshCachedData(true)
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(action: HouseToggleAction) {
    if (!toggleId) return
    try {
      if (action === 'deactivate') {
        await housesApi.deactivate(toggleId)
        toast.success('House deactivated')
      } else if (action === 'reactivate') {
        await housesApi.reactivate(toggleId)
        toast.success('House reactivated')
      } else {
        await housesApi.delete(toggleId)
        toast.success('House deleted permanently')
        setToggleId(null)
        setToggleDialogMode(null)
        if (viewHouse?.id === toggleId) {
          setViewHouse(null)
        }
        return
      }
      setToggleId(null)
      setToggleDialogMode(null)
      void refreshCachedData(true)
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    }
  }

  async function openSummary(house: House) {
    const requestId = summaryRequestIdRef.current + 1
    summaryRequestIdRef.current = requestId

    setSummaryHouse(house)
    setSummaryBalance(null)
    setSummaryLogs([])
    setSummaryBills([])
    setProductRates([])
    setSummaryFromDate('')
    setSummaryToDate('')
    setDeletingDeliveryLog(null)
    setEditDeliveryDialogOpen(false)
    setSummaryOpen(true)
    setSummaryLoading(true)

    try {
      const [freshHouse, balance, logs, bills, rates] = await Promise.all([
        housesApi.get(house.id),
        balanceApi.get(house.id),
        deliveryLogsApi.list({ houseId: house.id }, true),
        billsApi.list({ houseId: house.id }),
        productRatesApi.list(),
      ])

      if (summaryRequestIdRef.current !== requestId) return

      setSummaryHouse(freshHouse)
      setSummaryBalance(balance)
      setSummaryLogs(logs)
      setSummaryBills(bills)
      setProductRates(rates.filter(r => r.isActive && Number(r.rate) > 0))
      setSummaryPeriod(getLogPeriod(logs))
    } catch (error: unknown) {
      if (summaryRequestIdRef.current === requestId) {
        toast.error(getErrorMessage(error))
      }
    } finally {
      if (summaryRequestIdRef.current === requestId) {
        setSummaryLoading(false)
      }
    }
  }

  async function handleChangeSummaryPeriod(newPeriod: { year: number; month: number }) {
    if (!summaryHouse || !isValidMonth(newPeriod.year, newPeriod.month)) return
    setSummaryPeriod(newPeriod)
  }

  function getBillForDateKey(dateKey: string): Bill | undefined {
    // dateKey format: "YYYY-MM-DD"
    const [yearStr, monthStr] = dateKey.split('-')
    const month = parseInt(monthStr) // bill.month is 1-indexed
    const year = parseInt(yearStr)
    return summaryBills.find((bill) => bill.month === month && bill.year === year)
  }

  function getPreferredRateForHouse(milkType: string): number {
    const mt = normalizeRateType(milkType)
    // Prefer house-specific rates if present
    if (summaryHouse) {
      const r1Type = normalizeRateType(summaryHouse.rate1Type)
      const r2Type = normalizeRateType(summaryHouse.rate2Type)
      if (r1Type && r1Type === mt && Number(summaryHouse.rate1) > 0) return Number(summaryHouse.rate1)
      if (r2Type && r2Type === mt && Number(summaryHouse.rate2) > 0) return Number(summaryHouse.rate2)
    }
    return getRateByProductName(productRates, milkType)
  }

  function isDeliveryBlockedByBill(dateKey: string): boolean {
    const bill = getBillForDateKey(dateKey)
    if (!bill) return false

    const [y, m, d] = dateKey.split('-').map(Number)
    const deliveryTs = new Date(y, m - 1, d).getTime()

    // Use fromDate/toDate for period comparison (avoids timezone issues with generatedDate)
    if (bill.fromDate) {
      const from = new Date(bill.fromDate)
      const fromTs = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
      if (deliveryTs < fromTs) return false
    }

    if (bill.toDate) {
      const to = new Date(bill.toDate)
      const toTs = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
      return deliveryTs <= toTs
    }

    // Fallback: if bill exists for the month, block edits for safety
    return true
  }

  function openEditDeliveryDialog(row: HouseDeliverySummaryRow) {
    // Check if this specific date is blocked by a generated bill
    if (isDeliveryBlockedByBill(row.dateKey) || Boolean(row.log?.billGenerated)) {
      toast.error('Cannot edit deliveries that were included in a generated bill')
      return
    }

    if (row.log) {
      // Edit existing delivery — combine items from ALL logs for this date
      setEditingDeliveryLog(row.log)
      const logsForDate = row.allLogs ?? [row.log]
      // Collect all unique shifts
      const uniqueShifts = [...new Set(logsForDate.map(l => l.shift).filter(Boolean))]
      setEditingDeliveryShifts(uniqueShifts)
      setEditingDeliveryAllLogs(logsForDate)
      const allItems = logsForDate.flatMap((log) =>
        normalizeDeliveryItems(log.items).map((it) => {
          const qty = Number(it.qty ?? 0)
          const rate = getPreferredRateForHouse(it.milkType)
          return { ...it, rate, amount: qty * rate }
        })
      )
      setEditDeliveryForm({
        items: allItems,
        note: row.log.note,
      })
    } else {
      // No delivery for this date yet - create new one
      const [year, month, day] = row.dateKey.split('-').map(Number)
      const deliveryDate = new Date(year, month - 1, day)
      const primaryConfig = getHouseConfigWithAlerts(summaryHouse?.configs)
      const shift = primaryConfig?.shift || 'morning'
      const activeProducts = getActiveProducts(productRates)
      const firstProduct = activeProducts[0] || { name: '', rate: 0 }
      const newLog: DeliveryLog = {
        id: 0, // Temporary ID for new deliveries
        houseId: summaryHouse?.id ?? 0,
        deliveredAt: deliveryDate.toISOString(),
        createdAt: new Date().toISOString(),
        shift: shift as 'morning' | 'evening' | 'shop',
        items: [],
        billGenerated: false,
        isClosed: false,
        totalAmount: '0',
        openingBalance: '0',
        closingBalance: '0',
        note: '',
      }
      setEditingDeliveryLog(newLog)
      setEditDeliveryForm({
        items: [{ milkType: firstProduct.name, qty: 0, rate: getPreferredRateForHouse(firstProduct.name), amount: 0 }],
        note: ''
      })
    }
    setEditDeliveryDialogOpen(true)
  }

  async function handleSaveDeliveryEdit() {
    if (!editingDeliveryLog || !summaryHouse) return

    setEditDeliverySaving(true)
    try {
      const isNewDelivery = editingDeliveryLog.id === 0
      // Old amount = sum across ALL logs for this date (not just the first)
      const oldAmount = isNewDelivery
        ? 0
        : editingDeliveryAllLogs.reduce(
          (sum, log) => sum + (log.items ?? []).reduce((s, item) => s + (Number(item.amount) ?? 0), 0),
          0
        )
      const newAmount = editDeliveryForm.items.reduce((sum, item) => sum + (Number(item.amount) ?? 0), 0)
      const amountDifference = newAmount - oldAmount

      // Save delivery changes (create or update)
      if (isNewDelivery) {
        await deliveryLogsApi.create({
          houseId: summaryHouse.id,
          shift: editingDeliveryLog.shift as 'morning' | 'evening' | 'shop',
          items: editDeliveryForm.items,
          note: editDeliveryForm.note,
          deliveredAt: editingDeliveryLog.deliveredAt,
        })
      } else {
        // Update the primary log with all combined items
        await deliveryLogsApi.update(editingDeliveryLog.id, {
          items: editDeliveryForm.items,
          note: editDeliveryForm.note,
        })

        // Delete all secondary logs for this date so no stale/duplicate data remains
        const secondaryLogs = editingDeliveryAllLogs.filter(l => l.id !== editingDeliveryLog.id)
        for (const log of secondaryLogs) {
          try {
            await deliveryLogsApi.delete(log.id)
          } catch (err) {
            console.warn(`Could not delete secondary log ${log.id}:`, err)
          }
        }
      }

      toast.success('Delivery updated successfully')

      // Update balance if amount changed
      if (amountDifference !== 0) {
        try {
          const currentBalance = await balanceApi.get(summaryHouse.id)
          await balanceApi.updateCurrent(summaryHouse.id, parseFloat(currentBalance.currentBalance) || 0)
        } catch (error: unknown) {
          console.error('Failed to update balance:', error)
          toast.warning('Balance update failed — delivery saved but balance unchanged')
        }
      }

      // Reload logs to get clean updated data
      const logs = await deliveryLogsApi.list({ houseId: summaryHouse.id }, true)
      setSummaryLogs(logs)

      setEditDeliveryDialogOpen(false)
      setEditingDeliveryLog(null)
      setEditingDeliveryAllLogs([])
      setEditingDeliveryShifts([])
      setEditDeliveryForm({ items: [], note: '' })
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setEditDeliverySaving(false)
    }
  }


  async function handleDeleteDeliveryLog() {
    if (!deletingDeliveryLog || !summaryHouse) return
    const deleteDateKey = deletingDeliveryLog.deliveredAt ? new Date(deletingDeliveryLog.deliveredAt).toISOString().split('T')[0] : ''
    if (deleteDateKey && isDeliveryBlockedByBill(deleteDateKey)) {
      toast.error('Cannot delete a delivery that was included in a generated bill')
      return
    }
    setEditDeliverySaving(true)
    try {
      await deliveryLogsApi.delete(deletingDeliveryLog.id)
      const logs = await deliveryLogsApi.list({ houseId: summaryHouse.id }, true)
      setSummaryLogs(logs)
      setDeletingDeliveryLog(null)
      toast.success('Delivery log deleted successfully')
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setEditDeliverySaving(false)
    }
  }

  async function openView(h: House) {
    try {
      const full = await housesApi.get(h.id)
      setViewHouse(full)
    } catch {
      setViewHouse(h)
    }
  }

  function openConfigDialog(house: House, config?: HouseConfig) {
    const houseConfig = config ?? getHouseConfigWithAlerts(house.configs)
    setConfigEditingId(houseConfig?.id ?? null)
    setConfigForm({
      houseId: String(house.id),
      shift: houseConfig?.shift ?? 'morning',
      supplierId: houseConfig?.supplierId ?? '',
      position: String(houseConfig?.position ?? 0),
      dailyAlerts: toAlertInputValue(houseConfig?.dailyAlerts),
    })
    setConfigDialogOpen(true)
    void loadDialogSuppliers()
  }

  async function handleConfigSave() {
    if (!configForm.houseId) {
      toast.error('Select a house')
      return
    }
    if (configForm.shift === 'morning' && !configForm.supplierId) {
      toast.error('Select a supplier for morning shift')
      return
    }

    setConfigSaving(true)
    try {
      const positionValue = Number.parseInt(configForm.position, 10)
      const payload = {
        houseId: parseInt(configForm.houseId),
        shift: configForm.shift,
        supplierId: configForm.shift === 'morning' ? configForm.supplierId : undefined,
        position: Number.isFinite(positionValue) ? positionValue : 0,
        dailyAlerts: toAlertStorageValue(configForm.dailyAlerts),
      }

      const selectedHouseId = parseInt(configForm.houseId)
      const selectedHouse = houses.find(house => house.id === selectedHouseId)
      const existingConfigId = configEditingId ?? selectedHouse?.configs?.[0]?.id ?? null

      if (existingConfigId) {
        await houseConfigApi.update(existingConfigId, payload)
        toast.success('House config updated')
      } else {
        await houseConfigApi.create(payload)
        toast.success('House config created')
      }

      setConfigDialogOpen(false)
      setConfigEditingId(null)
      setConfigForm(emptyConfigForm)
      void refreshCachedData(true)
      if (viewHouse?.id === selectedHouseId) {
        const refreshed = await housesApi.get(selectedHouseId)
        setViewHouse(refreshed)
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setConfigSaving(false)
    }
  }

  const handleExportHousesPdf = () => {
    if (filtered.length === 0) {
      toast.error('No houses to export')
      return
    }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const title = 'Houses List'

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(title, 14, 16)

    autoTable(doc, {
      startY: 24,
      head: [['House No', 'Address', 'Phone No', 'Balance']],
      body: filtered.filter(h => h.active).map((house) => [
        String(house.houseNo),
        house.area || '-',
        house.phoneNo || '-',
        house.balance ? `₹${(Number(house.balance.previousBalance) + Number(house.balance.currentBalance)).toLocaleString('en-IN')}` : '-',
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 3,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [17, 24, 39],
        textColor: 255,
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 50 },
        2: { cellWidth: 40 },
        3: { cellWidth: 35 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { top: 30, left: 14, right: 14 },
    })

    doc.save(`houses-list-${new Date().toISOString().split('T')[0]}.pdf`)
    toast.success('Houses exported successfully')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Administration
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Houses</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(true)}
              className="h-9 w-9 rounded-lg"
              aria-label="Search houses"
              title="Search houses"
            >
              <Search className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleExportHousesPdf}
              disabled={filtered.length === 0}
              className="h-9 w-9 rounded-lg sm:w-auto sm:size-auto sm:gap-2"
              title="Export to PDF"
            >
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Export PDF</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setAllExportMonth(new Date().getMonth() + 1)
                setAllExportYear(new Date().getFullYear())
                setAllExportOpen(true)
              }}
              disabled={filtered.length === 0}
              className="h-9 w-9 rounded-lg sm:w-auto sm:size-auto sm:gap-2"
              title="Export all houses summary PDF"
            >
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">All Summary</span>
            </Button>
            <Button onClick={openAdd} className="gap-2 sm:gap-2">
              <Plus className="h-4 w-4" /> Add House
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Select value={shiftFilter} onValueChange={(value) => setShiftFilter(value as ShiftFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Houses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Houses</SelectItem>
            <SelectItem value="morning">Morning</SelectItem>
            <SelectItem value="evening">Evening</SelectItem>
            <SelectItem value="shop">Shop</SelectItem>
          </SelectContent>
        </Select>

        <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as PaymentFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Payments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="clear">Clear</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="advance">Advance</SelectItem>
          </SelectContent>
        </Select>

        <Select value={houseStatusFilter} onValueChange={(value) => setHouseStatusFilter(value as HouseStatusFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Houses</SelectItem>
            <SelectItem value="activated">Activated</SelectItem>
            <SelectItem value="deactivated">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Search Houses</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by house no, area, or phone..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9 pr-10"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {search.trim() ? (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-background">
                {searchSuggestions.length > 0 ? (
                  <div className="divide-y divide-border">
                    {searchSuggestions.map((house) => (
                      <button
                        key={house.houseNo}
                        type="button"
                        onClick={() => handleSearchSelect(house.houseNo)}
                        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{house.houseNo}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {getHousePaymentStatus(house)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    No matching houses found.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                Type to search houses.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">{search ? 'No houses match your search' : 'No houses yet'}</p>
            {!search && <p className="text-sm mt-1">Click &quot;Add House&quot; to get started</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-full table-auto text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">House No</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-semibold text-muted-foreground sm:px-3">Pre Bal</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-semibold text-muted-foreground sm:px-3">Balance</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-semibold text-muted-foreground sm:px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleFiltered.map((h, idx) => (
                  <tr
                    key={h.id}
                    className={`border-b border-border/60 transition-colors ${h.active ? 'hover:bg-muted/30' : 'bg-red-500/5 hover:bg-red-500/10'} ${idx === visibleFiltered.length - 1 && !hasMoreVisibleHouses ? 'border-b-0' : ''}`}
                  >
                    <td className="px-2 py-2 sm:px-2">
                      <div className="flex flex-col gap-1">
                        <div>
                          <span className={`font-extrabold ${h.active ? 'text-foreground' : 'text-red-700 dark:text-red-300'}`}>{h.houseNo}</span>
                          {!h.active && (
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                              Deactivated
                            </Badge>
                          )}
                        </div>
                        <div className='flex flex-wrap gap-1'>
                          {h.rate1Type ? (
                            <Badge variant="outline" className="gap-1 font-medium">
                              {h.rate1Type.toLowerCase() === 'cow milk' ? 'CM' : h.rate1Type.toLowerCase() === 'buffalo milk' ? 'BM' : h.rate1Type} — ₹{h.rate1}
                            </Badge>
                          ) : ''}

                          {h.rate2Type ? (
                            <Badge variant="outline" className="gap-1 font-medium">
                              {h.rate2Type.toLowerCase() === 'cow milk' ? 'CM' : h.rate2Type.toLowerCase() === 'buffalo milk' ? 'BM' : h.rate2Type} — ₹{h.rate2}
                            </Badge>
                          ) : ''}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right sm:px-3">
                      {h.balance ? (
                        <span className={`font-semibold ${Number(h.balance.previousBalance) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          ₹{Number(h.balance.previousBalance).toLocaleString('en-IN')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right sm:px-3">
                      {h.balance ? (
                        <span className={`font-semibold ${(Number(h.balance.previousBalance) + Number(h.balance.currentBalance)) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          ₹{(Number(h.balance.previousBalance) + Number(h.balance.currentBalance)).toLocaleString('en-IN')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2 sm:px-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openView(h)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openSummary(h)} title="Summary">
                          <Rows3 className="h-4 w-4" />
                        </Button>
                        {h.active ? (
                          <Button variant="ghost" size="icon" onClick={() => { setToggleId(h.id); setToggleDialogMode('deactivate-confirm') }} title="Deactivate" className="text-destructive hover:text-destructive">
                            <PowerOff className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => { setToggleId(h.id); setToggleDialogMode('inactive-choice') }} title="Activate or delete permanently" className="text-green-600 hover:text-green-700">
                            <Save className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {hasMoreVisibleHouses && (
                  <tr ref={loadMoreSentinelRef} className="border-b border-border/60">
                    <td colSpan={6} className="px-2 py-3 text-center text-sm text-muted-foreground">
                      Scroll to the end to load more houses...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-5xl max-h-[94dvh] overflow-y-auto **:data-[slot=input]:h-10 **:data-[slot=select-trigger]:h-10 **:data-[slot=input]:placeholder:text-[11px] sm:**:data-[slot=input]:placeholder:text-xs **:data-[slot=input]:placeholder:text-muted-foreground/70 sm:**:data-[slot=input]:h-9 sm:**:data-[slot=select-trigger]:h-9"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit House' : 'Add New House'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update house details below.' : 'Fill in the house details to add a new delivery location.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-1.5 sm:gap-4 sm:py-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="house-houseNo">House No <span className="text-destructive">*</span></Label>
              <Input id="house-houseNo" value={form.houseNo} onChange={e => setForm(f => ({ ...f, houseNo: e.target.value }))} placeholder="e.g. A-101" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-area">Area</Label>
              <Input id="house-area" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="e.g. Sector 4" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-phone">Phone No <span className="text-destructive">*</span></Label>
              <Input id="house-phone" value={form.phoneNo} onChange={e => setForm(f => ({ ...f, phoneNo: e.target.value }))} placeholder="e.g. 9876543210" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-alt-phone">Alternative Phone</Label>
              <Input id="house-alt-phone" value={form.alternativePhone} onChange={e => setForm(f => ({ ...f, alternativePhone: e.target.value }))} placeholder="Optional" />
            </div>
            {/* Rate 1 */}
            <div className="space-y-1.5">
              <Label>Rate 1 Type</Label>
              <Select
                value={form.rate1Type || '__none__'}
                onValueChange={v => setForm(f => ({
                  ...f,
                  rate1Type: v === '__none__' ? '' : v,
                  rate1: v === '__none__' ? '' : f.rate1,
                }))}
              >
                <SelectTrigger id="house-rate1type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="Buffalo Milk">Buffalo Milk</SelectItem>
                  <SelectItem value="Cow Milk">Cow Milk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-rate1">Rate 1 (₹/L)</Label>
              <Input
                id="house-rate1"
                type="number"
                min="0"
                step="0.5"
                value={form.rate1}
                onChange={e => setForm(f => ({ ...f, rate1: e.target.value }))}
                placeholder={form.rate1Type ? 'e.g. 60' : 'Select a type first'}
                disabled={!form.rate1Type}
              />
            </div>
            {/* Rate 2 */}
            <div className="space-y-1.5">
              <Label>Rate 2 Type</Label>
              <Select
                value={form.rate2Type || '__none__'}
                onValueChange={v => setForm(f => ({
                  ...f,
                  rate2Type: v === '__none__' ? '' : v,
                  rate2: v === '__none__' ? '' : f.rate2,
                }))}
              >
                <SelectTrigger id="house-rate2type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="Buffalo Milk">Buffalo Milk</SelectItem>
                  <SelectItem value="Cow Milk">Cow Milk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-rate2">Rate 2 (₹/L)</Label>
              <Input
                id="house-rate2"
                type="number"
                min="0"
                step="0.5"
                value={form.rate2}
                onChange={e => setForm(f => ({ ...f, rate2: e.target.value }))}
                placeholder={form.rate2Type ? 'e.g. 50' : 'Select a type first'}
                disabled={!form.rate2Type}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-previous-balance">Previous Balance (₹)</Label>
              <Input
                id="house-previous-balance"
                type="number"
                step="0.01"
                value={form.previousBalance}
                onChange={e => setForm(f => ({ ...f, previousBalance: e.target.value }))}
                placeholder="e.g. 1200"
              />
            </div>
            <div className="col-span-2 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4 lg:col-span-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Delivery Allocation</p>

                </div>
                <Badge variant="outline" className="uppercase tracking-wide">Config</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="space-y-1.5">
                  <Label>Shift</Label>
                  <Select value={form.shift} onValueChange={v => setForm(f => ({ ...f, shift: v as 'morning' | 'evening', supplierId: v === 'evening' ? '' : f.supplierId }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                      <SelectItem value="shop">Shop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label>Supplier</Label>
                  <Select
                    value={form.supplierId || '__none__'}
                    onValueChange={v => setForm(f => ({ ...f, supplierId: v === '__none__' ? '' : v }))}
                    disabled={form.shift === 'evening'}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.shift === 'morning' ? 'Select supplier' : 'Shared route'} />
                    </SelectTrigger>
                    <SelectContent className="max-w-[min(92vw,28rem)]">
                      <SelectItem value="__none__">Unassigned </SelectItem>
                      {dialogSuppliers.map(supplier => (
                        <SelectItem key={supplier.uuid} value={supplier.uuid} className="max-w-full">
                          {supplier.username} - {supplier.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Daily Alerts</Label>
                  <DailyAlertsDialog
                    value={form.dailyAlerts}
                    onChange={value => setForm(f => ({ ...f, dailyAlerts: value }))}
                    placeholder="Open schedule editor"
                  />
                </div>
              </div>
            </div>
            <div className="col-span-2 sm:col-span-2 lg:col-span-3 space-y-1.5">
              <Label htmlFor="house-desc">Description / Notes</Label>
              <Textarea id="house-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update House' : 'Add House'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate/Reactivate Alert */}
      <AlertDialog open={!!toggleId} onOpenChange={open => { if (!open) { setToggleId(null); setToggleDialogMode(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleDialogMode === 'inactive-choice' ? 'What do you want to do?' : 'Deactivate House?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggleDialogMode === 'inactive-choice'
                ? 'You can reactivate this house or permanently delete it and all related data.'
                : 'This will deactivate the house. It will not be available for normal operations until reactivated.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {toggleDialogMode === 'inactive-choice' ? (
              <>
                <AlertDialogAction onClick={() => { void handleToggleActive('reactivate') }} className="bg-green-600 text-white hover:bg-green-700">
                  Activate House
                </AlertDialogAction>
                <AlertDialogAction onClick={() => { void handleToggleActive('delete') }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Permanently
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => { void handleToggleActive('deactivate') }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Deactivate
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View House Sheet */}
      <Dialog open={!!viewHouse} onOpenChange={open => !open && setViewHouse(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto **:data-[slot=input]:h-11 **:data-[slot=select-trigger]:h-11 sm:**:data-[slot=input]:h-9 sm:**:data-[slot=select-trigger]:h-9">
          {viewHouse && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  House {viewHouse.houseNo}
                </DialogTitle>
                {viewHouse.area && (
                  <DialogDescription className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {viewHouse.area}
                  </DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Phone" value={viewHouse.phoneNo} />
                  <InfoItem label="Alt. Phone" value={viewHouse.alternativePhone ?? '—'} />
                  <InfoItem label="Rate 1" value={viewHouse.rate1Type ? `${viewHouse.rate1Type} — ₹${viewHouse.rate1}/L` : '—'} />
                  <InfoItem label="Rate 2" value={viewHouse.rate2Type ? `${viewHouse.rate2Type} — ₹${viewHouse.rate2}/L` : '—'} />
                </div>
                {viewHouse.description && (
                  <InfoItem label="Notes" value={viewHouse.description} />
                )}

                {/* Balance */}
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Balance</p>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                        ₹{Number(viewHouse.balance?.previousBalance ?? 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Current Month</p>
                      <p className="text-xl font-bold text-primary">
                        ₹{Number(viewHouse.balance?.currentBalance ?? 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* House Configs */}
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">House Configs</p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => openConfigDialog(viewHouse)}>
                      <Settings2 className="h-3.5 w-3.5" /> {viewHouse.configs?.length ? 'Edit Config' : 'Add Config'}
                    </Button>
                  </div>
                  {viewHouse.configs && viewHouse.configs.length > 0 ? (
                    <div className="space-y-2">
                      {(() => {
                        const config = getHouseConfigWithAlerts(viewHouse.configs)
                        if (!config) return null

                        return (
                          <div key={config.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <Badge variant="secondary" className="uppercase tracking-wide">{config.shift}</Badge>
                              <span className="font-medium">
                                {config.shift === 'morning' ? (config.supplier?.username ?? 'Unassigned supplier') : 'Shared evening route'}
                              </span>
                              <span className="text-muted-foreground">Position {config.position + 1}</span>
                              {(() => {
                                const alertPreview = formatAlertPreview(config.dailyAlerts)
                                if (!alertPreview) return null

                                return <span className="text-xs text-amber-700 dark:text-amber-400">{alertPreview}</span>
                              })()}
                            </div>
                            <Button variant="ghost" size="sm" className="gap-2" onClick={() => openConfigDialog(viewHouse, config)}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No delivery config assigned to this house yet.</p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setViewHouse(null); openEdit(viewHouse) }}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button onClick={() => setViewHouse(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={summaryOpen} onOpenChange={(open) => {
        setSummaryOpen(open)
        if (!open) {
          summaryRequestIdRef.current += 1
          setSummaryHouse(null)
          setSummaryBalance(null)
          setSummaryLogs([])
          setSummaryBills([])
          setProductRates([])
          setSummaryLoading(false)
          setSummaryFromDate('')
          setSummaryToDate('')
          setDeletingDeliveryLog(null)
          setEditDeliveryDialogOpen(false)
          setEditingDeliveryLog(null)
          setEditingDeliveryAllLogs([])
          setEditDeliveryForm({ items: [], note: '' })
        }
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {summaryHouse && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Rows3 className="h-5 w-5 text-primary" />
                  House {summaryHouse.houseNo} Delivery Summary
                  <Button variant="ghost" size="icon" onClick={() => { setSummaryOpen(false); openView(summaryHouse) }} title="View Details">
                    <Eye className="h-4 w-4" />
                  </Button>
                </DialogTitle>
              </DialogHeader>

              {summaryLoading ? (
                <div className="space-y-4 py-4">
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Loading house summary</p>
                        <p className="text-xs text-muted-foreground">Fetching balance, deliveries, bills, and rates for House {summaryHouse?.houseNo}.</p>
                      </div>
                      <Rows3 className="h-5 w-5 animate-pulse text-primary" />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/40" />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <Skeleton className="h-20 rounded-xl" />
                      <Skeleton className="h-20 rounded-xl" />
                      <Skeleton className="h-20 rounded-xl" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 border-b border-border pb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleChangeSummaryPeriod(getPreviousMonth(summaryPeriod.year, summaryPeriod.month))}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-48 text-center text-sm font-medium">
                    {MONTH_NAMES[summaryPeriod.month + 1]} {summaryPeriod.year}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleChangeSummaryPeriod(getNextMonth(summaryPeriod.year, summaryPeriod.month))}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {!summaryLoading && (
                <div className="space-y-6 py-2">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1">
                        <Label className="text-xs">From Date</Label>
                        <Input type="date" value={summaryFromDate} onChange={e => setSummaryFromDate(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Upto Date</Label>
                        <Input type="date" value={summaryToDate} onChange={e => setSummaryToDate(e.target.value)} className="h-8 text-xs" />
                      </div>
                      {hasDateRangeFilter && (
                        <Button variant="ghost" size="sm" onClick={() => { setSummaryFromDate(''); setSummaryToDate('') }} className="h-8 self-end">
                          Clear
                        </Button>
                      )}
                    </div>
                    <h3 className="mb-3 text-sm font-semibold">Received Payments</h3>
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      {summaryLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-10 w-full rounded-lg" />
                          <Skeleton className="h-10 w-full rounded-lg" />
                          <Skeleton className="h-10 w-full rounded-lg" />
                        </div>
                      ) : paymentSummaryRows.length === 0 ? (
                        <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                          <History className="h-8 w-8 opacity-30" />
                          <p className="text-sm">No received payments found</p>
                          <p className="text-xs">This house has no recorded payment history yet.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/50">
                                <th className="px-4 py-3 text-left font-semibold text-foreground">Date</th>
                                <th className="px-4 py-3 text-right font-semibold text-foreground">Paid (₹)</th>
                                <th className="px-4 py-3 text-right font-semibold text-foreground">Discount (₹)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paymentSummaryRows.map((row, idx) => (
                                <tr key={row.id} className={`border-b border-border ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                  <td className="px-4 py-3 font-medium text-foreground">
                                    {new Date(row.paidAt).toLocaleDateString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                    ₹{row.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-4 py-3 text-right text-red-500">
                                    {row.discount > 0 ? `₹${row.discount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                                <td className="px-4 py-3 text-foreground">Total Received</td>
                                <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                                  ₹{paymentSummaryRows.reduce((sum, row) => sum + row.paidAmount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3 text-right text-red-500">
                                  ₹{paymentSummaryRows.reduce((sum, row) => sum + row.discount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {matchingBills.length > 0 && (() => {
                    const combinedMap = new Map<string, { name: string; qty: number; rate: number; amount: number }>()
                    for (const bill of matchingBills) {
                      for (const item of (bill.items as BillItem[])) {
                        if (!item.name || item.qty <= 0) continue
                        const cleanName = cleanItemName(item.name)
                        const key = `${cleanName}:${item.rate}`
                        const existing = combinedMap.get(key)
                        if (existing) {
                          existing.qty += item.qty
                          existing.amount += item.amount
                        } else {
                          combinedMap.set(key, { name: cleanName, qty: item.qty, rate: item.rate, amount: item.amount })
                        }
                      }
                    }
                    const combinedItems = Array.from(combinedMap.values())
                    const totalBillAmount = matchingBills.reduce((s, b) => s + Number(b.totalAmount), 0)
                    const latestPreviousBalance = Number(matchingBills[0].previousBalance ?? 0)
                    const dateRanges = matchingBills.map(b =>
                      b.fromDate && b.toDate
                        ? `${parseDateOnly(b.fromDate).toLocaleDateString('en-IN')} — ${parseDateOnly(b.toDate).toLocaleDateString('en-IN')}`
                        : null
                    ).filter(Boolean)

                    return (
                      <div>
                        <h3 className="mb-3 text-sm font-semibold">Generated Bills</h3>
                        {dateRanges.length > 0 && (
                          <div className="mb-2 text-xs text-muted-foreground">
                            {dateRanges.join(' | ')}
                          </div>
                        )}
                        <div className="rounded-xl border border-border bg-muted/30 p-4">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border bg-muted/50">
                                  <th className="px-4 py-3 text-left font-semibold text-foreground">Item</th>
                                  <th className="px-4 py-3 text-right font-semibold text-foreground">Qty (L)</th>
                                  <th className="px-4 py-3 text-right font-semibold text-foreground">Rate (₹)</th>
                                  <th className="px-4 py-3 text-right font-semibold text-foreground">Amount (₹)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {combinedItems.map((item, idx) => (
                                  <tr key={idx} className={`border-b border-border ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                    <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                                    <td className="px-4 py-3 text-right text-foreground">{item.qty.toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3 text-right text-foreground">{item.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-foreground">₹{item.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-border bg-muted/50 font-semibold">
                                  <td className="px-4 py-3 text-amber-600 dark:text-amber-400" colSpan={3}>Previous Balance</td>
                                  <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">
                                    ₹{latestPreviousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                                <tr className="border-t-2 border-border bg-muted/50 font-bold">
                                  <td className="px-4 py-3 text-foreground" colSpan={3}>Total</td>
                                  <td className="px-4 py-3 text-right text-primary">
                                    ₹{(totalBillAmount + latestPreviousBalance).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Monthly Summary Grid */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Monthly Product Summary</h3>
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      {summaryLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-10 w-full rounded-lg" />
                          <Skeleton className="h-10 w-full rounded-lg" />
                          <Skeleton className="h-10 w-full rounded-lg" />
                        </div>
                      ) : monthlyProductSummary.length === 0 ? (
                        <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                          <Rows3 className="h-8 w-8 opacity-30" />
                          <p className="text-sm">No product data available</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/50">
                                <th className="px-4 py-3 text-left font-semibold text-foreground min-w-32">Product</th>
                                {Array.from(new Set(monthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                  const [year, month] = monthKey.split('-').map(Number)
                                  return (
                                    <th key={monthKey} className="px-3 py-3 text-right font-semibold text-foreground min-w-20">{MONTH_NAMES[month]} {year}</th>
                                  )
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {monthlyProductSummary.map((row, idx) => {
                                const uniqueMonths = Array.from(new Set(monthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort()
                                const productTotal = summaryTotals.productTotals.find(p => p.product === row.product)
                                return (
                                  <tr key={row.product} className={`border-b border-border ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                    <td className="px-4 py-3 font-medium text-foreground">{row.product}</td>
                                    {uniqueMonths.map((monthKey) => {
                                      const monthData = row.months.find(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}` === monthKey)
                                      return (
                                        <td key={monthKey} className="px-3 py-3 text-right text-foreground whitespace-nowrap">
                                          {monthData ? `${monthData.quantity.toLocaleString('en-IN')}L — ₹${(productTotal?.amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                              {monthlyProductSummary.length > 0 && (
                                <>
                                  <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                                    <td className="px-4 py-3 text-foreground">Total</td>
                                    {Array.from(new Set(monthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                      return (
                                        <td key={monthKey} className="px-3 py-3 text-right text-foreground">
                                          ₹{summaryTotals.pendingTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                  <tr className="border-t border-border bg-muted/50 font-semibold">
                                    <td className="px-4 py-3 text-amber-600 dark:text-amber-400">Previous Balance</td>
                                    {Array.from(new Set(monthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                      return (
                                        <td key={monthKey} className="px-3 py-3 text-right text-amber-600 dark:text-amber-400">
                                          ₹{summaryTotals.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                  <tr className="border-t-2 border-border bg-muted/50 font-bold">
                                    <td className="px-4 py-3 text-foreground">Grand Total</td>
                                    {Array.from(new Set(monthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                      const grandTotal = summaryTotals.pendingTotal + summaryTotals.previousBalance
                                      return (
                                        <td key={monthKey} className="px-3 py-3 text-right text-primary">
                                          ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                  {/* {!hasDateRangeFilter && (
                                  <tr className="border-t border-border bg-muted/50 font-semibold">
                                    <td className="px-4 py-3">Pending Amount</td>
                                    {Array.from(new Set(monthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                      const totalReceived = paymentSummaryRows.reduce((sum, row) => sum + row.paidAmount, 0)
                                      const pending = Math.max(0, summaryTotals.grandTotal + summaryTotals.previousBalance - totalReceived)
                                      return (
                                        <td key={monthKey} className="px-3 py-3 text-right text-amber-600 dark:text-amber-400">
                                          ₹{pending.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )} */}
                                </>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Daily View */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Daily Deliveries</h3>
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      {summaryLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-10 w-full rounded-lg" />
                          <Skeleton className="h-10 w-full rounded-lg" />
                          <Skeleton className="h-10 w-full rounded-lg" />
                        </div>
                      ) : summaryRows.length === 0 ? (
                        <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                          <Rows3 className="h-10 w-10 opacity-30" />
                          <p className="font-medium">No delivery summary available</p>
                          <p className="text-sm">This house has no delivery logs for the selected month.</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-35">Date</TableHead>
                              <TableHead>Products</TableHead>
                              <TableHead className="w-16 text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displaySummaryRows.map((row) => {
                              const blocked = isDeliveryBlockedByBill(row.dateKey) || Boolean(row.log?.isClosed)
                              const isPaid = isDeliveryBlockedByBill(row.dateKey) || Boolean(row.log?.isClosed)
                              return (
                                <TableRow key={row.dateKey} className={isPaid ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}>
                                  <TableCell className={`font-medium ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>{row.dayLabel}</TableCell>
                                  <TableCell className={`whitespace-normal ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                                    {row.hasDelivery ? row.productsLabel : <span className="text-muted-foreground">-</span>}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEditDeliveryDialog(row)}
                                        title={blocked ? 'Cannot edit after bill generation' : 'Edit delivery'}
                                        disabled={blocked}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                      {!blocked && row.log && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setDeletingDeliveryLog(row.log!)}
                                          title="Delete delivery"
                                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={handleExportSummaryPdf} disabled={summaryLoading || summaryRows.length === 0}>
                  Export PDF
                </Button>
                <Button onClick={() => setSummaryOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{configEditingId ? 'Edit House Config' : 'Add House Config'}</DialogTitle>
            <DialogDescription>
              Each house supports a single delivery config. Update the existing config details below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="config-house">House</Label>
              <Input
                id="config-house"
                value={selectedConfigHouse ? `${selectedConfigHouse.houseNo}${selectedConfigHouse.area ? ` - ${selectedConfigHouse.area}` : ''}` : 'Selected house'}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="config-shift">Shift</Label>
              <Select value={configForm.shift} onValueChange={value => setConfigForm(form => ({ ...form, shift: value as 'morning' | 'evening', supplierId: value === 'evening' ? '' : form.supplierId }))}>
                <SelectTrigger id="config-shift">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="config-supplier">Supplier</Label>
              <Select
                value={configForm.supplierId || '__none__'}
                onValueChange={value => setConfigForm(form => ({ ...form, supplierId: value === '__none__' ? '' : value }))}
                disabled={configForm.shift === 'evening'}
              >
                <SelectTrigger id="config-supplier">
                  <SelectValue placeholder={configForm.shift === 'morning' ? 'Select supplier' : 'Not required for evening'} />
                </SelectTrigger>
                <SelectContent className="max-w-[min(92vw,28rem)]">
                  <SelectItem value="__none__">Unassigned / shared</SelectItem>
                  {dialogSuppliers.map(supplier => (
                    <SelectItem key={supplier.uuid} value={supplier.uuid} className="max-w-full">
                      {supplier.username} - {supplier.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="config-alerts">Daily Alerts</Label>
              <DailyAlertsDialog
                value={configForm.dailyAlerts}
                onChange={value => setConfigForm(form => ({ ...form, dailyAlerts: value }))}
                placeholder="Open schedule editor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfigSave} disabled={configSaving}>
              {configSaving ? 'Saving...' : configEditingId ? 'Update Config' : 'Save Config'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDeliveryDialogOpen} onOpenChange={setEditDeliveryDialogOpen}>
        <DialogContent className="max-w-md sm:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto">
          {editingDeliveryLog && (
            <div>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit2 className="h-5 w-5 text-primary" />
                  Edit Delivery
                </DialogTitle>
                <DialogDescription>
                  Edit the delivered products and quantities for this delivery.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Delivery Info */}
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</p>
                    <p className="mt-1 text-sm font-semibold">{new Date(editingDeliveryLog.deliveredAt).toLocaleDateString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shift</p>
                    <p className="mt-1 text-sm font-semibold capitalize">
                      {editingDeliveryShifts.length > 1
                        ? editingDeliveryShifts.join(', ')
                        : editingDeliveryShifts[0] ?? editingDeliveryLog.shift}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Supplier</p>
                    <p className="mt-1 text-sm font-semibold">{editingDeliveryLog.supplier?.username || '-'}</p>
                  </div>
                </div>

                {/* Items Editor */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Delivery Items</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{editDeliveryForm.items.length} item(s)</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const activeProducts = getActiveProducts(productRates)
                        const firstProduct = activeProducts[0] || { name: '', rate: 0 }
                        const added = {
                          milkType: firstProduct.name,
                          qty: 0,
                          rate: getPreferredRateForHouse(firstProduct.name),
                          amount: 0,
                        }
                        setEditDeliveryForm({ ...editDeliveryForm, items: [...editDeliveryForm.items, added] })
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add item
                    </Button>
                  </div>

                  <div className="rounded border border-border bg-card">
                    {editDeliveryForm.items.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No items</div>
                    ) : (
                      <div className="w-full">
                        <div className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-xs text-muted-foreground border-b border-border">
                          <div className="col-span-5">Product</div>
                          <div className="col-span-2 text-right">Rate (₹/L)</div>
                          <div className="col-span-2 text-right">Qty (L)</div>
                          <div className="col-span-2 text-right">Amount</div>
                          <div className="col-span-1" />
                        </div>

                        {(editDeliveryForm.items || []).map((item, index) => (
                          <div key={index} className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-sm border-b border-border">
                            <div className="col-span-5 flex items-center gap-2">
                              <Select
                                value={item.milkType || ''}
                                onValueChange={(val) => {
                                  const newRate = getPreferredRateForHouse(val)
                                  const updated = [...editDeliveryForm.items]
                                  const newQty = updated[index].qty ?? 0
                                  updated[index] = { ...updated[index], milkType: val, rate: newRate, amount: newQty * newRate }
                                  setEditDeliveryForm({ ...editDeliveryForm, items: updated })
                                }}
                              >
                                <SelectTrigger className="h-8 w-32">
                                  <SelectValue>
                                    {item.milkType || 'Select'}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {getActiveProducts(productRates).map((rate) => (
                                    <SelectItem key={rate.id} value={rate.name}>
                                      {rate.name} (₹{getPreferredRateForHouse(rate.name)})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="col-span-2 text-right">
                              <p className="text-sm font-medium text-muted-foreground">₹{Number(item.rate).toLocaleString('en-IN')}</p>
                            </div>

                            <div className="col-span-2">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={item.qty}
                                onChange={(e) => {
                                  const newQty = Number(e.target.value)
                                  const newAmount = newQty * item.rate
                                  const updated = [...editDeliveryForm.items]
                                  updated[index] = { ...item, qty: newQty, amount: newAmount }
                                  setEditDeliveryForm({ ...editDeliveryForm, items: updated })
                                }}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-right"
                                placeholder="Qty"
                              />
                            </div>

                            <div className="col-span-2 text-right">
                              <p className="font-medium">₹{Number(item.amount).toLocaleString('en-IN')}</p>
                            </div>

                            <div className="col-span-1 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updated = editDeliveryForm.items.filter((_, i) => i !== index)
                                  setEditDeliveryForm({ ...editDeliveryForm, items: updated })
                                }}
                                title="Remove item"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label htmlFor="delivery-note">Notes</Label>
                  <Textarea
                    id="delivery-note"
                    value={editDeliveryForm.note || ''}
                    onChange={(e) => setEditDeliveryForm({ ...editDeliveryForm, note: e.target.value })}
                    placeholder="Optional delivery notes..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-col">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-semibold">₹{Number(editDeliveryTotal).toLocaleString('en-IN')}</p>
                  {editDeliveryTotal <= 0 && (
                    <p className="text-xs text-destructive mt-1">Total must be greater than zero to save.</p>
                  )}
                </div>

                <DialogFooter className="p-0">
                  <Button variant="outline" onClick={() => setEditDeliveryDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSaveDeliveryEdit} disabled={editDeliverySaving || editDeliveryTotal <= 0}>
                    {editDeliverySaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingDeliveryLog} onOpenChange={(open) => !open && setDeletingDeliveryLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Delivery Log</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this delivery for {deletingDeliveryLog && new Date(deletingDeliveryLog.deliveredAt).toLocaleDateString('en-IN')}?
              This will deduct ₹{deletingDeliveryLog ? Number(deletingDeliveryLog.totalAmount).toLocaleString('en-IN') : 0} from the house balance.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingDeliveryLog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteDeliveryLog} disabled={editDeliverySaving}>
              {editDeliverySaving ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* All Houses Summary Export Dialog */}
      <Dialog open={allExportOpen} onOpenChange={setAllExportOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Export All Houses Summary</DialogTitle>
            <DialogDescription>
              Select the month and year to generate a single PDF with all house summaries.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={String(allExportMonth)} onValueChange={v => setAllExportMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.slice(1).map((name, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={String(allExportYear)} onValueChange={v => setAllExportYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllExportOpen(false)}>Cancel</Button>
            <Button onClick={() => handleExportAllHousesSummaryPdf(allExportMonth, allExportYear)} disabled={allExportLoading}>
              {allExportLoading ? 'Generating...' : 'Export PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  )
}

const DAYS_KEYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const DAYS_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function DailyAlertsDialog({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<HouseAlert[]>([])

  const serializedAlerts = useMemo(() => parseAlerts(value), [value])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setAlerts(parseAlerts(value))
    }
    setOpen(nextOpen)
  }, [value])

  const activeCount = serializedAlerts.length
  const activePreview = formatAlertPreview(value)

  const addAlert = () => {
    setAlerts(prev => {
      if (prev.length >= 1) return prev

      return [{
        id: createAlertId(),
        text: '',
        schedule: ALL_DAYS_ALERT_SCHEDULE,
      }]
    })
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
          [day]: !next[index].schedule[day],
        },
      }
      return next
    })
  }

  const removeAlert = (index: number) => {
    setAlerts(prev => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleSave = () => {
    onChange(serializeAlerts(alerts.slice(0, 1)) ?? '')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span className="truncate text-muted-foreground">
            {activeCount > 0
              ? activePreview || `${activeCount} alert${activeCount > 1 ? 's' : ''} configured`
              : placeholder ?? 'Open schedule editor'}
          </span>
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-w-2xl bg-card border-border/60"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> Daily Alerts
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-10 text-muted-foreground">
              <CalendarDays className="mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">No alert configured</p>
              <p className="mt-1 text-xs">Create one alert schedule for selected days.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert, index) => (
                <div key={alert.id} className="relative rounded-xl border border-border bg-muted/20 p-4">
                  <div className="mb-4 flex gap-3">
                    <Input
                      value={alert.text}
                      onChange={event => updateAlertText(index, event.target.value)}
                      placeholder="E.g. Call before arrival"
                      className="bg-background"
                    />
                    <Button variant="destructive" size="icon" onClick={() => removeAlert(index)} className="shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Days</p>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_KEYS.map((day, dayIndex) => (
                        <Button
                          key={day}
                          type="button"
                          variant={alert.schedule[day] ? 'default' : 'outline'}
                          size="sm"
                          className={`h-8 font-medium ${alert.schedule[day] ? 'bg-primary/90' : 'bg-background'}`}
                          onClick={() => toggleDay(index, day)}
                        >
                          {DAYS_LABELS[dayIndex]}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={addAlert}
            variant="secondary"
            className="mt-4 w-full gap-2 border border-dashed border-border"
            disabled={alerts.length >= 1}
          >
            <Plus className="h-4 w-4" /> {alerts.length >= 1 ? 'Only one alert allowed per house' : 'Create Alert'}
          </Button>
        </div>

        <DialogFooter className="mt-4 border-t border-border/40 pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" /> Save Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}