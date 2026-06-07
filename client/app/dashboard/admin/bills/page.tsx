'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Plus, FileText, Search, Trash2, Eye, CalendarDays, Check, Download, AlertTriangle } from 'lucide-react'
import { billsApi, deliveryLogsApi, housesApi, balanceApi, type Bill, type House, type BillItem, type BillPreview, type DeliveryLog, type PaymentHistory } from '@/lib/api'
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)
const PDF_PAGE_MARGIN = 10
const PDF_COLUMNS = 2
const PDF_ROWS = 4
const PDF_CARD_GAP_X = 4
const PDF_CARD_GAP_Y = 4
const PDF_TABLE_ROWS = 4

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`
}

function getMonthStart(value: Date = new Date()): string {
  const date = new Date(value)
  date.setDate(1)
  return formatLocalDate(date)
}

function getMonthRange(month: number, year: number) {
  const fromDate = formatLocalDate(new Date(year, month - 1, 1))
  const toDate = formatLocalDate(new Date(year, month, 0))
  return { fromDate, toDate }
}

function getMonthLabel(month: number, year: number) {
  return `${MONTH_NAMES[month]} ${year}`
}

function isValidRange(fromDate: string, toDate: string): boolean {
  if (!fromDate || !toDate) return false

  const from = new Date(fromDate)
  const to = new Date(toDate)
  return !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to
}

function parseDateFieldToString(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''

  // Keep date input values untouched to avoid timezone shifts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized

  // If an ISO datetime is provided, keep only the date portion.
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) return normalized.slice(0, 10)

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  return formatLocalDate(date)
}

function formatPlainAmount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0'
}

function formatQtyLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}L`
}

function formatBillDate(value?: string): string {
  if (!value) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function cleanItemName(name: string): string {
  const text = name.trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  if (lower === 'milk') return ''
  if (lower === 'buffalo milk' || lower === 'buffalo milk milk' || lower.startsWith('buffalo milk ') || lower.startsWith('buffalo milk milk ')) return 'Buffalo Milk'
  if (lower === 'cow milk' || lower === 'cow milk milk' || lower.startsWith('cow milk ') || lower.startsWith('cow milk milk ')) return 'Cow Milk'
  const cleaned = text.replace(/\s+[Mm][Ii][Ll][Kk]$/, '') || text
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function billItemProduct(name: string): 'buffalo' | 'cow' | 'other' {
  const lower = name.toLowerCase().trim()
  if (lower === 'buffalo milk' || lower === 'buffalo milk milk' || lower.startsWith('buffalo milk ')) return 'buffalo'
  if (lower === 'cow milk' || lower === 'cow milk milk' || lower.startsWith('cow milk ')) return 'cow'
  return 'other'
}

function buildPrintableBillItems(items: BillItem[]): BillItem[] {
  let buffaloQty = 0, buffaloAmount = 0;
  let cowQty = 0, cowAmount = 0;
  let otherAmount = 0;

  for (const item of items) {
    const name = String(item.name ?? '').trim();
    const qty = Number(item.qty ?? 0);
    const amount = Number(item.amount ?? 0);
    if (qty <= 0 && amount <= 0) continue;

    const product = billItemProduct(name);
    if (product === 'buffalo') {
      buffaloQty += qty;
      buffaloAmount += amount;
    } else if (product === 'cow') {
      cowQty += qty;
      cowAmount += amount;
    } else {
      otherAmount += amount;
    }
  }

  const result: BillItem[] = [];
  if (buffaloQty > 0) result.push({ name: 'Buffalo Milk', qty: buffaloQty, rate: Number((buffaloAmount / buffaloQty).toFixed(2)), amount: buffaloAmount });
  if (cowQty > 0) result.push({ name: 'Cow Milk', qty: cowQty, rate: Number((cowAmount / cowQty).toFixed(2)), amount: cowAmount });
  if (otherAmount > 0) result.push({ name: 'Other', qty: 0, rate: 0, amount: otherAmount });
  return result;
}

function buildPrintableBillItemsFromLogs(logs: DeliveryLog[]): BillItem[] {
  return buildPrintableBillItems(buildItemsFromDeliveryLogs(logs))
}

function getPrintableBillItems(
  bill: Bill & { house: NonNullable<Bill['house']> },
  logs: DeliveryLog[] = [],
): BillItem[] {
  if (logs.length > 0) {
    const printableFromLogs = buildPrintableBillItemsFromLogs(logs)
    if (printableFromLogs.some((item) => Number(item.amount ?? 0) > 0)) {
      return printableFromLogs
    }
  }

  return buildPrintableBillItems(bill.items ?? [])
}

function hasPrintableBillContent(
  bill: Bill & { house: NonNullable<Bill['house']> },
  logs: DeliveryLog[] = [],
): boolean {
  const printableItems = getPrintableBillItems(bill, logs)
  return printableItems.some((item) => Number(item.amount ?? 0) > 0)
}

function buildItemsFromDeliveryLogs(logs: DeliveryLog[]): BillItem[] {
  const itemSummary = new Map<string, BillItem>()

  for (const log of logs) {
    const logItems = Array.isArray(log.items) ? log.items : []
    for (const rawItem of logItems) {
      const milkType = String(rawItem?.milkType ?? rawItem?.name ?? 'milk').trim()
      const normalizedType = milkType.toLowerCase()
      const qty = Number(rawItem?.qty ?? 0)
      const rate = Number(rawItem?.rate ?? 0)
      const amount = Number(rawItem?.amount ?? qty * rate)
      if (qty <= 0 || rate <= 0 || amount <= 0) continue

      const key = `${normalizedType}:${rate}`
      const existingItem = itemSummary.get(key)
      const displayName = normalizedType.endsWith('milk')
        ? normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1, -4) + 'Milk'
        : normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1) + ' Milk';
      if (!existingItem) {
        itemSummary.set(key, {
          name: displayName,
          qty,
          rate,
          amount,
        })
      } else {
        existingItem.qty += qty
        existingItem.amount += amount
      }
    }
  }

  const totalAmount = logs.reduce((sum, log) => sum + Number(log.totalAmount ?? 0), 0)
  const billItems = Array.from(itemSummary.values())

  if (billItems.length === 0 && totalAmount > 0) {
    billItems.push({
      name: 'Delivery Total',
      qty: 1,
      rate: totalAmount,
      amount: totalAmount,
    })
  }

  return billItems
}

function createSyntheticBillFromLogs(house: House, month: number, year: number, logs: DeliveryLog[]): Bill & { house: NonNullable<Bill['house']> } {
  const totalAmount = logs.reduce((sum, log) => sum + Number(log.totalAmount ?? 0), 0)
  const previousBalance = Number(house.balance?.previousBalance ?? 0)
  const monthRange = getMonthRange(month, year)
  const supplierName = house.configs?.[0]?.supplier?.username
  const shiftLabel = house.configs?.[0]?.shift === 'morning' ? (supplierName ?? 'MORNING') : house.configs?.[0]?.shift === 'evening' ? 'EVENING' : house.configs?.[0]?.shift === 'shop' ? 'SHOP' : ''
  return {
    id: -house.id,
    houseId: house.id,
    month,
    year,
    fromDate: monthRange.fromDate,
    toDate: monthRange.toDate,
    totalAmount: String(totalAmount),
    items: buildItemsFromDeliveryLogs(logs),
    previousBalance: String(previousBalance),
    generatedDate: monthRange.toDate,
    isClosed: false,
    outstandingAmount: String(totalAmount),
    note: undefined,
    _shiftLabel: shiftLabel || undefined,
    house: {
      id: house.id,
      houseNo: house.houseNo,
      area: house.area,
      phoneNo: house.phoneNo ?? undefined,
    },
  }
}

function getHouseBalanceSummary(house?: Partial<House> | null) {
  const currentBalance = Number(house?.balance?.currentBalance ?? 0)
  const previousBalance = Number(house?.balance?.previousBalance ?? 0)
  const totalBalance = currentBalance + previousBalance

  return { currentBalance, previousBalance, totalBalance }
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingBalancePdf, setExportingBalancePdf] = useState(false)
  const [printBills, setPrintBills] = useState<Array<Bill & { house: NonNullable<Bill['house']> }>>([])
  const [printLoading, setPrintLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState<string>('')
  const [filterYear, setFilterYear] = useState<string>(String(CURRENT_YEAR))
  const [printMonth, setPrintMonth] = useState<string>(String(new Date().getMonth() + 1))
  const [printYear, setPrintYear] = useState<string>(String(CURRENT_YEAR))
  const [pendingOpen, setPendingOpen] = useState(false)
  const [pendingData, setPendingData] = useState<Array<{ houseNo: string; previousBalance: number; latestPayment: { amount: number; date: string } | null; shift: string; supplier: string }>>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [viewBill, setViewBill] = useState<Bill | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [generateMode, setGenerateMode] = useState<'single' | 'all'>('single')

  // Generate form
  const [genHouseId, setGenHouseId] = useState('')
  const [genHouseSearch, setGenHouseSearch] = useState('')
  const [genFromDate, setGenFromDate] = useState(() => getMonthStart())
  const [genToDate, setGenToDate] = useState(() => formatLocalDate(new Date()))
  const [genNote, setGenNote] = useState('')

  // Preview State
  const [previewData, setPreviewData] = useState<BillPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const hasLoadedOnceRef = useRef(false)

  const generateDisabled =
    saving ||
    previewLoading ||
    !isValidRange(genFromDate, genToDate) ||
    (generateMode === 'single' && !genHouseId) ||
    Boolean(previewData?.isAlreadyClosed || previewData?.isDurationAlreadyCreated)

  const load = useCallback(async () => {
    try {
      if (!hasLoadedOnceRef.current) {
        setLoading(true)
      }
      const [billsData, housesData] = await Promise.all([
        billsApi.list({
          month: filterMonth ? parseInt(filterMonth) : undefined,
          year: filterYear ? parseInt(filterYear) : undefined,
        }),
        housesApi.list(),
      ])
      setBills(billsData)
      setHouses(housesData)
      hasLoadedOnceRef.current = true
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load bills')
    } finally {
      setLoading(false)
    }
  }, [filterMonth, filterYear])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (generateMode !== 'single') {
      setPreviewData(null)
      return
    }
    if (!genHouseId || !isValidRange(genFromDate, genToDate)) {
      setPreviewData(null)
      return
    }
    const fetchPreview = async () => {
      setPreviewLoading(true)
      try {
        const data = await billsApi.preview(parseInt(genHouseId), {
          fromDate: parseDateFieldToString(genFromDate),
          toDate: parseDateFieldToString(genToDate),
        })
        setPreviewData(data)
        setGenNote(data.lastNote ?? '')
      } catch {
        setPreviewData(null)
      } finally {
        setPreviewLoading(false)
      }
    }
    fetchPreview()
  }, [genHouseId, genFromDate, genToDate, generateMode])

  const filteredGenHouses = useMemo(() => {
    const q = genHouseSearch.trim().toLowerCase()
    if (!q) return houses.slice().sort((a, b) => a.houseNo.localeCompare(b.houseNo))

    const exactMatches: typeof houses = []
    const partialMatches: typeof houses = []

    houses.forEach((h) => {
      const houseNo = h.houseNo.toLowerCase()
      const area = (h.area || '').toLowerCase()

      if (houseNo === q || area === q) {
        exactMatches.push(h)
      } else if (houseNo.includes(q) || area.includes(q)) {
        partialMatches.push(h)
      }
    })

    exactMatches.sort((a, b) => a.houseNo.localeCompare(b.houseNo))
    partialMatches.sort((a, b) => a.houseNo.localeCompare(b.houseNo))

    return [...exactMatches, ...partialMatches]
  }, [houses, genHouseSearch])

  const selectedGenHouse = useMemo(() => houses.find((h) => String(h.id) === genHouseId), [houses, genHouseId])

  const printRange = useMemo(() => getMonthRange(parseInt(printMonth) || new Date().getMonth() + 1, parseInt(printYear) || CURRENT_YEAR), [printMonth, printYear])

  useEffect(() => {
    let cancelled = false

    const loadPrintBills = async () => {
      if (!printMonth || !printYear) {
        setPrintBills([])
        return
      }

      setPrintLoading(true)
      try {
        const selectedMonth = parseInt(printMonth)
        const selectedYear = parseInt(printYear)
        const [monthBills, monthLogs] = await Promise.all([
          billsApi.list({ month: selectedMonth, year: selectedYear }),
          deliveryLogsApi.list({ fromDate: printRange.fromDate, toDate: printRange.toDate }),
        ])

        const housesById = new Map(houses.map((house) => [house.id, house]))
        const billsByHouseId = new Map<number, Bill & { house: NonNullable<Bill['house']> }>()
        const logsByHouseId = new Map<number, DeliveryLog[]>()

        for (const log of monthLogs) {
          const bucket = logsByHouseId.get(log.houseId) ?? []
          bucket.push(log)
          logsByHouseId.set(log.houseId, bucket)
        }

        for (const bill of monthBills) {
          const house = bill.house ?? housesById.get(bill.houseId)
          if (!house) continue

          const existing = billsByHouseId.get(bill.houseId)
          const nextBillDate = new Date(bill.generatedDate).getTime()
          const existingBillDate = existing ? new Date(existing.generatedDate).getTime() : Number.NEGATIVE_INFINITY

          if (!existing || nextBillDate >= existingBillDate) {
            const houseConfig = housesById.get(bill.houseId)?.configs?.[0]
            const supplierName = houseConfig?.supplier?.username
            const shiftLabel = houseConfig?.shift === 'morning' ? (supplierName ?? 'MORNING') : houseConfig?.shift === 'evening' ? 'EVENING' : houseConfig?.shift === 'shop' ? 'SHOP' : ''
            billsByHouseId.set(bill.houseId, { ...bill, house, _shiftLabel: shiftLabel as string | undefined })
          }
        }

        const next = Array.from(billsByHouseId.values()).sort((left, right) =>
          (left.house?.houseNo ?? '').localeCompare(right.house?.houseNo ?? '', undefined, { numeric: true, sensitivity: 'base' }),
        )

        if (!cancelled) {
          setPrintBills(next)
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setPrintBills([])
          toast.error(error instanceof Error ? error.message : 'Failed to prepare print bills')
        }
      } finally {
        if (!cancelled) {
          setPrintLoading(false)
        }
      }
    }

    loadPrintBills()

    return () => {
      cancelled = true
    }
  }, [houses, printMonth, printRange.fromDate, printRange.toDate, printYear])

  const handleOpenPending = useCallback(async () => {
    setPendingLoading(true)
    setPendingOpen(true)
    try {
      const [allHouses, allPayments] = await Promise.all([
        housesApi.list(),
        balanceApi.allPayments(),
      ])

      const latestPaymentByHouse = new Map<number, { amount: number; date: string }>()
      for (const p of allPayments) {
        const houseId = p.balance?.house?.id
        if (houseId == null) continue
        const existing = latestPaymentByHouse.get(houseId)
        const pDate = new Date(p.paidAt || p.createdAt)
        if (!existing || pDate > new Date(existing.date)) {
          latestPaymentByHouse.set(houseId, {
            amount: Number(p.amount ?? 0),
            date: p.paidAt || p.createdAt,
          })
        }
      }

      const data = allHouses
        .filter(h => h.active && Number(h.balance?.previousBalance ?? 0) > 0)
        .map(h => {
          const config = h.configs?.[0]
          const shift = config?.shift ?? ''
          const supplier = config?.supplier?.username ?? ''
          return {
            houseNo: h.houseNo,
            previousBalance: Number(h.balance?.previousBalance ?? 0),
            latestPayment: latestPaymentByHouse.get(h.id) ?? null,
            shift,
            supplier,
            _sortKey: `${shift === 'shop' ? '0' : shift === 'morning' ? '1' : '2'}_${supplier}_${h.houseNo.padStart(5, '0')}`,
          }
        })
        .sort((a, b) => a._sortKey.localeCompare(b._sortKey))

      setPendingData(data)
    } catch {
      setPendingData([])
      toast.error('Failed to load pending houses')
    } finally {
      setPendingLoading(false)
    }
  }, [])

  const handleExportPendingPdf = useCallback(() => {
    if (pendingData.length === 0) return
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text('Houses with Pending Balance', 14, 16)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 23)

    autoTable(doc, {
      startY: 30,
      head: [['#', 'House', 'Shift / Supplier', 'Pre Bal (₹)', 'Latest Payment (₹)', 'Payment Date']],
      body: pendingData.map((d, i) => [
        i + 1,
        `H.N - ${d.houseNo}`,
        d.shift === 'shop' ? 'Shop' : d.shift === 'morning' ? `Morning - ${d.supplier || '-'}` : `Evening - ${d.supplier || '-'}`,
        d.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        d.latestPayment ? d.latestPayment.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-',
        d.latestPayment ? new Date(d.latestPayment.date).toLocaleDateString('en-IN') : '-',
      ]),
      styles: { fontSize: 9, cellPadding: 2, fontStyle: 'bold', textColor: [0, 0, 0] },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 24 },
        2: { cellWidth: 34 },
        3: { cellWidth: 24 },
        4: { cellWidth: 28 },
        5: { cellWidth: 26 },
      },
    })

    // Page numbers
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' })
    }

    doc.save(`pending-houses-${new Date().toISOString().split('T')[0]}.pdf`)
  }, [pendingData])

  const handleExportBalancePdf = useCallback(async () => {
    if (exportingBalancePdf) return

    if (printBills.length === 0) {
      toast.error('No house bills with balance were found to print for the selected month')
      return
    }

    setExportingBalancePdf(true)

    try {
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const usableWidth = pageWidth - (PDF_PAGE_MARGIN * 2)
      const usableHeight = pageHeight - (PDF_PAGE_MARGIN * 2)
      const cardWidth = (usableWidth - PDF_CARD_GAP_X) / 2
      const cardHeight = (usableHeight - (PDF_CARD_GAP_Y * (PDF_ROWS - 1))) / PDF_ROWS
      const innerWidth = cardWidth - 2
      const leftColWidth = 10
      const particularsWidth = 34
      const qtyWidth = 16
      const rateWidth = 16
      const amtWidth = 16
      const contentWidth = leftColWidth + particularsWidth + qtyWidth + rateWidth + amtWidth
      const contentLeftPad = (innerWidth - contentWidth) / 2
      const headerTextY = 3.5
      const titleY = 8.5
      const noteY = 12
      const toY = 14.5
      const tableTop = 18
      const tableHeaderHeight = 6.6
      const rowHeight = 4.65
      const textColor: [number, number, number] = [20, 20, 20]
      const borderColor: [number, number, number] = [0, 0, 0]
      const mutedColor: [number, number, number] = [35, 35, 35]

      const drawCell = (
        x: number,
        y: number,
        width: number,
        height: number,
        text: string | string[],
        align: 'left' | 'center' | 'right' = 'left',
        options?: { bold?: boolean; italic?: boolean; size?: number; fill?: boolean },
      ) => {
        const bold = options?.bold ?? false
        const italic = options?.italic ?? false
        const size = options?.size ?? 6.5
        const fill = options?.fill ?? false
        const paddingX = 1.35
        if (fill) {
          doc.setFillColor(255, 255, 255)
          doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2])
          doc.rect(x, y, width, height, 'FD')
        } else {
          doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2])
          doc.rect(x, y, width, height)
        }
        doc.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal')
        doc.setFontSize(size)
        doc.setTextColor(textColor[0], textColor[1], textColor[2])
        const textValue = Array.isArray(text) ? text : [text]
        const textX = align === 'right' ? x + width - paddingX : align === 'center' ? x + width / 2 : x + paddingX

        if (textValue.length > 1) {
          const lineHeight = size * 0.3528 * 1.06
          const textBlockHeight = textValue.length * lineHeight
          const textY = y + ((height - textBlockHeight) / 2) + lineHeight
          doc.text(textValue, textX, textY, { align, baseline: 'top', lineHeightFactor: 1.06 })
          return
        }

        doc.text(textValue[0] ?? '', textX, y + (height / 2), { align, baseline: 'middle' })
      }

      const drawBillCard = (bill: Bill & { house: NonNullable<Bill['house']> }, indexInPage: number) => {
        const column = indexInPage % PDF_COLUMNS
        const row = Math.floor(indexInPage / PDF_COLUMNS)
        const x = PDF_PAGE_MARGIN + (column * (cardWidth + PDF_CARD_GAP_X))
        const y = PDF_PAGE_MARGIN + (row * (cardHeight + PDF_CARD_GAP_Y))

        doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2])
        doc.setLineWidth(0.3)
        doc.rect(x, y, cardWidth, cardHeight)

        const innerX = x + 1
        const innerY = y + 1
        const innerRight = x + cardWidth - 1
        const rowX = innerX + contentLeftPad

        doc.setFont('helvetica', 'bolditalic')
        doc.setFontSize(5.7)
        doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2])
        doc.text(`Bill of Month: ${MONTH_NAMES[bill.month]}`, rowX, innerY + headerTextY)
        doc.text(`Date: ${formatBillDate(bill.generatedDate || bill.toDate)}`, innerRight - 1.6, innerY + headerTextY, { align: 'right' })

        doc.setFont('helvetica', 'bolditalic')
        doc.setFontSize(9.3)
        doc.setTextColor(textColor[0], textColor[1], textColor[2])
        doc.text('DAIRY', x + cardWidth / 2, innerY + titleY, { align: 'center' })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.5)
        doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2])
        doc.text('Note: Bill has to be submitted by 15th of month', x + cardWidth / 2, innerY + noteY, { align: 'center' })

        doc.setFont('helvetica', 'bolditalic')
        doc.setFontSize(6.5)
        doc.setTextColor(textColor[0], textColor[1], textColor[2])
        doc.text(`To: ${bill.house?.houseNo ?? ''}`, rowX, innerY + toY)

        const firstDataRowY = innerY + tableTop + tableHeaderHeight
        const footerStartY = firstDataRowY + (PDF_TABLE_ROWS * rowHeight) + 0.6

        const tableX = rowX
        const headerY = innerY + tableTop
        const colWidths = [leftColWidth, particularsWidth, qtyWidth, rateWidth, amtWidth]
        const colXs = colWidths.reduce<number[]>((acc, width, index) => {
          acc.push(index === 0 ? tableX : acc[index - 1] + colWidths[index - 1])
          return acc
        }, [])

        const headerLabels = ['SR.\nNO.', 'PARTICULAR', 'QTY', 'RATE', 'AMT']
        headerLabels.forEach((label, index) => {
          drawCell(colXs[index], headerY, colWidths[index], tableHeaderHeight, label, 'center', { bold: true, size: 5.8, fill: true })
        })

        const items = buildPrintableBillItems(bill.items ?? [])
        items.forEach((item, index) => {
          const rowY = firstDataRowY + (index * rowHeight)
          const isOther = String(item.name ?? '').toLowerCase() === 'other'
          const values = [
            String(index + 1),
            item.name ? item.name.toUpperCase() : '',
            isOther ? '' : formatQtyLabel(Number(item.qty ?? 0)),
            isOther ? '' : (Number(item.rate ?? 0) ? formatPlainAmount(Number(item.rate ?? 0)) : ''),
            Number(item.amount ?? 0) ? formatPlainAmount(Number(item.amount ?? 0)) : '',
          ]
          values.forEach((value, columnIndex) => {
            drawCell(colXs[columnIndex], rowY, colWidths[columnIndex], rowHeight, value, columnIndex === 1 ? 'left' : 'center', {
              bold: true,
              size: 5.6,
              fill: true,
            })
          })
        })

        // Previous Balance row
        const previousBalance = Number(bill.previousBalance ?? 0)
        const balanceLabel = previousBalance < 0 ? 'ADVANCE' : 'BAL'
        const prevRowY = firstDataRowY + (items.length * rowHeight)
        const prevValues = ['', 'PREVIOUS BALANCE / ADVANCE', '', '', `${formatPlainAmount(Math.abs(previousBalance))} ${balanceLabel}`]
        prevValues.forEach((value, columnIndex) => {
          drawCell(colXs[columnIndex], prevRowY, colWidths[columnIndex], rowHeight, value, columnIndex === 1 || columnIndex === 4 ? 'right' : 'center', {
            bold: true,
            size: 5.6,
            fill: true,
          })
        })

        const outstandingAmount = Number(bill.outstandingAmount ?? bill.totalAmount ?? 0)
        const receipts = Math.max(0, Number(bill.totalAmount ?? 0) - outstandingAmount)

        const receiptsY = footerStartY
        const receiptsWidth = innerWidth * 0.68
        const totalWidth = innerWidth - receiptsWidth
        drawCell(tableX, receiptsY, receiptsWidth, 5.9, `THIS MONTH RECEIPTS: Rs. ${formatPlainAmount(receipts)}`, 'left', { bold: true, size: 5.7, fill: true })
        drawCell(tableX + receiptsWidth, receiptsY, totalWidth, 5.9, '', 'center', { bold: true, size: 6.2, fill: true })
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.2)
        doc.setTextColor(textColor[0], textColor[1], textColor[2])
        doc.text('Total', tableX + receiptsWidth + 1.4, receiptsY + 3.1, { baseline: 'middle' })
        doc.text(formatPlainAmount(Number(bill.totalAmount ?? 0) + previousBalance), tableX + innerWidth - 1.4, receiptsY + 3.1, { align: 'right', baseline: 'middle' })

        doc.setFont('helvetica', 'italic')
        doc.setFontSize(4.8)
        doc.setTextColor(textColor[0], textColor[1], textColor[2])
        doc.text((bill as any)._shiftLabel || 'DIRECT', innerX + 1.2, y + cardHeight - 1.8)
      }

      const billsPerPage = PDF_COLUMNS * PDF_ROWS

      printBills.forEach((bill, index) => {
        const pageIndex = Math.floor(index / billsPerPage)
        const positionInPage = index % billsPerPage

        if (positionInPage === 0) {
          if (pageIndex > 0) doc.addPage()
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(`Page No. ${pageIndex + 1}`, pageWidth - PDF_PAGE_MARGIN, pageHeight - 4, { align: 'right' })
        }

        drawBillCard(bill, positionInPage)
      })

      doc.save(`house-bills-${printYear}-${String(printMonth).padStart(2, '0')}.pdf`)
      toast.success(`Printed ${printBills.length} house bill${printBills.length > 1 ? 's' : ''} for ${getMonthLabel(parseInt(printMonth), parseInt(printYear))}`)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to export balance PDF')
    } finally {
      setExportingBalancePdf(false)
    }
  }, [exportingBalancePdf, printBills, printMonth, printYear])

  // When a house is selected for generation, default the from date to last bill.generatedDate + 1 day
  useEffect(() => {
    if (!genHouseId) return
    let cancelled = false
      ; (async () => {
        try {
          const houseId = parseInt(genHouseId)
          const billsForHouse = await billsApi.list({ houseId })
          if (cancelled) return
          if (billsForHouse && billsForHouse.length > 0) {
            const latest = billsForHouse
              .map(b => new Date(b.generatedDate))
              .filter(d => !Number.isNaN(d.getTime()))
              .sort((a, b) => b.getTime() - a.getTime())[0]
            if (latest) {
              const next = new Date(latest)
              next.setDate(next.getDate() + 1)
              setGenFromDate(formatLocalDate(next))
              return
            }
          }
          setGenFromDate(getMonthStart())
        } catch {
          setGenFromDate(getMonthStart())
        }
      })()
    return () => { cancelled = true }
  }, [genHouseId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = bills
      .filter(b => !q || b.house?.houseNo.toLowerCase().includes(q) || b.house?.area?.toLowerCase().includes(q))

    if (!q) {
      return filtered.sort((a, b) => {
        const aIsPaid = Number(a.outstandingAmount) <= 0
        const bIsPaid = Number(b.outstandingAmount) <= 0
        if (aIsPaid === bIsPaid) return 0
        return aIsPaid ? 1 : -1
      })
    }

    const exactMatches: typeof bills = []
    const partialMatches: typeof bills = []

    filtered.forEach((b) => {
      const houseNo = b.house?.houseNo.toLowerCase() || ''
      const area = (b.house?.area || '').toLowerCase()
      const q_lower = q.toLowerCase()

      if (houseNo === q_lower || area === q_lower) {
        exactMatches.push(b)
      } else if (houseNo.includes(q_lower) || area.includes(q_lower)) {
        partialMatches.push(b)
      }
    })

    const sorted = [...exactMatches, ...partialMatches].sort((a, b) => {
      const aIsPaid = Number(a.outstandingAmount) <= 0
      const bIsPaid = Number(b.outstandingAmount) <= 0
      if (aIsPaid === bIsPaid) return 0
      return aIsPaid ? 1 : -1
    })

    return sorted
  }, [bills, search])

  function openGenerate() {
    setGenerateMode('single')
    setGenHouseId('')
    setGenFromDate(getMonthStart())
    setGenToDate(formatLocalDate(new Date()))
    setGenNote('')
    setPreviewData(null)
    setGenerateOpen(true)
  }

  async function handleGenerate() {
    if (generateMode === 'single') {
      if (!genHouseId) { toast.error('Please select a house'); return }
      if (!isValidRange(genFromDate, genToDate)) { toast.error('Please choose a valid from and upto date range'); return }
    } else if (!isValidRange(genFromDate, genToDate)) {
      toast.error('Please choose a valid from and upto date range')
      return
    }

    if (generateMode === 'single') {
      if (previewData?.isDurationAlreadyCreated) {
        toast.error(
          previewData.durationAlreadyCreatedMessage ??
          'This duration bill is already created. Please create the next duration bill separately.',
        )
        return
      }

      if (previewData?.isAlreadyClosed) {
        toast.error(previewData.alreadyClosedMessage ?? 'This period is already closed.')
        return
      }

      if (!previewData || previewData.totalAmount <= 0) {
        toast.error('No delivery logs found for this period to generate a bill')
        return
      }
    }

    setSaving(true)
    try {
      const fromDate = parseDateFieldToString(genFromDate)
      const toDate = parseDateFieldToString(genToDate)

      if (generateMode === 'all') {
        const result = await billsApi.generateAll({
          date: toDate,
          fromDate,
          toDate,
          note: genNote || undefined,
        })
        if (result.generatedCount > 0) {
          toast.success(
            `Generated ${result.generatedCount} bill${result.generatedCount > 1 ? 's' : ''}. Skipped ${result.skippedCount}.`
          )
        } else {
          toast.error('No bills were generated. All houses were skipped.')
        }
      } else {
        await billsApi.generate({
          houseId: parseInt(genHouseId),
          date: toDate,
          fromDate,
          toDate,
          note: genNote || undefined,
        })
        toast.success('Bill generated successfully')
      }
      setGenerateOpen(false)
      load()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : ''
      toast.error(msg || 'Failed to generate bill')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await billsApi.delete(deleteId)
      toast.success('Bill deleted')
      setDeleteId(null)
      load()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete bill')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Bills</h1>
          <p className="mt-1 text-sm text-muted-foreground">Generate and manage monthly dairy bills</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={printMonth} onValueChange={setPrintMonth}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.slice(1).map((monthName, index) => (
                  <SelectItem key={monthName} value={String(index + 1)}>{monthName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={printYear} onValueChange={setPrintYear}>
              <SelectTrigger className="w-full sm:w-28">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={handleOpenPending}
            disabled={pendingLoading}
            className="gap-2 self-start sm:self-auto"
          >
            <AlertTriangle className="h-4 w-4" />
            {pendingLoading ? 'Loading...' : 'Pending Houses'}
          </Button>
          <Button
            variant="outline"
            onClick={handleExportBalancePdf}
            disabled={exportingBalancePdf || loading || printLoading || printBills.length === 0}
            className="gap-2 self-start sm:self-auto"
          >
            <Download className="h-4 w-4" />
            {exportingBalancePdf ? 'Printing...' : printLoading ? 'Preparing...' : 'Print Month Bills'}
          </Button>
          <Button onClick={openGenerate} className="gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" /> Generate Bill
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by house no or area..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTH_NAMES.slice(1).map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">No bills found</p>
            <p className="text-sm mt-1">Try changing filters or generate a new bill</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">House</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Period</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Total</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Pre Bal</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Total+Pre</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Generated</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, idx) => (
                  <tr key={`${b.id}-${idx}`} className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${idx === filtered.length - 1 ? 'border-b-0' : ''}`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold">{b.house?.houseNo}</p>
                        {b.house?.area && <p className="text-xs text-muted-foreground">{b.house.area}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {b.fromDate && b.toDate
                            ? `${new Date(b.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(b.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : `${MONTH_NAMES[b.month]} ${b.year}`
                          }
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">
                          ₹{Number(b.totalAmount).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-muted-foreground">
                      ₹{Number(b.previousBalance).toLocaleString('en-IN')}
                    </td>
                    {/* Total+Pre */}
                    <td className="px-4 py-3">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        ₹{(Number(b.totalAmount) + Number(b.previousBalance)).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-muted-foreground text-xs">
                      {new Date(b.generatedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewBill(b)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(b.id)}
                          className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Bill Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Bill</DialogTitle>
            <DialogDescription>
              Choose whether to generate for one house or for all houses within the selected date range.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="text-base font-semibold">Generate For</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={generateMode === 'single' ? 'default' : 'outline'}
                  onClick={() => setGenerateMode('single')}
                  disabled={saving}
                >
                  One House
                </Button>
                <Button
                  type="button"
                  variant={generateMode === 'all' ? 'default' : 'outline'}
                  onClick={() => {
                    setGenerateMode('all')
                    setGenNote('')
                    setPreviewData(null)
                  }}
                  disabled={saving}
                >
                  All Houses
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {generateMode === 'single' && (
                <div className="space-y-1.5">
                  <Label>House</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by house number or area..."
                      value={genHouseSearch}
                      onChange={(e) => setGenHouseSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {genHouseSearch && filteredGenHouses.length > 0 && (
                    <div className="mt-2 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {filteredGenHouses.map((house) => (
                          <button
                            key={house.id}
                            type="button"
                            onClick={() => {
                              setGenHouseId(String(house.id))
                              setGenHouseSearch('')
                            }}
                            className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-border/50 last:border-b-0 ${genHouseId === String(house.id) ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'}`}
                          >
                            <p className="font-semibold">House {house.houseNo}</p>
                            {house.area && <p className="text-xs text-muted-foreground">{house.area}</p>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {genHouseId && selectedGenHouse && (
                    <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-sm font-medium">House {selectedGenHouse.houseNo}</p>
                      {selectedGenHouse.area && <p className="text-xs text-muted-foreground">{selectedGenHouse.area}</p>}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <Input type="date" value={genFromDate} onChange={e => setGenFromDate(parseDateFieldToString(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Upto Date</Label>
                <Input type="date" value={genToDate} onChange={e => setGenToDate(parseDateFieldToString(e.target.value))} />
              </div>
            </div>

            {generateMode === 'single' ? (
              <div>
                <Label className="text-base font-semibold">Bill Basis</Label>
                <div className="mt-4 rounded-xl bg-muted/50 p-4 space-y-3">
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <span className="text-sm text-muted-foreground animate-pulse">Calculating preview...</span>
                    </div>
                  ) : previewData ? (
                    <>
                      {previewData.isDurationAlreadyCreated && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                          {previewData.durationAlreadyCreatedMessage ?? 'This duration bill is already created. Please create the next duration bill separately.'}
                        </div>
                      )}
                      {previewData.isAlreadyClosed && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                          {previewData.alreadyClosedMessage ?? 'This period is already closed.'}
                        </div>
                      )}
                      {/* no overwrite warning — bills are now appended instead of overwritten */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Period</span>
                        <span className="font-semibold">
                          {new Date(genFromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' '}to{' '}
                          {new Date(genToDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Deliveries Total ({previewData.logCount} logs)</span>
                        <span className="font-semibold">₹{previewData.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Previous Balance</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">₹{previewData.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                        <span className="text-base font-bold text-foreground">Grand Total</span>
                        <span className="text-lg font-bold text-primary">₹{previewData.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <span className="text-sm text-muted-foreground">Select a house to see preview</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Bills will be generated for all houses from {new Date(genFromDate).toLocaleDateString('en-IN')} to {new Date(genToDate).toLocaleDateString('en-IN')}.
                Houses with no deliveries in this range will be skipped.
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Note (Optional)</Label>
              <Textarea value={genNote} onChange={e => setGenNote(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generateDisabled}>
              {previewLoading && generateMode === 'single'
                ? 'Checking...'
                : saving
                  ? (generateMode === 'all' ? 'Generating All...' : 'Generating...')
                  : (generateMode === 'all' ? 'Generate All Bills' : 'Generate Bill')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Bill Dialog */}
      <Dialog open={!!viewBill} onOpenChange={open => !open && setViewBill(null)}>
        <DialogContent className="max-w-lg">
          {viewBill && (
            <>
              <DialogHeader>
                <DialogTitle>Bill — House {viewBill.house?.houseNo}</DialogTitle>
                <DialogDescription>
                  {viewBill.fromDate && viewBill.toDate
                    ? `${new Date(viewBill.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(viewBill.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : `${MONTH_NAMES[viewBill.month]} ${viewBill.year}`
                  }
                  {viewBill.house?.area && ` · ${viewBill.house.area}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border">
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Item</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Qty</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Rate</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewBill.items as BillItem[]).map((it, i) => (
                        <tr key={`${it.name ?? 'item'}-${i}`} className="border-t border-border/60">
                          <td className="px-4 py-2.5">{cleanItemName(it.name ?? '')}</td>
                          <td className="px-4 py-2.5 text-right">{it.qty}</td>
                          <td className="px-4 py-2.5 text-right">₹{it.rate}</td>
                          <td className="px-4 py-2.5 text-right font-medium">₹{it.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 rounded-xl bg-muted/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">This Month Total</span>
                    <span className="font-semibold">₹{Number(viewBill.totalAmount).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Previous Balance</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">₹{Number(viewBill.previousBalance).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-1">
                    <span>Grand Total</span>
                    <span className="text-primary">₹{(Number(viewBill.totalAmount) + Number(viewBill.previousBalance)).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm text-yellow-400">
                    <span>Pending Amount</span>
                    <span className="font-semibold">
                      {formatCurrency(
                        Number(viewBill.outstandingAmount) + Number(viewBill.previousBalance)
                      )}
                    </span>
                  </div>
                  {viewBill.outstandingAmount != null && (
                    <div className={`flex justify-between text-sm border-t border-border pt-2 mt-1 ${Number(viewBill.outstandingAmount) <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      <span className="font-medium">{Number(viewBill.outstandingAmount) <= 0 ? 'Status' : 'Outstanding Amount'}</span>
                      <span className="font-bold">
                        {Number(viewBill.outstandingAmount) <= 0 ? '✓ Fully Paid' : `₹${Number(viewBill.outstandingAmount).toLocaleString('en-IN')} remaining`}
                      </span>
                    </div>
                  )}
                </div>
                {viewBill.note && (
                  <div className="text-sm text-muted-foreground rounded-lg bg-muted/30 p-3">
                    <span className="font-medium">Note: </span>{viewBill.note}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setViewBill(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this bill. The balance will not be automatically reversed. Proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pending Houses Dialog */}
      <Dialog open={pendingOpen} onOpenChange={open => { if (!open) setPendingOpen(false) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Houses with Pending Balance</DialogTitle>
            <DialogDescription>
              Houses that have a previous balance outstanding
            </DialogDescription>
          </DialogHeader>
          {pendingLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <span className="text-sm">Loading...</span>
            </div>
          ) : pendingData.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Check className="h-8 w-8" />
              <p className="text-sm">No houses with pending balance</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              {(() => {
                const groups = new Map<string, typeof pendingData>()
                for (const d of pendingData) {
                  const key = d.shift === 'shop' ? 'Shop' : d.shift === 'morning' ? `Morning — ${d.supplier || 'No Supplier'}` : `Evening — ${d.supplier || 'No Supplier'}`
                  const group = groups.get(key) ?? []
                  group.push(d)
                  groups.set(key, group)
                }
                return Array.from(groups.entries()).map(([groupName, rows]) => (
                  <div key={groupName}>
                    <div className="sticky top-0 bg-muted/80 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                      {groupName}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-4 py-2 text-left font-semibold text-foreground">House</th>
                          <th className="px-4 py-2 text-right font-semibold text-foreground">Pre Bal (₹)</th>
                          <th className="px-4 py-2 text-right font-semibold text-foreground">Latest Payment (₹)</th>
                          <th className="px-4 py-2 text-right font-semibold text-foreground">Payment Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((d) => (
                          <tr key={d.houseNo} className="border-b border-border">
                            <td className="px-4 py-2 font-medium text-foreground">{d.houseNo}</td>
                            <td className="px-4 py-2 text-right text-foreground">
                              {d.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2 text-right text-foreground">
                              {d.latestPayment ? d.latestPayment.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'}
                            </td>
                            <td className="px-4 py-2 text-right text-foreground">
                              {d.latestPayment ? new Date(d.latestPayment.date).toLocaleDateString('en-IN') : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              })()}
            </div>
          )}
          <DialogFooter className="gap-2">
            {pendingData.length > 0 && (
              <Button variant="outline" onClick={handleExportPendingPdf} className="gap-2">
                <Download className="h-4 w-4" /> Export PDF
              </Button>
            )}
            <Button onClick={() => setPendingOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}