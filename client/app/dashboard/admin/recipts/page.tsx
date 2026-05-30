'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { IndianRupee, Plus, Search, Receipt, History, Check, ChevronDown, Rows3, ChevronLeft, ChevronRight, Edit2, Trash2 } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { balanceApi, housesApi, billsApi, deliveryLogsApi, productRatesApi, type PaymentHistory, type House, type HouseBalance, type Bill, type DeliveryLog, type ProductRate } from '@/lib/api'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  previousBalance: number
  remainingAmount: number
  note?: string
}

type DeliveryEditForm = {
  items: Array<{ milkType: string; qty: number; rate: number; amount: number }>
  note?: string
}

function normalizeMilkType(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeRateType(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase()
  if (text.includes('buffalo')) return 'buffalo'
  if (text.includes('cow')) return 'cow'
  return text
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
  return rates.filter((rate) => rate.isActive && Number(rate.rate) > 0).sort((left, right) => (left.name || '').localeCompare(right.name || ''))
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
    if (!existing.logId) {
      existing.logId = log.id
      existing.log = log
    }

    const productParts = (log.items ?? []).map((item) => {
      const qty = Number(item.qty ?? 0)
      if (!qty) return null
      const milkType = normalizeMilkType(item.milkType)
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
  if (month === 0) return { year: year - 1, month: 11 }
  return { year, month: month - 1 }
}

function getNextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 11) return { year: year + 1, month: 0 }
  return { year, month: month + 1 }
}

export default function ReceiptsPage() {
  const [payments, setPayments] = useState<PaymentHistory[]>([])
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingBills, setLoadingBills] = useState(false)
  const [billsCache, setBillsCache] = useState<Map<number, Bill>>(new Map())

  const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const CURRENT_YEAR_RECEIPT = new Date().getFullYear()
  const YEARS_RECEIPT = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR_RECEIPT - i)
  const [receivedMonth, setReceivedMonth] = useState<string>(String(new Date().getMonth()))
  const [receivedYear, setReceivedYear] = useState<string>(String(CURRENT_YEAR_RECEIPT))

  const filteredPaymentsByMonth = useMemo(() => {
    if (receivedMonth === 'all') return payments
    return payments.filter(p => {
      const d = new Date(p.createdAt)
      return d.getMonth() === parseInt(receivedMonth) && d.getFullYear() === parseInt(receivedYear)
    })
  }, [payments, receivedMonth, receivedYear])

  // Form
  const [formHouseId, setFormHouseId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formHouseQuery, setFormHouseQuery] = useState('')
  const [formArea, setFormArea] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formHouseSelected, setFormHouseSelected] = useState(false)
  const [formBills, setFormBills] = useState<Bill[]>([])
  const [formSelectedBillIds, setFormSelectedBillIds] = useState<number[]>([])
  const [formPaymentMode, setFormPaymentMode] = useState<'all' | 'selected'>('all')
  const [formDiscount, setFormDiscount] = useState('')
  const [formClosePeriod, setFormClosePeriod] = useState(false)
  const [formFromDate, setFormFromDate] = useState<string>('')
  const [formToDate, setFormToDate] = useState<string>('')
  const [periodSummary, setPeriodSummary] = useState<{
    previousBalance: number
    currentBalance: number
    total: number
    logCount: number
    isAlreadyClosed: boolean
    alreadyClosedMessage: string | null
    loading: boolean
  } | null>(null)
  const [periodDeliveryLogs, setPeriodDeliveryLogs] = useState<DeliveryLog[]>([])
  const [loadingDeliveryLogs, setLoadingDeliveryLogs] = useState(false)
  const [showDeliveryLogsModal, setShowDeliveryLogsModal] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryHouse, setSummaryHouse] = useState<House | null>(null)
  const [summaryBalance, setSummaryBalance] = useState<HouseBalance | null>(null)
  const [summaryLogs, setSummaryLogs] = useState<DeliveryLog[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryBills, setSummaryBills] = useState<Bill[]>([])
  const [productRates, setProductRates] = useState<ProductRate[]>([])
  const [editDeliveryDialogOpen, setEditDeliveryDialogOpen] = useState(false)
  const [editingDeliveryLog, setEditingDeliveryLog] = useState<DeliveryLog | null>(null)
  const [editingDeliveryShifts, setEditingDeliveryShifts] = useState<string[]>([])
  const [editingDeliveryAllLogs, setEditingDeliveryAllLogs] = useState<DeliveryLog[]>([])
  const [deletingDeliveryLog, setDeletingDeliveryLog] = useState<DeliveryLog | null>(null)
  const [editDeliveryForm, setEditDeliveryForm] = useState<DeliveryEditForm>({ items: [], note: '' })
  const [editDeliverySaving, setEditDeliverySaving] = useState(false)
  const [summaryPeriod, setSummaryPeriod] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [summaryFromDate, setSummaryFromDate] = useState<string>('')
  const [summaryToDate, setSummaryToDate] = useState<string>('')

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

  const monthlyProductSummary = useMemo(() => {
    if (!summaryHouse) return []
    const pendingLogs = filteredSummaryLogs.filter(log => !log.billGenerated)
    return buildMonthlyProductSummary(pendingLogs, summaryPeriod.year, summaryPeriod.month)
  }, [summaryHouse, filteredSummaryLogs, summaryPeriod])

  const editDeliveryTotal = useMemo(() => {
    return (editDeliveryForm.items || []).reduce((sum, item) => sum + Number(item?.amount ?? 0), 0)
  }, [editDeliveryForm.items])

  const paymentSummaryRows = useMemo<PaymentSummaryRow[]>(() => {
    if (!summaryHouse) return []

    const payments = [...(summaryBalance?.payments ?? [])].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    )

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
      const paidAmount = Number(payment.amount ?? 0) + Number(payment.discount ?? 0)
      const previousBalance = remainingAmount
      remainingAmount = Math.max(0, remainingAmount - paidAmount)

      return {
        id: payment.id,
        paidAt: payment.createdAt,
        paidAmount,
        previousBalance,
        remainingAmount,
        note: payment.note,
      }
    })
  }, [summaryBalance, summaryHouse])

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
    if (!summaryHouse) return { productTotals: [] as Array<{ product: string; quantity: number; amount: number }>, grandTotal: 0 }
    const monthLogs = filteredSummaryLogs.filter(log => {
      const d = new Date(log.deliveredAt)
      return d.getFullYear() === summaryPeriod.year && d.getMonth() === summaryPeriod.month && !log.billGenerated
    })
    const productMap = new Map<string, { qty: number; amount: number }>()
    let grandTotal = 0
    for (const log of monthLogs) {
      grandTotal += Number(log.totalAmount ?? 0)
      for (const item of log.items ?? []) {
        const product = normalizeMilkType(item.milkType)
        const qty = Number(item.qty ?? 0)
        const amount = Number(item.amount ?? 0)
        if (product && qty > 0) {
          const existing = productMap.get(product) ?? { qty: 0, amount: 0 }
          productMap.set(product, { qty: existing.qty + qty, amount: existing.amount + amount })
        }
      }
    }
    return {
      productTotals: Array.from(productMap.entries()).map(([product, data]) => ({ product, quantity: data.qty, amount: data.amount })),
      grandTotal,
    }
  }, [summaryHouse, filteredSummaryLogs, summaryPeriod])

  // Auto-tick bills based on amount and mode
  useEffect(() => {
    if (!formBills.length) return

    if (formPaymentMode === 'all') {
      // In 'all' mode, tick all non-closed bills
      const nonClosedBillIds = formBills
        .filter(b => !b.isClosed)
        .map(b => b.id)
      setFormSelectedBillIds(nonClosedBillIds)
    } else if (formPaymentMode === 'selected' && formAmount) {
      // In 'selected' mode, auto-tick bills based on entered amount
      let remaining = parseFloat(formAmount) || 0
      const autoTicked: number[] = []

      for (const bill of formBills) {
        if (bill.isClosed) continue // Skip closed bills
        const pending = bill.pendingAmount || 0
        if (remaining > 0) {
          autoTicked.push(bill.id)
          remaining -= pending
        }
        if (remaining <= 0) break
      }

      setFormSelectedBillIds(autoTicked)
    }
  }, [formAmount, formPaymentMode, formBills])

  // Fetch period summary and delivery logs when close period dates are set
  useEffect(() => {
    const fetchPeriodData = async () => {
      if (!formClosePeriod || !formFromDate || !formToDate || !formHouseId) {
        setPeriodSummary(null)
        setPeriodDeliveryLogs([])
        return
      }

      try {
        setPeriodSummary(prev => prev ? { ...prev, loading: true } : { previousBalance: 0, currentBalance: 0, total: 0, logCount: 0, isAlreadyClosed: false, alreadyClosedMessage: null, loading: true })
        setLoadingDeliveryLogs(true)

        // Fetch period summary
        const summary = await billsApi.preview(parseInt(formHouseId), {
          fromDate: formFromDate,
          toDate: formToDate,
        })
        setPeriodSummary({
          previousBalance: summary.previousBalance,
          currentBalance: summary.grandTotal,
          total: summary.totalAmount,
          logCount: summary.logCount,
          isAlreadyClosed: summary.isAlreadyClosed,
          alreadyClosedMessage: summary.alreadyClosedMessage,
          loading: false,
        })

        // Fetch delivery logs for the house and filter by date range
        const allLogs = await deliveryLogsApi.list({ houseId: parseInt(formHouseId) })
        const fromDateObj = new Date(formFromDate)
        const toDateObj = new Date(formToDate)
        toDateObj.setHours(23, 59, 59, 999) // Include entire end date

        const filteredLogs = allLogs.filter(log => {
          const logDate = new Date(log.deliveredAt || log.createdAt)
          return logDate >= fromDateObj && logDate <= toDateObj
        })

        setPeriodDeliveryLogs(filteredLogs.sort((a, b) => {
          const dateA = new Date(a.deliveredAt || a.createdAt)
          const dateB = new Date(b.deliveredAt || b.createdAt)
          return dateB.getTime() - dateA.getTime()
        }))
      } catch (e) {
        console.error('Failed to fetch period data:', e)
        setPeriodSummary(null)
        setPeriodDeliveryLogs([])
      } finally {
        setLoadingDeliveryLogs(false)
      }
    }

    fetchPeriodData()
  }, [formClosePeriod, formFromDate, formToDate, formHouseId])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [paymentsData, housesData, billsData] = await Promise.all([
        balanceApi.allPayments(),
        housesApi.list(),
        billsApi.list(),
      ])
      setPayments(paymentsData)
      setHouses(housesData)

      // Cache bills for quick lookup
      const cache = new Map<number, Bill>()
      for (const bill of billsData) {
        cache.set(bill.id, bill)
      }
      setBillsCache(cache)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleHouseSelect = async (houseId: number, houseNo: string, area: string, phone: string) => {
    setFormHouseId(String(houseId))
    setFormHouseQuery(houseNo)
    setFormArea(area)
    setFormPhone(phone)
    setFormHouseSelected(true)
    setFormPaymentMode('all')
    setFormSelectedBillIds([])

    // Load bills for this house
    setLoadingBills(true)
    try {
      const bills = await billsApi.pending(houseId)
      // Only show the latest bill
      const sorted = [...bills].sort(
        (a, b) => new Date(b.generatedDate).getTime() - new Date(a.generatedDate).getTime()
      )
      const latestBill = sorted[0] ?? null
      setFormBills(latestBill ? [latestBill] : [])
      setFormSelectedBillIds(latestBill ? [latestBill.id] : [])
      setFormAmount(String(latestBill?.pendingAmount || 0))
    } catch (e) {
      toast.error('Failed to load bills')
      setFormBills([])
    } finally {
      setLoadingBills(false)
    }
  }

  const filtered = filteredPaymentsByMonth.filter(p => {
    const house = p.balance?.house
    if (!house) return true
    return house.houseNo.toLowerCase().includes(search.toLowerCase()) ||
      house.area?.toLowerCase().includes(search.toLowerCase())
  })

  const getHousePhone = (houseId?: number) => {
    if (houseId === undefined) return '—'

    return houses.find((house) => house.id === houseId)?.phoneNo ?? '—'
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getBillPeriods = async (billIds?: any): Promise<string> => {
    if (!billIds || (Array.isArray(billIds) && billIds.length === 0)) return '—'

    const ids = Array.isArray(billIds) ? billIds : []
    if (ids.length === 0) return '—'

    try {
      const periodsText: string[] = []
      for (const billId of ids) {
        if (billsCache.has(billId)) {
          const bill = billsCache.get(billId)!
          if (bill.fromDate && bill.toDate) {
            periodsText.push(
              `${new Date(bill.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${new Date(bill.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
            )
          } else {
            periodsText.push(`${MONTH_NAMES[bill.month - 1]} ${bill.year}`)
          }
        }
      }
      return periodsText.length > 0 ? periodsText.join(', ') : '—'
    } catch {
      return '—'
    }
  }

  const totalReceived = filteredPaymentsByMonth.reduce((sum, p) => sum + Number(p.amount), 0)

  const selectedHouse = useMemo(
    () => houses.find((house) => String(house.id) === formHouseId) ?? null,
    [houses, formHouseId],
  )

  const formPendingAmount = useMemo(
    () => formBills.reduce((sum, bill) => sum + (bill.pendingAmount || 0), 0),
    [formBills],
  )

  const amountHelperAmount = useMemo(() => {
    if (formBills.length > 0) return formPendingAmount
    if (selectedHouse?.balance) {
      return Number(selectedHouse.balance.previousBalance ?? selectedHouse.balance.currentBalance ?? 0)
    }
    return 0
  }, [formBills.length, formPendingAmount, selectedHouse])

  const amountHelperLabel = formBills.length > 0
    ? `Use pending amount ₹${amountHelperAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    : `Use balance ₹${amountHelperAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  async function openSummary(house: House) {
    setSummaryHouse(house)
    setSummaryBalance(null)
    setSummaryLogs([])
    setSummaryOpen(true)
    setSummaryLoading(true)

    try {
      const [balance, logs, bills, rates] = await Promise.all([
        balanceApi.get(house.id),
        deliveryLogsApi.list({ houseId: house.id }),
        billsApi.list({ houseId: house.id }),
        productRatesApi.list(),
      ])
      setSummaryBalance(balance)
      setSummaryLogs(logs)
      setSummaryBills(bills)
      setProductRates(rates.filter(r => r.isActive && Number(r.rate) > 0))
      setSummaryPeriod(getLogPeriod(logs))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load summary')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function handleChangeSummaryPeriod(newPeriod: { year: number; month: number }) {
    if (!summaryHouse || !isValidMonth(newPeriod.year, newPeriod.month)) return
    setSummaryPeriod(newPeriod)
  }

  function getBillForDateKey(dateKey: string): Bill | undefined {
    const [yearStr, monthStr] = dateKey.split('-')
    const month = Number.parseInt(monthStr ?? '', 10) - 1
    const year = Number.parseInt(yearStr ?? '', 10)
    return summaryBills.find((bill) => bill.month === month && bill.year === year)
  }

  function getPreferredRateForHouse(milkType: string): number {
    const normalizedMilkType = normalizeRateType(milkType)
    if (summaryHouse) {
      const rate1Type = normalizeRateType((summaryHouse as unknown as { rate1Type?: unknown }).rate1Type)
      const rate2Type = normalizeRateType((summaryHouse as unknown as { rate2Type?: unknown }).rate2Type)
      const rate1 = Number((summaryHouse as unknown as { rate1?: unknown }).rate1 ?? 0)
      const rate2 = Number((summaryHouse as unknown as { rate2?: unknown }).rate2 ?? 0)
      if (rate1Type && rate1Type === normalizedMilkType && rate1 > 0) return rate1
      if (rate2Type && rate2Type === normalizedMilkType && rate2 > 0) return rate2
    }
    return getRateByProductName(productRates, milkType)
  }

  function isDeliveryBlockedByBill(dateKey: string): boolean {
    const bill = getBillForDateKey(dateKey)
    if (!bill) return false

    if (bill.generatedDate) {
      const generatedDate = new Date(bill.generatedDate)
      const [year, month, day] = dateKey.split('-').map(Number)
      const deliveryDate = new Date(year, month - 1, day)
      return deliveryDate.getTime() <= generatedDate.getTime()
    }

    return true
  }

  function openEditDeliveryDialog(row: HouseDeliverySummaryRow) {
    if (isDeliveryBlockedByBill(row.dateKey) || Boolean(row.log?.billGenerated)) {
      toast.error('Cannot edit deliveries that were included in a generated bill')
      return
    }

    if (row.log) {
      setEditingDeliveryLog(row.log)
      const logsForDate = row.allLogs ?? [row.log]
      const uniqueShifts = [...new Set(logsForDate.map((log) => log.shift).filter(Boolean))]
      setEditingDeliveryShifts(uniqueShifts)
      setEditingDeliveryAllLogs(logsForDate)
      const allItems = logsForDate.flatMap((log) =>
        normalizeDeliveryItems(log.items).map((item) => {
          const qty = Number(item.qty ?? 0)
          const rate = getPreferredRateForHouse(item.milkType)
          return { ...item, rate, amount: qty * rate }
        }),
      )
      setEditDeliveryForm({
        items: allItems,
        note: row.log.note,
      })
    } else {
      const [year, month, day] = row.dateKey.split('-').map(Number)
      const deliveryDate = new Date(year, month - 1, day)
      const firstProduct = getActiveProducts(productRates)[0] ?? { name: '', rate: 0 }
      const defaultShift = (summaryHouse as unknown as { configs?: Array<{ shift?: 'morning' | 'evening' | 'shop' }> }).configs?.[0]?.shift ?? 'morning'
      const newLog: DeliveryLog = {
        id: 0,
        houseId: summaryHouse?.id ?? 0,
        deliveredAt: deliveryDate.toISOString(),
        createdAt: new Date().toISOString(),
        shift: defaultShift,
        items: [],
        billGenerated: false,
        isClosed: false,
        totalAmount: '0',
        openingBalance: '0',
        closingBalance: '0',
        note: '',
      }
      setEditingDeliveryLog(newLog)
      setEditingDeliveryShifts([])
      setEditingDeliveryAllLogs([])
      setEditDeliveryForm({
        items: [{ milkType: firstProduct.name, qty: 0, rate: getPreferredRateForHouse(firstProduct.name), amount: 0 }],
        note: '',
      })
    }

    setEditDeliveryDialogOpen(true)
  }

  async function handleSaveDeliveryEdit() {
    if (!editingDeliveryLog || !summaryHouse) return

    setEditDeliverySaving(true)
    try {
      const isNewDelivery = editingDeliveryLog.id === 0
      const oldAmount = isNewDelivery
        ? 0
        : editingDeliveryAllLogs.reduce(
          (sum, log) => sum + (log.items ?? []).reduce((itemSum, item) => itemSum + (Number(item.amount) ?? 0), 0),
          0,
        )
      const newAmount = editDeliveryForm.items.reduce((sum, item) => sum + (Number(item.amount) ?? 0), 0)
      const amountDifference = newAmount - oldAmount

      if (isNewDelivery) {
        await deliveryLogsApi.create({
          houseId: summaryHouse.id,
          shift: editingDeliveryLog.shift as 'morning' | 'evening' | 'shop',
          items: editDeliveryForm.items,
          note: editDeliveryForm.note,
          deliveredAt: editingDeliveryLog.deliveredAt,
        })
      } else {
        await deliveryLogsApi.update(editingDeliveryLog.id, {
          items: editDeliveryForm.items,
          note: editDeliveryForm.note,
        })

        const secondaryLogs = editingDeliveryAllLogs.filter((log) => log.id !== editingDeliveryLog.id)
        for (const log of secondaryLogs) {
          try {
            await deliveryLogsApi.delete(log.id)
          } catch (error) {
            console.warn(`Could not delete secondary log ${log.id}:`, error)
          }
        }
      }

      toast.success('Delivery updated successfully')

      if (amountDifference !== 0) {
        try {
          const currentBalance = await balanceApi.get(summaryHouse.id)
          await balanceApi.updateCurrent(summaryHouse.id, Number(currentBalance.currentBalance) || 0)
        } catch (error) {
          console.error('Failed to update balance:', error)
          toast.warning('Balance update failed - delivery saved but balance unchanged')
        }
      }

      const logs = await deliveryLogsApi.list({ houseId: summaryHouse.id })
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
    if (deletingDeliveryLog.billGenerated) {
      toast.error('Cannot delete a delivery that was included in a generated bill')
      return
    }

    setEditDeliverySaving(true)
    try {
      await deliveryLogsApi.delete(deletingDeliveryLog.id)
      const logs = await deliveryLogsApi.list({ houseId: summaryHouse.id })
      setSummaryLogs(logs)
      setDeletingDeliveryLog(null)
      toast.success('Delivery log deleted successfully')
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setEditDeliverySaving(false)
    }
  }

  const handleExportSummaryPdf = useCallback(() => {
    if (!summaryHouse) return
    if (summaryRows.length === 0) {
      toast.error('No summary data available to export')
      return
    }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const title = `House ${summaryHouse.houseNo} Delivery Summary`
    const periodLabel = `${MONTH_NAMES[summaryPeriod.month]} ${summaryPeriod.year}`

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(title, 14, 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (hasDateRangeFilter) {
      doc.text(`Date Range: ${summaryFromDate} to ${summaryToDate}`, 14, 23)
    } else {
      doc.text(`Period: ${periodLabel}`, 14, 23)
    }
    if (summaryHouse.area) doc.text(`Area: ${summaryHouse.area}`, 14, 29)

    let currentY = 38

    if (paymentSummaryRows.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Received Payments', 14, currentY)
      currentY += 6

      const totalReceived = paymentSummaryRows.reduce((sum, row) => sum + row.paidAmount, 0)
      autoTable(doc, {
        startY: currentY,
        head: [['Date', 'Paid (₹)']],
        body: [
          ...paymentSummaryRows.map((row) => [
            new Date(row.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
            row.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
          ]),
          ['Total Received', totalReceived.toLocaleString('en-IN', { maximumFractionDigits: 2 })],
        ],
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [200, 200, 200] },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentY = (doc as any).lastAutoTable.finalY + 8
    }

    const monthKeys = Array.from(new Set(monthlyProductSummary.flatMap((row) => row.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort()
    const monthLabels = monthKeys.map((monthKey) => {
      const [year, month] = monthKey.split('-').map(Number)
      return `${MONTH_NAMES[month]} ${year}`
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const left = 14
    const right = 14
    const bottom = 14
    const tableWidth = pageWidth - left - right
    const productColWidth = monthLabels.length > 0 ? Math.max(58, Math.min(76, tableWidth * 0.36)) : tableWidth
    const monthColWidth = monthLabels.length > 0 ? (tableWidth - productColWidth) / monthLabels.length : 0
    const headerHeight = 11
    const rowHeight = 10
    const paddingX = 2.5
    const lineHeight = 4.2

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

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(17, 24, 39)
    doc.text('Monthly Product Summary', 14, currentY)

    currentY += 6
    drawCell(left, currentY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
    monthLabels.forEach((label, index) => {
      const x = left + productColWidth + (index * monthColWidth)
      drawCell(x, currentY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
    })

    currentY += headerHeight

    if (monthlyProductSummary.length === 0) {
      drawCell(left, currentY, tableWidth, rowHeight, 'No product data available', 'left', false)
      currentY += rowHeight
    } else {
      monthlyProductSummary.forEach((row) => {
        if (currentY > pageHeight - bottom - rowHeight) {
          doc.addPage()
          currentY = 14
          drawCell(left, currentY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
          monthLabels.forEach((label, index) => {
            const x = left + productColWidth + (index * monthColWidth)
            drawCell(x, currentY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
          })
          currentY += headerHeight
        }

        const productTotal = summaryTotals.productTotals.find((item) => item.product === row.product)
        const rowValues = monthKeys.map((monthKey) => {
          const [year, month] = monthKey.split('-').map(Number)
          const monthData = row.months.find((item) => item.year === year && item.month === month - 1)
          return monthData ? `${monthData.quantity.toLocaleString('en-IN')}L - Rs ${(productTotal?.amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'
        })

        const productLines = toLines(row.product, productColWidth)
        const valueLines = rowValues.map((value) => toLines(value, monthColWidth))
        const maxLines = Math.max(productLines.length, ...valueLines.map((lines) => lines.length))
        const cellHeight = Math.max(rowHeight, (maxLines * lineHeight) + 4)

        drawCell(left, currentY, productColWidth, cellHeight, productLines, 'left')
        valueLines.forEach((value, index) => {
          const x = left + productColWidth + (index * monthColWidth)
          drawCell(x, currentY, monthColWidth, cellHeight, value, 'right')
        })
        currentY += cellHeight
      })

      if (currentY > pageHeight - bottom - rowHeight) {
        doc.addPage()
        currentY = 14
        drawCell(left, currentY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
        monthLabels.forEach((label, index) => {
          const x = left + productColWidth + (index * monthColWidth)
          drawCell(x, currentY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
        })
        currentY += headerHeight
      }

      drawCell(left, currentY, productColWidth, rowHeight, 'Total', 'left', true, [248, 250, 252])
      monthLabels.forEach((_, index) => {
        const x = left + productColWidth + (index * monthColWidth)
        drawCell(x, currentY, monthColWidth, rowHeight, `Rs ${summaryTotals.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [248, 250, 252])
      })
      currentY += rowHeight

      const totalReceived = paymentSummaryRows.reduce((sum, row) => sum + row.paidAmount, 0)
      const pending = Math.max(0, summaryTotals.grandTotal - totalReceived)
      if (!hasDateRangeFilter) {
        drawCell(left, currentY, productColWidth, rowHeight, 'Pending Amount', 'left', true, [255, 243, 224])
        monthLabels.forEach((_, index) => {
          const x = left + productColWidth + (index * monthColWidth)
          drawCell(x, currentY, monthColWidth, rowHeight, `Rs ${pending.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [255, 243, 224])
        })
        currentY += rowHeight
      }
    }

    let deliveriesTitleY = currentY + 8
    if (deliveriesTitleY > pageHeight - 20) {
      doc.addPage()
      deliveriesTitleY = 16
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(17, 24, 39)
    doc.text('Daily Deliveries', 14, deliveriesTitleY)

    autoTable(doc, {
      startY: deliveriesTitleY + 6,
      head: [['Date', 'Products']],
      body: displaySummaryRows.map((row) => [row.dayLabel, row.hasDelivery ? row.productsLabel : '-']),
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
        0: { cellWidth: 35 },
        1: { cellWidth: 'auto' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { top: 30, left: 14, right: 14 },
    })

    doc.save(`House_${summaryHouse.houseNo}_Summary_${periodLabel.replace(' ', '_')}.pdf`)
  }, [summaryHouse, summaryRows, summaryLogs, summaryPeriod, monthlyProductSummary, summaryTotals, paymentSummaryRows, hasDateRangeFilter, summaryFromDate, summaryToDate, displaySummaryRows])

  async function handleRecord() {
    if (!formHouseId || !formAmount) { toast.error('House and Amount are required'); return }
    setSaving(true)
    try {
      if (formClosePeriod) {
        if (periodSummary?.isAlreadyClosed) {
          toast.error(periodSummary.alreadyClosedMessage ?? 'This period is already closed.')
          return
        }

        // Close specified period by marking logs as closed and recording a payment
        await balanceApi.closePeriod({
          houseId: parseInt(formHouseId),
          fromDate: formFromDate,
          toDate: formToDate,
          amount: parseFloat(formAmount),
          note: formNote || undefined,
        })
      } else {
        await balanceApi.record({
          houseId: parseInt(formHouseId),
          amount: parseFloat(formAmount),
          note: formNote || undefined,
          billIds: formSelectedBillIds.length > 0 ? formSelectedBillIds : undefined,
          discount: formDiscount ? parseFloat(formDiscount) : undefined,
        })
      }
      toast.success('Payment recorded successfully')
      setDialogOpen(false)
      setFormHouseId('')
      setFormAmount('')
      setFormNote('')
      setFormBills([])
      setFormSelectedBillIds([])
      setFormHouseSelected(false)
      setFormHouseQuery('')
      setFormDiscount('')
      setFormClosePeriod(false)
      setFormFromDate('')
      setFormToDate('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const closePeriodBlocked = formClosePeriod && Boolean(periodSummary?.isAlreadyClosed)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Receipts & Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Record and track payments received from houses</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </div>

      {/* Summary Card */}
      <div className="rounded-2xl border border-border bg-linear-to-br from-emerald-500/10 to-emerald-600/10 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Received</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              ₹{totalReceived.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{filteredPaymentsByMonth.length} payment{filteredPaymentsByMonth.length !== 1 ? 's' : ''} recorded</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={receivedMonth} onValueChange={setReceivedMonth}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                {MONTH_NAMES_FULL.map((name, i) => (
                  <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={receivedYear} onValueChange={setReceivedYear}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS_RECEIPT.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Search + Table */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by house no or area..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Receipt className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">No payments found</p>
              <p className="text-sm mt-1">Click &quot;Record Payment&quot; to log a new receipt</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">House</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Area</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Phone</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Amount</th>
                    {/* <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Bill Period</th> */}
                    <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Note</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => {
                    // Get bill periods from billIds
                    const billIds = (p.billIds as number[]) || []
                    const periodsList: string[] = []

                    for (const billId of billIds) {
                      if (billsCache.has(billId)) {
                        const bill = billsCache.get(billId)!
                        if (bill.fromDate && bill.toDate) {
                          periodsList.push(
                            `${new Date(bill.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${new Date(bill.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          )
                        } else {
                          periodsList.push(`${MONTH_NAMES[bill.month - 1]} ${bill.year}`)
                        }
                      }
                    }
                    const billPeriodsText = periodsList.length > 0 ? periodsList.join(', ') : '—'

                    return (
                      <tr key={p.id} className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${idx === filtered.length - 1 ? 'border-b-0' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold">{p.balance?.house?.houseNo ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{p.balance?.house?.area ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{getHousePhone(p.balance?.house?.id)}</td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            ₹{Number(p.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-muted-foreground text-xs">{p.note ?? '—'}</td>

                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (p.balance?.house) {
                                void openSummary(p.balance.house as House)
                              }
                            }}
                            title="View summary"
                            className="h-8 w-8 p-0"
                          >
                            <Rows3 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          // Reset form when closing dialog
          setFormHouseId('')
          setFormAmount('')
          setFormNote('')
          setFormBills([])
          setFormSelectedBillIds([])
          setFormHouseSelected(false)
          setFormHouseQuery('')
          setFormPaymentMode('all')
          setFormDiscount('')
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] max-sm:max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1 max-sm:space-y-1.5">
            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">House</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search house no or area..." value={formHouseQuery}
                  onChange={e => { setFormHouseQuery(e.target.value); setFormHouseSelected(false); }} className="pl-9 pr-10" />
                {formHouseSelected && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    title="Summary"
                    aria-label="Open house summary"
                    onClick={() => {
                      const selected = houses.find((h) => String(h.id) === formHouseId)
                      if (!selected) {
                        toast.error('Please select a house first')
                        return
                      }
                      void openSummary(selected)
                    }}
                  >
                    <Rows3 className="h-4 w-4" />
                  </Button>
                )}
                {formHouseQuery.trim() !== '' && !formHouseSelected && (
                  <div className="absolute left-0 right-0 mt-1 z-20 rounded-md border border-border bg-card max-h-64 overflow-y-auto">
                    {(() => {
                      const q = formHouseQuery.trim().toLowerCase()
                      const exactMatches: typeof houses = []
                      const partialMatches: typeof houses = []

                      houses.forEach((h) => {
                        const houseNo = h.houseNo.toLowerCase()
                        const area = (h.area ?? '').toLowerCase()

                        if (houseNo === q || area === q) {
                          exactMatches.push(h)
                        } else if (houseNo.includes(q) || area.includes(q)) {
                          partialMatches.push(h)
                        }
                      })

                      const filtered = [...exactMatches, ...partialMatches].slice(0, 8)

                      return (
                        <>
                          {filtered.map(h => (
                            <button type="button" key={h.id} className="w-full text-left px-3 py-2 hover:bg-muted/30 border-b border-border/30 last:border-0"
                              onClick={() => {
                                handleHouseSelect(h.id, h.houseNo, h.area ?? '', h.phoneNo ?? '')
                              }}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{h.houseNo}</span>
                                {h.area && <span className="text-muted-foreground text-xs">— {h.area}</span>}
                                {h.balance && (
                                  <span className="ml-auto text-amber-600 dark:text-amber-400 text-xs font-semibold">
                                    ₹{Number(h.balance.previousBalance).toLocaleString('en-IN')}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                          {filtered.length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No matching houses</div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>

            {formHouseSelected && (
              <>
                <div className="grid grid-cols-2 gap-1 sm:gap-2 sm:grid-cols-4">
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-xs text-foreground">Area</p>
                    <p className="break-words text-sm font-semibold text-foreground sm:text-base">
                      {formArea || '—'}
                    </p>
                  </div>
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-xs text-foreground">Phone</p>
                    <p className="break-words text-sm font-semibold text-foreground sm:text-base">
                      {formPhone || '—'}
                    </p>
                  </div>
                  <div className="col-span-2 space-y-0.5 sm:space-y-1 sm:col-span-2">
                    <Label htmlFor="receipt-amount">Amount (₹) <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Input
                        id="receipt-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="e.g. 1500"
                        value={formAmount}
                        onChange={e => setFormAmount(e.target.value)}
                        className="pr-11"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        aria-label={amountHelperLabel}
                        title={amountHelperLabel}
                        onClick={() => setFormAmount(String(amountHelperAmount))}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Discount Section */}
                <div className="grid grid-cols-2 gap-1 sm:gap-2 sm:grid-cols-4">
                  <div className="space-y-0.5 sm:space-y-1">
                    <Label htmlFor="receipt-discount" className="text-xs sm:text-sm">Discount (₹) <span className="text-muted-foreground text-[10px] sm:text-xs">(Optional)</span></Label>
                    <Input id="receipt-discount" type="number" min="0" step="0.01" placeholder="e.g. 50" value={formDiscount}
                      onChange={e => setFormDiscount(e.target.value)} />
                  </div>
                  <div className="col-span-1 space-y-0.5 sm:space-y-1 sm:col-span-3">
                    <div className="pt-1 sm:pl-4">
                      <p className="text-xs sm:text-sm text-foreground">Total Settlement (₹)</p>
                      <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
                        ₹{((parseFloat(formAmount) || 0) + (parseFloat(formDiscount) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bills Selection */}
                {loadingBills ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
                  </div>
                ) : formBills.length > 0 ? (
                  <div className="space-y-1 border border-border rounded-lg p-2 bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs sm:text-sm font-semibold">Bills to Pay</Label>
                      <Select value={formPaymentMode} onValueChange={(v: "all" | "selected") => {
                        setFormPaymentMode(v)
                        if (v === 'all') {
                          setFormSelectedBillIds(formBills.map(b => b.id))
                          const total = formBills.reduce((sum, b) => sum + (b.pendingAmount || 0), 0)
                          setFormAmount(String(total))
                        }
                      }}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Bills</SelectItem>
                          <SelectItem value="selected">Selected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {formBills.map(bill => {
                        const daysInMonth = new Date(bill.year, bill.month, 0).getDate()
                        const calculatedDateRange = `1 - ${daysInMonth} ${MONTH_NAMES[bill.month - 1]} ${bill.year}`
                        const actualDateRange = bill.fromDate && bill.toDate
                          ? `${new Date(bill.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(bill.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : calculatedDateRange
                        return (
                          <div key={bill.id} className={`flex items-center gap-1 p-1.5 rounded border text-xs ${formSelectedBillIds.includes(bill.id) ? 'bg-primary/10 border-primary' : 'border-border/30'}`}>
                            {formPaymentMode === 'selected' && (
                              <Checkbox
                                checked={formSelectedBillIds.includes(bill.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setFormSelectedBillIds([...formSelectedBillIds, bill.id])
                                  } else {
                                    setFormSelectedBillIds(formSelectedBillIds.filter(id => id !== bill.id))
                                  }
                                  // Update amount based on selected bills
                                  const selected = formPaymentMode === 'selected'
                                    ? (checked ? [...formSelectedBillIds, bill.id] : formSelectedBillIds.filter(id => id !== bill.id))
                                    : formSelectedBillIds
                                  const total = formBills
                                    .filter(b => selected.includes(b.id))
                                    .reduce((sum, b) => sum + (b.pendingAmount || 0), 0)
                                  setFormAmount(String(total))
                                }}
                              />
                            )}
                            <div className="flex-1 text-xs">
                              <div className="font-medium">{actualDateRange}</div>
                              <div className="text-muted-foreground">₹{Number(bill.totalAmount).toLocaleString('en-IN')}</div>
                            </div>
                            <div className={`text-right font-semibold text-xs ${bill.isClosed ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {bill.isClosed ? (
                                <div className="flex items-center gap-1"><Check className="h-3 w-3" /> Closed</div>
                              ) : (
                                <div>Pending: ₹{(bill.pendingAmount || 0).toLocaleString('en-IN')}</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2 text-xs text-muted-foreground">
                    No bills found for this house
                  </div>
                )}
              </>
            )}

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Checkbox checked={formClosePeriod} onCheckedChange={(v) => setFormClosePeriod(Boolean(v))} />
                <Label className="text-xs sm:text-sm">Close specific period (mark deliveries as paid)</Label>
              </div>
              {formClosePeriod && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-1 gap-1.5 sm:gap-2 sm:grid-cols-2">
                    <div className="space-y-0.5 sm:space-y-1">
                      <Label className="text-xs sm:text-sm">From Date</Label>
                      <Input type="date" value={formFromDate} onChange={(e) => setFormFromDate(e.target.value)} />
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      <Label className="text-xs sm:text-sm">Upto Date</Label>
                      <Input type="date" value={formToDate} onChange={(e) => setFormToDate(e.target.value)} />
                    </div>
                  </div>

                  {/* Balance Summary for Period */}
                  {periodSummary && !periodSummary.loading ? (
                    <div className="rounded-lg border border-border bg-linear-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 p-2 space-y-1">
                      {periodSummary.isAlreadyClosed && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs sm:text-sm text-destructive">
                          {periodSummary.alreadyClosedMessage ?? 'This period is already closed.'}
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-0.5 sm:gap-1 sm:grid-cols-3">
                        <div className="space-y-0">
                          <p className="text-[8px] sm:text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Prev Balance</p>
                          <p className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">
                            ₹{periodSummary.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="space-y-0">
                          <p className="text-[8px] sm:text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Period Total</p>
                          <p className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">
                            ₹{periodSummary.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-[8px] sm:text-[10px] text-muted-foreground">{periodSummary.logCount} deliveries</p>
                        </div>
                        <div className="space-y-0">
                          <p className="text-[8px] sm:text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Current Balance</p>
                          <p className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            ₹{periodSummary.currentBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : periodSummary?.loading ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-2">
                      <div className="flex gap-2 items-center">
                        <div className="h-2.5 w-2.5 rounded-full border-2 border-muted-foreground border-t-foreground animate-spin" />
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Loading period summary...</p>
                      </div>
                    </div>
                  ) : null}

                  {/* Delivery Logs Button */}
                  {periodDeliveryLogs.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setShowDeliveryLogsModal(true)}
                    >
                      View Delivery Logs ({periodDeliveryLogs.length})
                    </Button>
                  ) : loadingDeliveryLogs ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-2">
                      <div className="flex gap-2 items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full border-2 border-muted-foreground border-t-foreground animate-spin" />
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Loading delivery logs...</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

            </div>

            <div className="space-y-0.5 sm:space-y-1">
              <Label htmlFor="receipt-note" className="text-xs sm:text-sm">Note (Optional)</Label>
              <Textarea id="receipt-note" placeholder="e.g. Cash received on 1st April" value={formNote}
                onChange={e => setFormNote(e.target.value)} rows={1} className="min-h-8 sm:min-h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecord} disabled={saving || closePeriodBlocked}>
              {saving ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Logs Modal */}
      <Dialog open={showDeliveryLogsModal} onOpenChange={setShowDeliveryLogsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery Logs</DialogTitle>
            <DialogDescription>
              {periodDeliveryLogs.length} deliveries from {formFromDate} to {formToDate}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {periodDeliveryLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-sm">{new Date(log.deliveredAt || log.createdAt).toLocaleDateString('en-IN')}</p>
                      <p className="text-xs text-muted-foreground">{new Date(log.deliveredAt || log.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                      {log.shift}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">₹{Number(log.totalAmount).toLocaleString('en-IN')}</p>
                    {log.billGenerated && <p className="text-xs text-green-600 dark:text-green-400">Billed</p>}
                  </div>
                </div>

                {log.items && log.items.length > 0 && (
                  <div className="bg-muted/40 rounded p-2.5 space-y-1.5">
                    {log.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div className="text-xs">
                          <p className="font-medium">{item.milkType}</p>
                          <p className="text-muted-foreground">{item.qty}L @ ₹{Number(item.rate).toLocaleString('en-IN')}/L</p>
                        </div>
                        <p className="font-semibold">₹{Number(item.amount).toLocaleString('en-IN')}</p>
                      </div>
                    ))}
                  </div>
                )}

                {log.note && (
                  <div className="border-l-2 border-muted-foreground/30 pl-2.5">
                    <p className="text-xs text-muted-foreground italic">&quot;{log.note}&quot;</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={summaryOpen} onOpenChange={(open) => {
        setSummaryOpen(open)
        if (!open) {
          setSummaryHouse(null)
          setSummaryBalance(null)
          setSummaryLogs([])
        }
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {summaryHouse && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Rows3 className="h-5 w-5 text-primary" />
                  House {summaryHouse.houseNo} Delivery Summary
                </DialogTitle>
                <DialogDescription>
                  {summaryHouse.area ? `Area: ${summaryHouse.area}` : 'House summary'}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-center gap-2 border-b border-border pb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleChangeSummaryPeriod(getPreviousMonth(summaryPeriod.year, summaryPeriod.month))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-48 text-center text-sm font-medium">
                  {MONTH_NAMES[summaryPeriod.month]} {summaryPeriod.year}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleChangeSummaryPeriod(getNextMonth(summaryPeriod.year, summaryPeriod.month))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

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
                              <th className="px-4 py-3 text-right font-semibold text-foreground">Paid</th>
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
                              </tr>
                            ))}
                            <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                              <td className="px-4 py-3 text-foreground">Total Received</td>
                              <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                                ₹{paymentSummaryRows.reduce((sum, row) => sum + row.paidAmount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Monthly Product Summary</h3>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    {summaryLoading ? (
                      <div className="space-y-3">
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
                              {Array.from(new Set(monthlyProductSummary.flatMap((item) => item.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                const [year, month] = monthKey.split('-').map(Number)
                                return (
                                  <th key={monthKey} className="px-3 py-3 text-right font-semibold text-foreground min-w-20">{MONTH_NAMES[month]} {year}</th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {monthlyProductSummary.map((row, idx) => {
                              const uniqueMonths = Array.from(new Set(monthlyProductSummary.flatMap((item) => item.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort()
                              const productTotal = summaryTotals.productTotals.find((item) => item.product === row.product)
                              return (
                                <tr key={row.product} className={`border-b border-border ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                  <td className="px-4 py-3 font-medium text-foreground">{row.product}</td>
                                  {uniqueMonths.map((monthKey) => {
                                    const monthData = row.months.find((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}` === monthKey)
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
                                  {Array.from(new Set(monthlyProductSummary.flatMap((item) => item.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                    return (
                                      <td key={monthKey} className="px-3 py-3 text-right text-foreground">
                                        ₹{summaryTotals.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </td>
                                    )
                                  })}
                                </tr>
                                <tr className="border-t border-border bg-muted/50 font-semibold">
                                  <td className="px-4 py-3 text-amber-600 dark:text-amber-400">Previous Balance</td>
                                  {Array.from(new Set(monthlyProductSummary.flatMap((item) => item.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                    const prevBal = Number(summaryBalance?.previousBalance ?? 0)
                                    return (
                                      <td key={monthKey} className="px-3 py-3 text-right text-amber-600 dark:text-amber-400">
                                        ₹{prevBal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </td>
                                    )
                                  })}
                                </tr>
                                <tr className="border-t-2 border-border bg-muted/50 font-bold">
                                  <td className="px-4 py-3 text-foreground">Grand Total</td>
                                  {Array.from(new Set(monthlyProductSummary.flatMap((item) => item.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                    const prevBal = Number(summaryBalance?.previousBalance ?? 0)
                                    const grandTotal = summaryTotals.grandTotal + prevBal
                                    return (
                                      <td key={monthKey} className="px-3 py-3 text-right text-primary">
                                        ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </td>
                                    )
                                  })}
                                </tr>
                                {!hasDateRangeFilter && (
                                  <tr className="border-t border-border bg-muted/50 font-semibold">
                                    <td className="px-4 py-3">Pending Amount</td>
                                    {Array.from(new Set(monthlyProductSummary.flatMap((item) => item.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                      const totalReceived = paymentSummaryRows.reduce((sum, row) => sum + row.paidAmount, 0)
                                      const pending = Math.max(0, summaryTotals.grandTotal - totalReceived)
                                      return (
                                        <td key={monthKey} className="px-3 py-3 text-right text-amber-600 dark:text-amber-400">
                                          ₹{pending.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )}
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Daily Deliveries</h3>
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
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="px-4 py-3 text-left font-semibold">Date</th>
                              <th className="px-4 py-3 text-left font-semibold">Products</th>
                              <th className="px-4 py-3 text-left font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displaySummaryRows.map((row, idx) => {
                              const blocked = isDeliveryBlockedByBill(row.dateKey) || Boolean(row.log?.billGenerated)
                              const isPaid = Boolean(row.log?.billGenerated)
                              return (
                                <tr key={row.dateKey} className={`border-b border-border ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'} ${isPaid ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}`}>
                                  <td className={`px-4 py-3 font-medium ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>{row.dayLabel}</td>
                                  <td className={`px-4 py-3 whitespace-normal ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                                    {row.hasDelivery ? row.productsLabel : <span className="text-muted-foreground">-</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center justify-start gap-1">
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
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

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
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</p>
                    <p className="mt-1 text-sm font-semibold">{new Date(editingDeliveryLog.deliveredAt).toLocaleDateString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shift</p>
                    <p className="mt-1 text-sm font-semibold capitalize">
                      {editingDeliveryShifts.length > 1 ? editingDeliveryShifts.join(', ') : editingDeliveryShifts[0] ?? editingDeliveryLog.shift}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">House</p>
                    <p className="mt-1 text-sm font-semibold">{summaryHouse?.houseNo || '-'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Delivery Items</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const activeProducts = getActiveProducts(productRates)
                        const firstProduct = activeProducts[0] ?? { name: '', rate: 0 }
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
                        <div className="grid grid-cols-12 items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
                          <div className="col-span-5">Product</div>
                          <div className="col-span-2 text-right">Rate (₹/L)</div>
                          <div className="col-span-2 text-right">Qty (L)</div>
                          <div className="col-span-2 text-right">Amount</div>
                          <div className="col-span-1" />
                        </div>

                        {(editDeliveryForm.items || []).map((item, index) => (
                          <div key={index} className="grid grid-cols-12 items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0">
                            <div className="col-span-5 flex items-center gap-2">
                              <Select
                                value={item.milkType || ''}
                                onValueChange={(value) => {
                                  const newRate = getPreferredRateForHouse(value)
                                  const updated = [...editDeliveryForm.items]
                                  const newQty = updated[index].qty ?? 0
                                  updated[index] = { ...updated[index], milkType: value, rate: newRate, amount: newQty * newRate }
                                  setEditDeliveryForm({ ...editDeliveryForm, items: updated })
                                }}
                              >
                                <SelectTrigger className="h-8 w-32">
                                  <SelectValue>{item.milkType || 'Select'}</SelectValue>
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
                                onChange={(event) => {
                                  const newQty = Number(event.target.value)
                                  const newAmount = newQty * item.rate
                                  const updated = [...editDeliveryForm.items]
                                  updated[index] = { ...item, qty: newQty, amount: newAmount }
                                  setEditDeliveryForm({ ...editDeliveryForm, items: updated })
                                }}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-right text-sm"
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

                <div className="space-y-2">
                  <Label htmlFor="delivery-note">Notes</Label>
                  <Textarea
                    id="delivery-note"
                    value={editDeliveryForm.note || ''}
                    onChange={(event) => setEditDeliveryForm({ ...editDeliveryForm, note: event.target.value })}
                    placeholder="Optional delivery notes..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-semibold">₹{Number(editDeliveryTotal).toLocaleString('en-IN')}</p>
                  {editDeliveryTotal <= 0 && (
                    <p className="mt-1 text-xs text-destructive">Total must be greater than zero to save.</p>
                  )}
                </div>

                <DialogFooter className="p-0">
                  <Button variant="outline" onClick={() => setEditDeliveryDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => void handleSaveDeliveryEdit()} disabled={editDeliverySaving || editDeliveryTotal <= 0}>
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
            <Button variant="destructive" onClick={() => void handleDeleteDeliveryLog()} disabled={editDeliverySaving}>
              {editDeliverySaving ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}