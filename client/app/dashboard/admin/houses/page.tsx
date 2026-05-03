'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, Search, X, Phone, MapPin, Building2, Bell, CalendarDays,
  Pencil, Trash2, Eye, Settings2, Save, Rows3, ChevronLeft, ChevronRight, Edit2
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { balanceApi, billsApi, deliveryLogsApi, houseConfigApi, housesApi, productRatesApi, usersApi, type Bill, type DeliveryLog, type House, type HouseConfig, type PaymentHistory, type ProductRate } from '@/lib/api'
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

type HouseDeliverySummaryRow = {
  dateKey: string
  dayLabel: string
  productsLabel: string
  hasDelivery: boolean
  logId?: number
  log?: DeliveryLog
}

type DeliveryEditForm = {
  items: Array<{ milkType: string; qty: number; rate: number; amount: number }>
  note?: string
}

function normalizeMilkType(value: unknown): string {
  return String(value ?? '').trim()
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
  return rates.filter(r => r.isActive && Number(r.rate) > 0).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
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
    }

    existing.hasDelivery = true
    // Store the first log for this date (for editing)
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
      },
    )
  }

  return rows
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
  shift: 'morning' | 'evening'; supplierId: string; position: string; dailyAlerts: string; previousBalance: string;
}

type HouseConfigForm = {
  houseId: string
  shift: 'morning' | 'evening'
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

function getHouseShift(house: House): 'morning' | 'evening' {
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

export default function HousesPage() {
  const cachedHouses = useLiveQuery(() => db.houses.toArray())
  const cachedSuppliers = useLiveQuery(() => db.users.where('role').equals('supplier').toArray())
  const houses = useMemo(() => cachedHouses ?? [], [cachedHouses])
  const suppliers = useMemo(() => cachedSuppliers ?? [], [cachedSuppliers])
  const [hydrated, setHydrated] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
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
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryHouse, setSummaryHouse] = useState<House | null>(null)
  const [summaryLogs, setSummaryLogs] = useState<DeliveryLog[]>([])
  const [productRates, setProductRates] = useState<ProductRate[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryBills, setSummaryBills] = useState<Bill[]>([])
  const [summaryPeriod, setSummaryPeriod] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [editDeliveryDialogOpen, setEditDeliveryDialogOpen] = useState(false)
  const [editingDeliveryLog, setEditingDeliveryLog] = useState<DeliveryLog | null>(null)
  const [deletingDeliveryLog, setDeletingDeliveryLog] = useState<DeliveryLog | null>(null)
  const [editDeliveryForm, setEditDeliveryForm] = useState<DeliveryEditForm>({ items: [], note: '' })
  const [editDeliverySaving, setEditDeliverySaving] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const loading = !hydrated && (!cachedHouses || !cachedSuppliers)

  const summaryRows = useMemo(() => {
    if (!summaryHouse) return []
    return buildHouseDeliverySummary(summaryLogs, summaryPeriod.year, summaryPeriod.month)
  }, [summaryHouse, summaryLogs, summaryPeriod])

  const editDeliveryTotal = useMemo(() => {
    return (editDeliveryForm.items || []).reduce((sum, it) => sum + Number(it?.amount ?? 0), 0)
  }, [editDeliveryForm.items])

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
    }, 200)
    return () => clearTimeout(handler)
  }, [search])

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
    doc.setFontSize(16)
    doc.text(title, 14, 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Period: ${periodLabel}`, 14, 23)
    if (summaryHouse.area) {
      doc.text(`Area: ${summaryHouse.area}`, 14, 29)
    }

    autoTable(doc, {
      startY: summaryHouse.area ? 34 : 30,
      head: [['Date', 'Products']],
      body: summaryRows.map((row) => [row.dayLabel, row.hasDelivery ? row.productsLabel : '-']),
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

    doc.save(`house-${summaryHouse.houseNo}-summary-${summaryPeriod.year}-${String(summaryPeriod.month + 1).padStart(2, '0')}.pdf`)
  }, [summaryHouse, summaryPeriod, summaryRows])

  const refreshCachedData = useCallback(async (silent = false) => {
    try {
      await Promise.all([
        housesApi.list(),
        usersApi.list('supplier'),
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
    const query = debouncedSearch.trim().toLowerCase()

    return houses.filter((house) => {
      const shift = getHouseShift(house)
      if (shiftFilter !== 'all' && shift !== shiftFilter) return false

      const paymentStatus = getHousePaymentStatus(house)
      if (paymentFilter !== 'all' && paymentStatus !== paymentFilter) return false

      if (!matchesHouseStatusFilter(house, houseStatusFilter)) return false

      if (!query) return true

      return (
        house.houseNo.toLowerCase().includes(query) ||
        (house.area || '').toLowerCase().includes(query) ||
        house.phoneNo.includes(query)
      )
    })
  }, [houses, debouncedSearch, shiftFilter, paymentFilter, houseStatusFilter])

  const searchSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return []

    return houses
      .filter((house) => {
        const shift = getHouseShift(house)
        if (shiftFilter !== 'all' && shift !== shiftFilter) return false

        const paymentStatus = getHousePaymentStatus(house)
        if (paymentFilter !== 'all' && paymentStatus !== paymentFilter) return false

        if (!matchesHouseStatusFilter(house, houseStatusFilter)) return false

        return (
          house.houseNo.toLowerCase().includes(query) ||
          (house.area || '').toLowerCase().includes(query) ||
          house.phoneNo.includes(query)
        )
      })
      .slice(0, 6)
  }, [houses, search, shiftFilter, paymentFilter, houseStatusFilter])

  const handleSearchSelect = useCallback((value: string) => {
    setSearch(value)
    setDebouncedSearch(value)
    setIsSearchOpen(false)
  }, [])

  const clearSearch = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
  }, [])

  const selectedConfigHouse = houses.find(h => h.id === Number.parseInt(configForm.houseId, 10))

  function openAdd() {
    setForm(emptyForm)
    setFormConfigId(null)
    setEditingId(null)
    setDialogOpen(true)
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
        rate1Type: form.rate1Type || undefined,
        rate1: form.rate1 ? form.rate1 : undefined,
        rate2Type: form.rate2Type || undefined,
        rate2: form.rate2 ? form.rate2 : undefined,
      }

      const savedHouse = editingId
        ? await housesApi.update(editingId, payload)
        : await housesApi.create(payload)

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
      }
      setToggleId(null)
      setToggleDialogMode(null)
      if (viewHouse?.id === toggleId && action === 'delete') {
        setViewHouse(null)
      }
      void refreshCachedData(true)
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    }
  }

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
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setSummaryLoading(false)
    }
  }

  async function handleChangeSummaryPeriod(newPeriod: { year: number; month: number }) {
    if (!summaryHouse || !isValidMonth(newPeriod.year, newPeriod.month)) return
    setSummaryPeriod(newPeriod)
  }

  function getBillForDateKey(dateKey: string): Bill | undefined {
    // dateKey format: "YYYY-MM-DD"
    const [yearStr, monthStr] = dateKey.split('-')
    const month = parseInt(monthStr) - 1 // Convert to 0-indexed month
    const year = parseInt(yearStr)
    return summaryBills.find((bill) => bill.month === month && bill.year === year)
  }

  function isDeliveryBlockedByBill(dateKey: string): boolean {
    const bill = getBillForDateKey(dateKey)
    if (!bill) return false

    // If bill has a generatedDate, block edits for deliveries on or before that date
    if (bill.generatedDate) {
      const genDate = new Date(bill.generatedDate)
      const [y, m, d] = dateKey.split('-').map(Number)
      const deliveryDate = new Date(y, m - 1, d)
      // If deliveryDate is less than or equal to generated date, it's included in bill
      return deliveryDate.getTime() <= genDate.getTime()
    }

    // Fallback: if bill exists for the month but no generatedDate, block edits for safety
    return true
  }

  function openEditDeliveryDialog(row: HouseDeliverySummaryRow) {
    // Check if this specific date is blocked by a generated bill
    if (isDeliveryBlockedByBill(row.dateKey)) {
      toast.error('Cannot edit deliveries that were included in a generated bill')
      return
    }

    if (row.log) {
      // Edit existing delivery
      setEditingDeliveryLog(row.log)
      setEditDeliveryForm({
        items: normalizeDeliveryItems(row.log.items),
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
        totalAmount: '0',
        openingBalance: '0',
        closingBalance: '0',
        note: '',
        supplier: { uuid: primaryConfig?.supplierId || '', username: primaryConfig?.supplier?.username || '' },
      }
      setEditingDeliveryLog(newLog)
      setEditDeliveryForm({
        items: [{ milkType: firstProduct.name, qty: 0, rate: Number(firstProduct.rate), amount: 0 }],
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
      const oldAmount = isNewDelivery
        ? 0
        : (editingDeliveryLog.items ?? []).reduce((sum, item) => sum + (item.amount ?? 0), 0)
      const newAmount = editDeliveryForm.items.reduce((sum, item) => sum + (item.amount ?? 0), 0)
      const amountDifference = newAmount - oldAmount

      // Save delivery changes (create or update)
      if (isNewDelivery) {
        // Create new delivery
        const result = await deliveryLogsApi.create({
          houseId: summaryHouse.id,
          shift: editingDeliveryLog.shift as 'morning' | 'evening' | 'shop',
          items: editDeliveryForm.items,
          note: editDeliveryForm.note,
        })
        toast.success('Delivery created successfully')
      } else {
        // Update existing delivery
        await deliveryLogsApi.update(editingDeliveryLog.id, {
          items: editDeliveryForm.items,
          note: editDeliveryForm.note,
        })
        toast.success('Delivery updated successfully')
      }

      // Update balance if amount changed
      if (amountDifference !== 0) {
        try {
          const currentBalance = await balanceApi.get(summaryHouse.id)
          const currentPreviousBalance = parseFloat(currentBalance.previousBalance) || 0
          const newPreviousBalance = currentPreviousBalance + amountDifference
          await balanceApi.updatePrevious(summaryHouse.id, newPreviousBalance)
          toast.success('Balance updated')
        } catch (error: unknown) {
          console.error('Failed to update balance:', error)
          toast.warning('Balance update failed - delivery saved but balance unchanged')
        }
      }

      // Reload logs to get updated data
      const logs = await deliveryLogsApi.list({ houseId: summaryHouse.id })
      setSummaryLogs(logs)

      setEditDeliveryDialogOpen(false)
      setEditingDeliveryLog(null)
      setEditDeliveryForm({ items: [], note: '' })
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setEditDeliverySaving(false)
    }
  }

  async function handleDeleteDeliveryLog() {
    if (!deletingDeliveryLog || !summaryHouse) return
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
      body: filtered.map((house) => [
        String(house.houseNo),
        house.area || '-',
        house.phoneNo || '-',
        house.balance?.previousBalance ? `₹${Number(house.balance.previousBalance).toLocaleString('en-IN')}` : '-',
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
                          <p className="truncate text-xs text-muted-foreground">
                            {house.area || 'Area not set'} • {house.phoneNo}
                          </p>
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
                  <th className="whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Area</th>
                  <th className="hidden md:table-cell whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Phone</th>
                  <th className="hidden lg:table-cell whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Rate 1</th>
                  <th className="hidden lg:table-cell whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Rate 2</th>
                  <th className="whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Balance</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-semibold text-muted-foreground sm:px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h, idx) => (
                  <tr
                    key={h.houseNo}
                    className={`border-b border-border/60 transition-colors ${h.active ? 'hover:bg-muted/30' : 'bg-red-500/5 hover:bg-red-500/10'} ${idx === filtered.length - 1 ? 'border-b-0' : ''}`}
                  >
                    <td className="px-2 py-2 sm:px-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${h.active ? 'text-foreground' : 'text-red-700 dark:text-red-300'}`}>{h.houseNo}</span>
                        {!h.active && (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                            Deactivated
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground sm:px-3">
                      <div className="flex items-center gap-1">
                        {h.area && <MapPin className="h-3 w-3 shrink-0" />}
                        {h.area || '—'}
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-2 py-2 text-muted-foreground sm:px-3">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />
                        {h.phoneNo}
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-2 py-2 sm:px-3">
                      {h.rate1Type ? (
                        <Badge variant="outline" className="gap-1 font-medium">
                          {h.rate1Type} — ₹{h.rate1}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="hidden lg:table-cell px-2 py-2 sm:px-3">
                      {h.rate2Type ? (
                        <Badge variant="outline" className="gap-1 font-medium">
                          {h.rate2Type} — ₹{h.rate2}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2 sm:px-3">
                      {h.balance ? (
                        <span className={`font-semibold ${Number(h.balance.previousBalance) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          ₹{Number(h.balance.previousBalance).toLocaleString('en-IN')}
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
                        <Button variant="ghost" size="icon" onClick={() => openEdit(h)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {h.active ? (
                          <Button variant="ghost" size="icon" onClick={() => { setToggleId(h.id); setToggleDialogMode('deactivate-confirm') }} title="Deactivate" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
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
                  <SelectItem value="buffalo">Buffalo Milk</SelectItem>
                  <SelectItem value="cow">Cow Milk</SelectItem>
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
                  <SelectItem value="buffalo">Buffalo Milk</SelectItem>
                  <SelectItem value="cow">Cow Milk</SelectItem>
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
                      {suppliers.map(supplier => (
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

                {/* Recent Bills */}
                {viewHouse.bills && viewHouse.bills.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Recent Bills</p>
                    <div className="rounded-xl border border-border overflow-hidden">
                      {viewHouse.bills.slice(0, 6).map((b: Bill, i: number) => (
                        <div key={b.id} className={`flex items-center justify-between px-4 py-3 ${i !== 0 ? 'border-t border-border' : ''} hover:bg-muted/30`}>
                          <span className="text-sm font-medium">{MONTH_NAMES[b.month]} {b.year}</span>
                          <span className="font-semibold text-sm">₹{Number(b.totalAmount).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment History */}
                {viewHouse.balance?.payments && viewHouse.balance.payments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Recent Payments</p>
                    <div className="rounded-xl border border-border overflow-hidden">
                      {viewHouse.balance.payments.slice(0, 5).map((p: PaymentHistory, i: number) => (
                        <div key={p.id} className={`flex items-center justify-between px-4 py-3 ${i !== 0 ? 'border-t border-border' : ''}`}>
                          <div>
                            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                            {p.note && <span className="ml-2 text-xs text-muted-foreground">{p.note}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
          setSummaryHouse(null)
          setSummaryLogs([])
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {summaryHouse && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Rows3 className="h-5 w-5 text-primary" />
                  House {summaryHouse.houseNo} Delivery Summary
                </DialogTitle>
              </DialogHeader>

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

              <div className="space-y-4 py-2">
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
                        {summaryRows.map((row) => {
                          return (
                            <TableRow key={row.dateKey}>
                              <TableCell className="font-medium text-foreground">{row.dayLabel}</TableCell>
                              <TableCell className="whitespace-normal text-foreground">
                                {row.hasDelivery ? row.productsLabel : <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDeliveryDialog(row)}
                                    title={isDeliveryBlockedByBill(row.dateKey) ? 'Cannot edit after bill generation' : 'Edit delivery'}
                                    disabled={isDeliveryBlockedByBill(row.dateKey)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  {!isDeliveryBlockedByBill(row.dateKey) && row.log && (
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
                  {suppliers.map(supplier => (
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
                    <p className="mt-1 text-sm font-semibold capitalize">{editingDeliveryLog.shift}</p>
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
                          rate: Number(firstProduct.rate),
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
                                  const newRate = getRateByProductName(productRates, val)
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
                                      {rate.name} (₹{rate.rate})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="col-span-2">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={item.rate}
                                onChange={(e) => {
                                  const newRate = Number(e.target.value)
                                  const updated = [...editDeliveryForm.items]
                                  const newQty = updated[index].qty ?? 0
                                  updated[index] = { ...updated[index], rate: newRate, amount: newQty * newRate }
                                  setEditDeliveryForm({ ...editDeliveryForm, items: updated })
                                }}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-right"
                                placeholder="Rate"
                              />
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