'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { IndianRupee, Plus, Search, Receipt, History, Check, ChevronDown, Rows3, ChevronLeft, ChevronRight } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { balanceApi, housesApi, billsApi, deliveryLogsApi, productRatesApi, type PaymentHistory, type House, type Bill, type DeliveryLog, type ProductRate } from '@/lib/api'
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

function normalizeMilkType(value: unknown): string {
  return String(value ?? '').trim()
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
    if (log.billGenerated) continue

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
    loading: boolean
  } | null>(null)
  const [periodDeliveryLogs, setPeriodDeliveryLogs] = useState<DeliveryLog[]>([])
  const [loadingDeliveryLogs, setLoadingDeliveryLogs] = useState(false)
  const [showDeliveryLogsModal, setShowDeliveryLogsModal] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryHouse, setSummaryHouse] = useState<House | null>(null)
  const [summaryLogs, setSummaryLogs] = useState<DeliveryLog[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryBills, setSummaryBills] = useState<Bill[]>([])
  const [productRates, setProductRates] = useState<ProductRate[]>([])
  const [summaryPeriod, setSummaryPeriod] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const summaryRows = useMemo(() => {
    if (!summaryHouse) return []
    return buildHouseDeliverySummary(summaryLogs, summaryPeriod.year, summaryPeriod.month)
  }, [summaryHouse, summaryLogs, summaryPeriod])

  const monthlyProductSummary = useMemo(() => {
    if (!summaryHouse) return []
    return buildMonthlyProductSummary(summaryLogs, summaryPeriod.year, summaryPeriod.month)
  }, [summaryHouse, summaryLogs, summaryPeriod])

  const summaryTotals = useMemo(() => {
    if (!summaryHouse) return { productTotals: [] as Array<{ product: string; quantity: number; amount: number }>, grandTotal: 0 }
    const monthLogs = summaryLogs.filter(log => {
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
  }, [summaryHouse, summaryLogs, summaryPeriod])

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
        setPeriodSummary(prev => prev ? { ...prev, loading: true } : { previousBalance: 0, currentBalance: 0, total: 0, logCount: 0, loading: true })
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
      } catch (e: any) {
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
    } catch (e: any) {
      toast.error(e.message)
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
      setFormBills(bills)
      // Auto-select all bills
      setFormSelectedBillIds(bills.map(b => b.id))
      // Calculate total pending
      const totalPending = bills.reduce((sum, b) => sum + (b.pendingAmount || 0), 0)
      setFormAmount(String(totalPending))
    } catch (e: any) {
      toast.error('Failed to load bills')
      setFormBills([])
    } finally {
      setLoadingBills(false)
    }
  }

  const filtered = payments.filter(p => {
    const house = p.balance?.house
    if (!house) return true
    return house.houseNo.toLowerCase().includes(search.toLowerCase()) ||
      house.area?.toLowerCase().includes(search.toLowerCase())
  })

  const getHousePhone = (houseId?: number) => {
    if (houseId === undefined) return '—'

    return houses.find((house) => house.id === houseId)?.phoneNo ?? '—'
  }

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

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  async function openSummary(house: House) {
    setSummaryHouse(house)
    setSummaryLogs([])
    setSummaryBills([])
    setSummaryOpen(true)
    setSummaryLoading(true)

    try {
      const [logs, bills, rates] = await Promise.all([
        deliveryLogsApi.list({ houseId: house.id }),
        billsApi.list({ houseId: house.id }),
        productRatesApi.list(),
      ])
      setSummaryLogs(logs)
      setSummaryBills(bills)
      setProductRates(rates.filter(r => r.isActive && Number(r.rate) > 0))
      setSummaryPeriod(getLogPeriod(logs))
    } catch (error: any) {
      toast.error(error.message || 'Failed to load summary')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function handleChangeSummaryPeriod(newPeriod: { year: number; month: number }) {
    if (!summaryHouse || !isValidMonth(newPeriod.year, newPeriod.month)) return
    setSummaryPeriod(newPeriod)
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
    doc.text(`Period: ${periodLabel}`, 14, 23)
    if (summaryHouse.area) doc.text(`Area: ${summaryHouse.area}`, 14, 29)

    autoTable(doc, {
      startY: 38,
      head: [['Date', 'Products', 'Amount']],
      body: summaryRows.map((row) => [
        row.dayLabel,
        row.productsLabel,
        row.hasDelivery
          ? `₹${(summaryLogs.find(l => l.id === row.logId)?.totalAmount ?? 0).toLocaleString('en-IN')}`
          : '-',
      ]),
      margin: { left: 14, right: 14 },
      styles: { fontSize: 9 },
    })

    doc.save(`House_${summaryHouse.houseNo}_Summary_${periodLabel.replace(' ', '_')}.pdf`)
  }, [summaryHouse, summaryRows, summaryLogs, summaryPeriod])

  async function handleRecord() {
    if (!formHouseId || !formAmount) { toast.error('House and Amount are required'); return }
    setSaving(true)
    try {
      if (formClosePeriod) {
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
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

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
        <p className="text-sm font-medium text-muted-foreground">Total Received (All Time)</p>
        <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
          ₹{totalReceived.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? 's' : ''} recorded</p>
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
              <p className="text-sm mt-1">Click "Record Payment" to log a new receipt</p>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Log a payment received from a house. This will reduce their pending balance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>House</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search house no or area..." value={formHouseQuery}
                  onChange={e => { setFormHouseQuery(e.target.value); setFormHouseSelected(false); }} className="pl-9" />
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
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">House {formHouseQuery}</p>
                      {formArea ? <p className="text-xs text-muted-foreground">{formArea}</p> : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
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
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-1">
                    <p className="text-sm text-foreground">Area</p>
                    <p className="text-lg font-semibold text-foreground">{formArea || '—'}</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-1">
                    <p className="text-sm text-foreground">Phone</p>
                    <p className="text-lg font-semibold text-foreground">{formPhone || '—'}</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label htmlFor="receipt-amount">Amount (₹) <span className="text-destructive">*</span></Label>
                    <Input id="receipt-amount" type="number" min="0.01" step="0.01" placeholder="e.g. 1500" value={formAmount}
                      onChange={e => setFormAmount(e.target.value)} />
                  </div>
                </div>

                {/* Discount Section */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="receipt-discount">Discount (₹) <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                    <Input id="receipt-discount" type="number" min="0" step="0.01" placeholder="e.g. 50" value={formDiscount}
                      onChange={e => setFormDiscount(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="pl-4 pt-2">
                      <p className="text-sm text-foreground">Total Settlement (₹)</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
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
                  <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-semibold">Bills to Pay</Label>
                      <Select value={formPaymentMode} onValueChange={(v: any) => {
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

                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {formBills.map(bill => {
                        const daysInMonth = new Date(bill.year, bill.month, 0).getDate()
                        const calculatedDateRange = `1 - ${daysInMonth} ${MONTH_NAMES[bill.month - 1]} ${bill.year}`
                        const actualDateRange = bill.fromDate && bill.toDate
                          ? `${new Date(bill.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(bill.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : calculatedDateRange
                        return (
                          <div key={bill.id} className={`flex items-center gap-2 p-2 rounded border ${formSelectedBillIds.includes(bill.id) ? 'bg-primary/10 border-primary' : 'border-border/30'}`}>
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
                  <div className="text-center py-3 text-sm text-muted-foreground">
                    No bills found for this house
                  </div>
                )}
              </>
            )}

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={formClosePeriod} onCheckedChange={(v) => setFormClosePeriod(Boolean(v))} />
                    <Label className="text-sm">Close specific period (mark deliveries as paid)</Label>
                  </div>
                  {formClosePeriod && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>From Date</Label>
                          <Input type="date" value={formFromDate} onChange={(e) => setFormFromDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Upto Date</Label>
                          <Input type="date" value={formToDate} onChange={(e) => setFormToDate(e.target.value)} />
                        </div>
                      </div>

                      {/* Balance Summary for Period */}
                      {periodSummary && !periodSummary.loading ? (
                        <div className="rounded-lg border border-border bg-linear-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 p-3 space-y-2">
                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                            <div className="space-y-0">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Prev Balance</p>
                              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                ₹{periodSummary.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="space-y-0">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Period Total</p>
                              <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                                ₹{periodSummary.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{periodSummary.logCount} deliveries</p>
                            </div>
                            <div className="space-y-0">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Current Balance</p>
                              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                ₹{periodSummary.currentBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : periodSummary?.loading ? (
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex gap-3 items-center">
                            <div className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-foreground animate-spin" />
                            <p className="text-xs text-muted-foreground">Loading period summary...</p>
                          </div>
                        </div>
                      ) : null}

                      {/* Delivery Logs Button */}
                      {periodDeliveryLogs.length > 0 ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="w-full"
                          onClick={() => setShowDeliveryLogsModal(true)}
                        >
                          View Delivery Logs ({periodDeliveryLogs.length})
                        </Button>
                      ) : loadingDeliveryLogs ? (
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex gap-3 items-center justify-center">
                            <div className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-foreground animate-spin" />
                            <p className="text-xs text-muted-foreground">Loading delivery logs...</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                </div>

                <div className="space-y-1.5">
              <Label htmlFor="receipt-note">Note (Optional)</Label>
              <Textarea id="receipt-note" placeholder="e.g. Cash received on 1st April" value={formNote}
                onChange={e => setFormNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecord} disabled={saving}>
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
                    <p className="text-xs text-muted-foreground italic">"{log.note}"</p>
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
                              <th className="px-4 py-3 text-left font-semibold">Product</th>
                              <th className="px-4 py-3 text-right font-semibold">Quantity</th>
                              <th className="px-4 py-3 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthlyProductSummary.map((row, idx) => {
                              const productTotal = summaryTotals.productTotals.find(p => p.product === row.product)
                              return (
                                <tr key={row.product} className={`border-b border-border ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                  <td className="px-4 py-3 font-medium">{row.product}</td>
                                  <td className="px-4 py-3 text-right">{row.totalQuantity.toLocaleString('en-IN')}L</td>
                                  <td className="px-4 py-3 text-right font-semibold">₹{(productTotal?.amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                </tr>
                              )
                            })}
                            <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                              <td className="px-4 py-3">Total</td>
                              <td className="px-4 py-3 text-right">
                                {summaryTotals.productTotals.reduce((sum, row) => sum + row.quantity, 0).toLocaleString('en-IN')}L
                              </td>
                              <td className="px-4 py-3 text-right">₹{summaryTotals.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                            </tr>
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
                              <th className="px-4 py-3 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summaryRows.map((row, idx) => (
                              <tr key={row.dateKey} className={`border-b border-border ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                <td className="px-4 py-3 font-medium">{row.dayLabel}</td>
                                <td className="px-4 py-3">
                                  {row.hasDelivery ? row.productsLabel : <span className="text-muted-foreground">-</span>}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold">
                                  {row.hasDelivery ? `₹${(summaryLogs.find(l => l.id === row.logId)?.totalAmount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'}
                                </td>
                              </tr>
                            ))}
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
    </div>
  )
}