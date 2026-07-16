'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type TouchEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
    ChevronLeft,
    ChevronRight,
    Edit2,
    History,
    Maximize2,
    MapPin,
    Phone,
    Rows3,
    Plus,
    Sparkles,
    Trash2,
    Map as MapIcon,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    houseConfigApi,
    housesApi,
    deliveryLogsApi,
    productRatesApi,
    balanceApi,
    billsApi,
    type DeliveryLog,
    type ProductRate,
    type House,
    type HouseConfig,
    type PaymentHistory,
    type Bill,
    type BillItem,
    type HouseBalance,
} from '@/lib/api'
import { parseDailyAlerts, type AlertDays, type HouseAlert } from '@/lib/alerts'
import { getEvaluateByAmount } from '@/lib/supplier-settings'
import { geocodeApi } from '@/lib/api'
import { useHouseConfigs } from '@/hooks/use-house-configs'
import { db } from '@/lib/db'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { LocationRouteMap } from '../../../../components/dashboard/supplier/location-route-map'
import { getSessionAuth, getAuthHeader, type SessionAuth } from '@/lib/auth'
import { fetchApi as directFetch } from '@/lib/api-base'
import { toast } from 'sonner'

type DeliveryItemForm = {
    milkType: string
    qty: string
    amount: string
}


const defaultDeliveryItems: DeliveryItemForm[] = [
    { milkType: 'Buffalo Milk', qty: '', amount: '' },
    { milkType: 'Cow Milk', qty: '', amount: '' },
]

const DEFAULT_MAP_CENTER = { lat: 28.6139, lon: 77.2090 }

type MilkType = string

const DAYS_BY_INDEX: Array<keyof AlertDays> = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
]

function parseHouseAlerts(jsonStr: string | null | undefined): HouseAlert[] {
    return parseDailyAlerts(jsonStr)
}

function normalizeProductName(name?: string | null): string {
    return (name ?? '').trim().toLowerCase()
}

function normalizeMilkCategory(value?: string | null): 'cow' | 'buffalo' | '' {
    const text = normalizeProductName(value)
    if (text.includes('buffalo')) return 'buffalo'
    if (text.includes('cow')) return 'cow'
    return ''
}

function resolveGlobalRateMap(rates: ProductRate[]): Record<string, number> {
    const next: Record<string, number> = {}

    for (const rate of rates) {
        if (!rate.isActive) continue

        const name = normalizeProductName(rate.name)
        const parsedRate = Number(rate.rate)

        if (!name || !Number.isFinite(parsedRate) || parsedRate <= 0) continue

        next[name] = parsedRate
    }

    return next
}

function resolveHouseRate(house: House | undefined, milkType: MilkType): number {
    if (!house) return 0

    const selectedCategory = normalizeMilkCategory(milkType)
    if (!selectedCategory) return 0

    const configured = [
        { type: normalizeMilkCategory(house.rate1Type), rate: Number(house.rate1 ?? 0) },
        { type: normalizeMilkCategory(house.rate2Type), rate: Number(house.rate2 ?? 0) },
    ]

    const typedMatch = configured.find((entry) =>
        entry.type === selectedCategory && Number.isFinite(entry.rate) && entry.rate > 0
    )

    if (typedMatch) return typedMatch.rate

    const fallback = selectedCategory === 'buffalo' ? Number(house.rate1 ?? 0) : Number(house.rate2 ?? 0)
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0
}

function isSameLocalDate(left: Date, right: Date): boolean {
    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate()
    )
}

function getLocalDateKey(date: Date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function parseDateKeyToLocalDate(dateKey: string): Date | null {
    const [year, month, day] = dateKey.split('-').map(Number)
    if (!year || !month || !day) return null

    const date = new Date(year, month - 1, day)
    return Number.isFinite(date.getTime()) ? date : null
}

function buildDeliveredAtForDate(selectedDate: Date): string {
    const now = new Date()
    const deliveredAt = new Date(selectedDate)
    deliveredAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0)
    return deliveredAt.toISOString()
}

function parseHouseLocation(location?: string): { lat: number; lon: number } | null {
    if (!location) return null

    const match = location.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (!match) return null

    const lat = Number(match[1])
    const lon = Number(match[2])

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null

    return { lat, lon }
}

function hasPaymentThisMonth(houseId: number, payments: PaymentHistory[]): boolean {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    return payments.some((p) => {
        const paymentHouseId = p.balance?.house?.id
        if (paymentHouseId !== houseId) return false
        const date = new Date(p.paidAt || p.createdAt)
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear
    })
}

function getHouseTotalBalance(house: House): number {
    const prev = Number(house.balance?.previousBalance ?? 0)
    const curr = Number(house.balance?.currentBalance ?? 0)
    return prev + curr
}

function getHouseBillBalance(house: House): number {
    const prev = Number(house.balance?.previousBalance ?? 0);
    return prev
}

function updateAllocatedProductsOptimistically(
    houseId: number,
    items: Array<{ milkType: string; qty: number }>,
    setAllocatedHouseProducts: React.Dispatch<React.SetStateAction<Record<number, string>>>,
    setSelectedDateProductTotals: React.Dispatch<React.SetStateAction<Array<{ productName: string; qty: number }>>>,
) {
    setAllocatedHouseProducts((prev) => {
        const grouped = new Map<string, number>()
        for (const item of items) {
            const name = item.milkType.trim()
            if (!name || !item.qty) continue
            grouped.set(name, (grouped.get(name) ?? 0) + item.qty)
        }
        const formatted = Array.from(grouped.entries())
            .filter(([, qty]) => qty > 0)
            .map(([name, qty]) => `${name} ${qty}L`)
            .join(', ')
        return { ...prev, [houseId]: formatted }
    })

    setSelectedDateProductTotals((prev) => {
        const map = new Map(prev.map((p) => [p.productName, p.qty]))
        for (const item of items) {
            const name = item.milkType.trim()
            if (!name || !item.qty) continue
            map.set(name, (map.get(name) ?? 0) + item.qty)
        }
        return Array.from(map.entries())
            .filter(([, qty]) => qty > 0)
            .map(([productName, qty]) => ({ productName, qty }))
            .sort((a, b) => b.qty - a.qty)
    })
}

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

type MonthlyProductSummary = {
    product: string
    months: { month: number; year: number; quantity: number }[]
    totalQuantity: number
}

type DeliveryEditForm = {
    items: Array<{ milkType: string; qty: number; rate: number; amount: number }>
    note?: string
}

type PaymentSummaryRow = {
    id: number
    paidAt: string
    paidAmount: number
    discount: number
    note: string
}

function summaryNormalizeMilkType(value: unknown): string {
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

function summaryCleanItemName(name: string): string {
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

function summaryParseDateOnly(dateStr: string | null | undefined): Date {
    if (!dateStr) return new Date()
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return new Date(dateStr)
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
}

function summaryNormalizeRateType(value: unknown): string {
    const text = String(value ?? '').trim().toLowerCase()
    if (text.includes('buffalo')) return 'buffalo'
    if (text.includes('cow')) return 'cow'
    return text
}

function summaryGetRateByProductName(rates: ProductRate[], productName: string): number {
    const normalized = (productName || '').toLowerCase().trim()
    for (const rate of rates) {
        if ((rate.name || '').toLowerCase().trim() === normalized) {
            return Number(rate.rate)
        }
    }
    return 0
}

function summaryGetLogPeriod(logs: DeliveryLog[]): { year: number; month: number } {
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

function summaryBuildHouseDeliverySummary(logs: DeliveryLog[], year: number, month: number): HouseDeliverySummaryRow[] {
    const byDate = new Map<string, HouseDeliverySummaryRow>()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    for (const log of logs) {
        const deliveredAt = new Date(log.deliveredAt)
        if (deliveredAt.getFullYear() !== year || deliveredAt.getMonth() !== month) continue

        const dateKey = getLocalDateKey(deliveredAt)
        const existing = byDate.get(dateKey) ?? {
            dateKey,
            dayLabel: deliveredAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            productsLabel: '',
            hasDelivery: false,
            logId: undefined,
            log: undefined,
        }

        existing.hasDelivery = true
        if (!existing.logId) {
            existing.logId = log.id
            existing.log = log
        }

        const productParts = (log.items ?? []).map((item) => {
            const qty = Number(item.qty ?? 0)
            if (!qty) return null
            const milkType = summaryNormalizeMilkType(item.milkType)
            if (!milkType) return null
            return `${milkType} ${qty.toLocaleString('en-IN')}L`
        }).filter((part): part is string => Boolean(part))

        const productText = productParts.join(', ')
        existing.productsLabel = existing.productsLabel ? `${existing.productsLabel}, ${productText}` : productText || '-'

        byDate.set(dateKey, existing)
    }

    const rows: HouseDeliverySummaryRow[] = []
    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day)
        const dateKey = getLocalDateKey(date)
        const row = byDate.get(dateKey)
        rows.push(row ?? {
            dateKey,
            dayLabel: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            productsLabel: '-',
            hasDelivery: false,
            logId: undefined,
            log: undefined,
        })
    }

    return rows
}

function summaryIsValidMonth(year: number, month: number): boolean {
    return month >= 0 && month <= 11 && year > 0
}

function summaryGetPreviousMonth(year: number, month: number): { year: number; month: number } {
    return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
}

function summaryGetNextMonth(year: number, month: number): { year: number; month: number } {
    return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
}

function summaryGetErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return 'Something went wrong'
}

export default function DeliveryPage() {
    const router = useRouter()

    const [auth, setAuth] = useState<SessionAuth | null>(null)
    const [selectedShift, setSelectedShift] = useState<'morning' | 'evening' | null>(null)
    const [shiftSelectorOpen, setShiftSelectorOpen] = useState(true)

    const [houses, setHouses] = useState<House[]>([])
    const { configs: rawConfigs, loading: configsLoading } = useHouseConfigs()
    const [productRates, setProductRates] = useState<ProductRate[]>([])
    const [globalRateMap, setGlobalRateMap] = useState<Record<string, number>>({})
    const [allPayments, setAllPayments] = useState<PaymentHistory[]>([])
    const [showAmountField, setShowAmountField] = useState<boolean>(false)
    const [loading, setLoading] = useState(true)
    const [panelView, setPanelView] = useState<'delivery' | 'allocated-houses'>('delivery')
    const [houseSearch, setHouseSearch] = useState('')
    const [allocatedHouseProducts, setAllocatedHouseProducts] = useState<Record<number, string>>({})
    const [selectedDateProductTotals, setSelectedDateProductTotals] = useState<Array<{ productName: string; qty: number }>>([])
    const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())

    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
    const [datePickerValue, setDatePickerValue] = useState<string>(() => getLocalDateKey())

    // Keep the date input value in sync with the authoritative selectedDate
    useEffect(() => {
        try {
            setDatePickerValue(getLocalDateKey(selectedDate))
        } catch {
            // ignore
        }
    }, [selectedDate])

    // Read the "evaluate by amount" preference and keep it in sync across tabs
    useEffect(() => {
        const sync = () => setShowAmountField(getEvaluateByAmount())
        sync()
        window.addEventListener('storage', sync)
        return () => window.removeEventListener('storage', sync)
    }, [])

    const [currentIndex, setCurrentIndex] = useState(0)
    const [completedHouses, setCompletedHouses] = useState<Set<number>>(new Set())
    const [currentHouseLogs, setCurrentHouseLogs] = useState<DeliveryLog[]>([])
    const [houseLogsCache, setHouseLogsCache] = useState<Record<number, DeliveryLog[]>>({})
    const [loadedHouseLogIds, setLoadedHouseLogIds] = useState<Set<number>>(new Set())
    const [logsLoading, setLogsLoading] = useState(false)

    const [deliveryItems, setDeliveryItems] = useState<DeliveryItemForm[]>([...defaultDeliveryItems])
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'failed'>('idle')
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
    const [swipedDeliveryItem, setSwipedDeliveryItem] = useState<{ index: number | null; offset: number }>({
        index: null,
        offset: 0,
    })
    const swipedDeliveryItemRef = useRef<{ index: number | null; offset: number }>({
        index: null,
        offset: 0,
    })

    const navSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
    const deliveryItemSwipeStartRef = useRef<{ x: number; y: number; index: number } | null>(null)
    const houseChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const swipeCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const loadingHouseLogIdsRef = useRef<Set<number>>(new Set())
    const [houseChangeMessage, setHouseChangeMessage] = useState('')
    const [houseChangeDirection, setHouseChangeDirection] = useState<'next' | 'prev' | null>(null)
    const [swipeOffset, setSwipeOffset] = useState(0)
    const [clearTodayDialogOpen, setClearTodayDialogOpen] = useState(false)
    const [isSwiping, setIsSwiping] = useState(false)
    const [isMapExpanded, setIsMapExpanded] = useState(false)
    const [miniMapCenter, setMiniMapCenter] = useState<{ lat: number; lon: number }>(DEFAULT_MAP_CENTER)
    const [miniMapLoading, setMiniMapLoading] = useState(false)
    const [miniMapLocationWarning, setMiniMapLocationWarning] = useState<string | null>(null)
    const [highlightHouseId, setHighlightHouseId] = useState<number | null>(null)
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const highlightedRowRef = useRef<HTMLTableRowElement | null>(null)
    const pageContainerRef = useRef<HTMLDivElement | null>(null)
    const [availableHeight, setAvailableHeight] = useState<number | null>(null)
    const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
    const [historyLogs, setHistoryLogs] = useState<DeliveryLog[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)

    const [summaryOpen, setSummaryOpen] = useState(false)
    const [summaryHouse, setSummaryHouse] = useState<House | null>(null)
    const [summaryLogs, setSummaryLogs] = useState<DeliveryLog[]>([])
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryBills, setSummaryBills] = useState<Bill[]>([])
    const [summaryProductRates, setSummaryProductRates] = useState<ProductRate[]>([])
    const [summaryPeriod, setSummaryPeriod] = useState<{ year: number; month: number }>(() => {
        const now = new Date()
        return { year: now.getFullYear(), month: now.getMonth() }
    })
    const [editDeliveryDialogOpen, setEditDeliveryDialogOpen] = useState(false)
    const [editingDeliveryLog, setEditingDeliveryLog] = useState<DeliveryLog | null>(null)
    const [deletingDeliveryLog, setDeletingDeliveryLog] = useState<DeliveryLog | null>(null)
    const [editDeliveryForm, setEditDeliveryForm] = useState<DeliveryEditForm>({ items: [], note: '' })
    const [editDeliverySaving, setEditDeliverySaving] = useState(false)
    const [summaryFromDate, setSummaryFromDate] = useState('')
    const [summaryToDate, setSummaryToDate] = useState('')
    const [summaryBalance, setSummaryBalance] = useState<HouseBalance | null>(null)
    const summaryRequestIdRef = useRef(0)
    const [swipeDeleteConfirmIndex, setSwipeDeleteConfirmIndex] = useState<number | null>(null)

    const containerStyle = useMemo(
        () => ({ height: availableHeight ? `${availableHeight}px` : 'calc(100dvh - 0.5rem)' }),
        [availableHeight],
    )

    const selectedDateKey = useMemo(() => getLocalDateKey(selectedDate), [selectedDate])
    const todayDateKey = getLocalDateKey()

    const activeProductRates = useMemo(
        () => productRates.filter((rate) => rate.isActive && Number(rate.rate) > 0),
        [productRates],
    )

    const productRateOptions = useMemo(
        () => activeProductRates.map((rate) => ({
            label: rate.name.trim(),
            value: rate.name.trim(),
        })),
        [activeProductRates],
    )

    const visibleHouses = useMemo(() => {
        if (houses.length === 0) return []

        const configsMap = new Map<number, HouseConfig[]>()
        const sourceConfigs = rawConfigs.length > 0 ? rawConfigs : houses.flatMap((house) => house.configs ?? [])

        for (const config of sourceConfigs) {
            const existing = configsMap.get(config.houseId) || []
            existing.push(config)
            configsMap.set(config.houseId, existing)
        }

        return houses
            .map((house) => {
                const configs = (configsMap.get(house.id) || house.configs || [])
                    .filter((config) => {
                        if (config.shift !== selectedShift) return false
                        if (selectedShift === 'morning') return config.supplierId === auth?.uuid
                        return true
                    })
                    .sort((a, b) => a.position - b.position)

                return {
                    ...house,
                    configs,
                    routePosition: configs[0]?.position ?? Number.POSITIVE_INFINITY,
                }
            })
            .filter((house) => house.configs.length > 0 && house.active)
            .sort((left, right) => left.routePosition - right.routePosition)
    }, [houses, rawConfigs, selectedShift, auth?.uuid])

    // AUTH
    useEffect(() => {
        const session = getSessionAuth()
        if (!session?.token || session.role !== 'supplier') {
            router.replace('/')
            return
        }
        setAuth(session)
    }, [])

    // RESTORE PROGRESS WHEN SHIFT IS SELECTED
    const hasInitiallyRestored = useRef(false)
    useEffect(() => {
        if (selectedShift && !hasInitiallyRestored.current) {
            hasInitiallyRestored.current = true
            setCurrentIndex(0)
            setShiftSelectorOpen(false)
        }
    }, [selectedShift])

    useEffect(() => {
        const updateHeight = () => {
            const topOffset = pageContainerRef.current?.getBoundingClientRect().top ?? 0
            const nextHeight = Math.max(320, Math.floor(window.innerHeight - topOffset - 8))
            setAvailableHeight(nextHeight)
        }

        updateHeight()
        window.addEventListener('resize', updateHeight)
        window.addEventListener('orientationchange', updateHeight)
        window.visualViewport?.addEventListener('resize', updateHeight)

        return () => {
            window.removeEventListener('resize', updateHeight)
            window.removeEventListener('orientationchange', updateHeight)
            window.visualViewport?.removeEventListener('resize', updateHeight)
        }
    }, [])

    // LOAD HOUSES
    const loadHouses = useCallback(async (resetIndex = true) => {
        if (!auth || !selectedShift) return

        try {
            setLoading(true)

            const [data, rates, payments] = await Promise.all([
                housesApi.list(),
                productRatesApi.list(),
                balanceApi.allPayments(),
            ])

            setProductRates(rates)
            setGlobalRateMap(resolveGlobalRateMap(rates))
            setAllPayments(payments)
            setDeliveryItems((prev) => {
                const defaultProduct = rates.find((rate) => rate.isActive && Number(rate.rate) > 0)?.name.trim() ?? ''
                return prev.map((item) => (item.milkType ? item : { ...item, milkType: defaultProduct }))
            })
            // Hide deactivated houses from supplier views
            setHouses(data.filter((h) => h.active))
            if (resetIndex) {
                setCurrentIndex(0)
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }, [auth, selectedShift, selectedDateKey])

    const initialLoadDone = useRef(false)
    useEffect(() => {
        if (!initialLoadDone.current && selectedShift) {
            initialLoadDone.current = true
            loadHouses(true)
        }
    }, [loadHouses, selectedShift])

    useEffect(() => {
        if (initialLoadDone.current && selectedShift) {
            loadHouses(true)
        }
    }, [selectedShift, loadHouses])

    const currentHouse = visibleHouses[currentIndex]

    useEffect(() => {
        if (visibleHouses.length > 0 && currentIndex >= visibleHouses.length) {
            setCurrentIndex(Math.min(currentIndex, visibleHouses.length - 1))
        }
    }, [currentIndex, visibleHouses.length])

    useEffect(() => {
        if (!currentHouse) return

        let active = true
        const rawLocation = currentHouse.location?.trim() ?? ''
        const storedLocation = parseHouseLocation(currentHouse.location)
        const query = `${currentHouse.houseNo}${currentHouse.area ? `, ${currentHouse.area}` : ''}`.trim()

        if (storedLocation) {
            setMiniMapCenter(storedLocation)
            setMiniMapLocationWarning(null)
            setMiniMapLoading(false)
            return
        }

        setMiniMapLocationWarning(
            rawLocation ? null : 'Location not set for this house yet.'
        )

        const loadMiniMap = async () => {
            setMiniMapLoading(true)
            try {
                const result = await geocodeApi.search(query)
                if (!active || result.length === 0) {
                    setMiniMapCenter(DEFAULT_MAP_CENTER)
                    return
                }

                const { lat, lon } = result[0]
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    setMiniMapCenter(DEFAULT_MAP_CENTER)
                    return
                }

                setMiniMapCenter({ lat, lon })
            } catch {
                if (active) setMiniMapCenter(DEFAULT_MAP_CENTER)
            } finally {
                if (active) setMiniMapLoading(false)
            }
        }

        void loadMiniMap()

        return () => {
            active = false
        }
    }, [currentHouse?.id, currentHouse?.location])

    const handleLocationSaved = useCallback(
        (coords: { latitude: number; longitude: number }) => {
            if (!currentHouse) return

            const location = `${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`
            setMiniMapCenter({ lat: coords.latitude, lon: coords.longitude })

            setHouses((prev) =>
                prev.map((house) =>
                    house.id === currentHouse.id
                        ? {
                            ...house,
                            location,
                        }
                        : house,
                ),
            )
        },
        [currentHouse],
    )

    const miniMapEmbedUrl = useMemo(() => {
        const delta = 0.0075
        const left = miniMapCenter.lon - delta
        const right = miniMapCenter.lon + delta
        const top = miniMapCenter.lat + delta
        const bottom = miniMapCenter.lat - delta

        return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${miniMapCenter.lat}%2C${miniMapCenter.lon}`
    }, [miniMapCenter])

    const searchedAllocatedHouses = useMemo(() => {
        const query = houseSearch.trim().toLowerCase()

        return visibleHouses
            .map((house, index) => ({
                house,
                routeNumber: index + 1,
            }))
            .filter(({ house }) => {
                if (!query) return true

                const configAlerts = parseHouseAlerts(house.configs?.[0]?.dailyAlerts)
                const selectedDayKey = DAYS_BY_INDEX[selectedDate.getDay()]
                const alertText = configAlerts
                    .filter((alert) => alert.schedule?.[selectedDayKey])
                    .map((alert) => alert.text.trim())
                    .filter(Boolean)
                    .join(', ')

                const searchable = [
                    house.houseNo ?? '',
                    house.area ?? '',
                    house.phoneNo ?? '',
                    allocatedHouseProducts[house.id] ?? '',
                    alertText,
                ]

                return searchable.some((value) => value && value.toLowerCase().includes(query))
            })
    }, [visibleHouses, houseSearch, allocatedHouseProducts])

    const loadSelectedDateDeliveredSummary = useCallback(async () => {
        if (!auth || !selectedShift) return

        const logs = await deliveryLogsApi.list({ shift: selectedShift }, true) // Force fresh on load
        const deliveredForSelectedDate = logs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), selectedDate))

        // Only count server-confirmed logs (positive IDs) for completed status.
        // TempLogs (negative IDs) are local-only and should not show "delivered"
        // until the server confirms them.
        const serverLogs = deliveredForSelectedDate.filter((log) => log.id > 0)

        const nextProducts: Record<number, Map<string, number>> = {}
        const overallProducts = new Map<string, number>()
        const nextCompleted = new Set<number>()

        for (const log of serverLogs) {
            nextCompleted.add(log.houseId)
        }

        for (const log of deliveredForSelectedDate) {
            if (!nextProducts[log.houseId]) {
                nextProducts[log.houseId] = new Map<string, number>()
            }

            for (const item of log.items) {
                const productName = item.milkType.trim()
                if (!productName) continue

                const currentQty = nextProducts[log.houseId].get(productName) ?? 0
                const qty = Number(item.qty || 0)

                nextProducts[log.houseId].set(productName, currentQty + qty)
                overallProducts.set(productName, (overallProducts.get(productName) ?? 0) + qty)
            }
        }

        const resolvedProducts: Record<number, string> = {}
        for (const [houseId, products] of Object.entries(nextProducts)) {
            const formattedProducts = Array.from(products.entries())
                .filter(([, qty]) => qty > 0)
                .map(([productName, qty]) => `${productName} ${qty}L`)

            resolvedProducts[Number(houseId)] = formattedProducts.join(', ')
        }

        setAllocatedHouseProducts(resolvedProducts)
        setSelectedDateProductTotals(
            Array.from(overallProducts.entries())
                .filter(([, qty]) => qty > 0)
                .map(([productName, qty]) => ({ productName, qty }))
                .sort((left, right) => right.qty - left.qty),
        )
        setCompletedHouses(nextCompleted)
    }, [auth, selectedShift, selectedDate])

    const handlePanelViewChange = useCallback(
        (nextView: 'delivery' | 'allocated-houses') => {
            setPanelView(nextView)

            if (nextView !== 'allocated-houses') return

            setSelectedDateProductTotals([])
            setAllocatedHouseProducts({})
            void loadSelectedDateDeliveredSummary()
        },
        [loadSelectedDateDeliveredSummary],
    )

    useEffect(() => {
        if (!auth || !selectedShift) return

        let active = true

        const loadDeliveredProducts = async () => {
            try {
                await loadSelectedDateDeliveredSummary()

                if (!active) return
            } catch (error) {
                if (active) toast.error(error instanceof Error ? error.message : String(error))
            }
        }

        loadDeliveredProducts()

        return () => {
            active = false
        }
    }, [auth, selectedShift, loadSelectedDateDeliveredSummary])

    useEffect(() => {
        setCompletedHouses(new Set())
        setAllocatedHouseProducts({})
        setSelectedDateProductTotals([])
        setCurrentHouseLogs([])
        setHouseLogsCache({})
        setLoadedHouseLogIds(new Set())
        // Clear queryCache so fresh logs are fetched from server for new date
        void db.queryCache.where('key').startsWith('GET:/delivery-logs').delete()
        void loadSelectedDateDeliveredSummary()
    }, [selectedDateKey, selectedShift, loadSelectedDateDeliveredSummary])

    const buildDeliveryItemsFromLogs = useCallback((logs: DeliveryLog[]): DeliveryItemForm[] => {
        if (logs.length === 0) return [...defaultDeliveryItems]

        const grouped = new Map<string, number>()

        for (const log of logs) {
            for (const item of log.items) {
                const milkType = String(item.milkType ?? '').trim()
                if (!milkType) continue
                grouped.set(milkType, (grouped.get(milkType) ?? 0) + Number(item.qty || 0))
            }
        }

        const nextItems = Array.from(grouped.entries()).map(([milkType, qty]) => ({
            milkType,
            qty: String(qty),
            amount: '',
        }))

        return nextItems.length > 0 ? nextItems : [...defaultDeliveryItems]
    }, [])

    const preloadHouseLogs = useCallback(async (houseId: number) => {
        if (!selectedShift) return
        if (loadedHouseLogIds.has(houseId)) return
        if (loadingHouseLogIdsRef.current.has(houseId)) return

        loadingHouseLogIdsRef.current.add(houseId)
        try {
            const logs = await deliveryLogsApi.list({
                houseId,
                shift: selectedShift,
            }, true) // Force fresh from server on page load

            const selectedDateLogs = logs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), selectedDate))

            setHouseLogsCache((prev) => ({
                ...prev,
                [houseId]: selectedDateLogs,
            }))
            setLoadedHouseLogIds((prev) => new Set([...prev, houseId]))
        } catch {
            // Keep swipe smooth even if a neighbor preload fails.
        } finally {
            loadingHouseLogIdsRef.current.delete(houseId)
        }
    }, [selectedShift, loadedHouseLogIds, selectedDate])

    useEffect(() => {
        if (!currentHouse || !selectedShift) {
            setCurrentHouseLogs([])
            return
        }

        const cachedLogs = houseLogsCache[currentHouse.id]
        if (cachedLogs) {
            setCurrentHouseLogs(cachedLogs)
            setLogsLoading(false)
            return
        }

        let active = true

        const loadCurrentHouseLogs = async () => {
            try {
                setLogsLoading(true)
                const logs = await deliveryLogsApi.list({
                    houseId: currentHouse.id,
                    shift: selectedShift,
                }, true) // Force fresh from server on page load

                const selectedDateLogs = logs.filter((log) => {
                    const deliveredAt = new Date(log.deliveredAt)
                    return isSameLocalDate(deliveredAt, selectedDate)
                })

                if (!active) return

                setCurrentHouseLogs(selectedDateLogs)
                setHouseLogsCache((prev) => ({
                    ...prev,
                    [currentHouse.id]: selectedDateLogs,
                }))
                setLoadedHouseLogIds((prev) => new Set([...prev, currentHouse.id]))
            } catch (err) {
                if (active) toast.error(err instanceof Error ? err.message : String(err))
            } finally {
                if (active) setLogsLoading(false)
            }
        }

        loadCurrentHouseLogs()

        return () => {
            active = false
        }
    }, [currentHouse?.id, selectedShift, selectedDateKey, houseLogsCache])

    // Clear today's delivered logs for current house only
    const handleClearToday = useCallback(() => {
        if (!currentHouse) {
            toast.error('No house selected')
            return
        }

        if (!selectedShift) {
            toast.error('Select a shift first')
            return
        }

        setClearTodayDialogOpen(true)
    }, [currentHouse, selectedShift])

    const confirmClearToday = useCallback(async () => {
        if (!currentHouse || !selectedShift) return

        const canModify = auth?.permissions?.canModifyDeliveryLogs === true
        if (!canModify) {
            toast.error('You do not have permission to modify delivery logs')
            setClearTodayDialogOpen(false)
            return
        }

        const toDelete = currentHouseLogs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), selectedDate))

        if (toDelete.length === 0) {
            toast.info('No delivery items found for selected date')
            setClearTodayDialogOpen(false)
            return
        }

        // Update local state immediately
        setCurrentHouseLogs([])
        setCompletedHouses((prev) => {
            const next = new Set(prev)
            next.delete(currentHouse.id)
            return next
        })
        setAllocatedHouseProducts((prev) => {
            const next = { ...prev }
            delete next[currentHouse.id]
            return next
        })
        setDeliveryItems([...defaultDeliveryItems])

        const deletedProducts = new Map<string, number>()
        for (const log of toDelete) {
            for (const item of log.items) {
                const name = item.milkType.trim()
                if (!name) continue
                deletedProducts.set(name, (deletedProducts.get(name) ?? 0) + Number(item.qty || 0))
            }
        }
        setSelectedDateProductTotals((prev) => {
            const map = new Map(prev.map((p) => [p.productName, p.qty]))
            for (const [name, qty] of deletedProducts) {
                const current = map.get(name) ?? 0
                const remaining = current - qty
                if (remaining <= 0) map.delete(name)
                else map.set(name, remaining)
            }
            return Array.from(map.entries())
                .map(([productName, qty]) => ({ productName, qty }))
                .sort((a, b) => b.qty - a.qty)
        })

        // Delete from server first, THEN clear cache so re-fetch gets empty result
        await Promise.all(toDelete.map((log) => deliveryLogsApi.delete(log.id)))

        setHouseLogsCache((prev) => {
            const next = { ...prev }
            delete next[currentHouse.id]
            return next
        })
        setLoadedHouseLogIds((prev) => {
            const next = new Set(prev)
            next.delete(currentHouse.id)
            return next
        })

        toast.success(`Deleted ${toDelete.length} delivery log(s) from selected date`)
        setClearTodayDialogOpen(false)
    }, [currentHouse, currentHouseLogs, selectedShift, selectedDate])

    const handleOpenHistory = useCallback(async () => {
        if (!currentHouse) return
        setHistoryDialogOpen(true)
        setHistoryLoading(true)
        try {
            const logs = await deliveryLogsApi.list({ houseId: currentHouse.id })
            const sorted = logs.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime())
            if (sorted.length === 0) {
                setHistoryLogs([])
                return
            }
            const latestDate = new Date(sorted[0].deliveredAt)
            const latestDayStr = latestDate.toDateString()
            setHistoryLogs(sorted.filter((log) => new Date(log.deliveredAt).toDateString() === latestDayStr))
        } catch {
            toast.error('Failed to load delivery history')
        } finally {
            setHistoryLoading(false)
        }
    }, [currentHouse])

    const summaryFilteredSummaryLogs = useMemo(() => {
        if (!summaryFromDate || !summaryToDate) return summaryLogs
        const from = new Date(summaryFromDate)
        const to = new Date(summaryToDate)
        to.setHours(23, 59, 59, 999)
        return summaryLogs.filter(log => {
            const d = new Date(log.deliveredAt)
            return d >= from && d <= to
        })
    }, [summaryLogs, summaryFromDate, summaryToDate])

    const summarySummaryRows = useMemo(() => {
        if (!summaryHouse) return []
        return summaryBuildHouseDeliverySummary(summaryFilteredSummaryLogs, summaryPeriod.year, summaryPeriod.month)
    }, [summaryHouse, summaryFilteredSummaryLogs, summaryPeriod])

    const summaryPaymentSummaryRows = useMemo<PaymentSummaryRow[]>(() => {
        if (!summaryHouse) return []

        const allPaymentsList = [...(summaryBalance?.payments ?? [])].sort(
            (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        )

        const payments = allPaymentsList.filter((payment) => {
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
                note: payment.note ?? '',
            }
        })
    }, [summaryBalance, summaryHouse, summaryPeriod])

    const summaryHasDateRangeFilter = summaryFromDate !== '' && summaryToDate !== ''

    const summaryDisplaySummaryRows = useMemo(() => {
        if (!summaryHasDateRangeFilter) return summarySummaryRows
        const from = new Date(summaryFromDate)
        const to = new Date(summaryToDate)
        to.setHours(23, 59, 59, 999)
        return summarySummaryRows.filter(row => {
            const d = new Date(row.dateKey)
            return d >= from && d <= to
        })
    }, [summarySummaryRows, summaryFromDate, summaryToDate, summaryHasDateRangeFilter])

    const summaryMatchingBills = useMemo(() => {
        const monthStart = new Date(summaryPeriod.year, summaryPeriod.month, 1)
        const monthEnd = new Date(summaryPeriod.year, summaryPeriod.month + 1, 1)
        return summaryBills.filter(b => {
            const bFrom = new Date(b.fromDate ?? `${b.year}-${String(b.month).padStart(2, '0')}-01`)
            const bTo = new Date(b.toDate ?? `${b.year}-${String(b.month).padStart(2, '0')}-28`)
            return bFrom < monthEnd && bTo > monthStart
        })
    }, [summaryBills, summaryPeriod])

    const summaryMonthlyProductSummary = useMemo(() => {
        if (!summaryHouse) return []

        const allMonthLogs = summaryFilteredSummaryLogs.filter(log => {
            const d = new Date(log.deliveredAt)
            return d.getFullYear() === summaryPeriod.year && d.getMonth() === summaryPeriod.month
        })

        const totalMap = new Map<string, number>()
        for (const log of allMonthLogs) {
            for (const item of log.items ?? []) {
                const product = summaryNormalizeMilkType(item.milkType)
                const qty = Number(item.qty ?? 0)
                if (product && qty > 0) {
                    totalMap.set(product, (totalMap.get(product) ?? 0) + qty)
                }
            }
        }

        for (const bill of summaryMatchingBills) {
            if (bill.items?.length) {
                const items = bill.items as Array<{ name?: string; qty: number; rate: number; amount: number }>
                for (const item of items) {
                    if (item.name && item.qty > 0) {
                        const product = summaryCleanItemName(item.name)
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
    }, [summaryHouse, summaryFilteredSummaryLogs, summaryPeriod, summaryMatchingBills])

    const summaryPdfMonthlyProductSummary = useMemo(() => {
        if (!summaryHouse) return []

        const allMonthLogs = summaryFilteredSummaryLogs.filter(log => {
            const d = new Date(log.deliveredAt)
            return d.getFullYear() === summaryPeriod.year && d.getMonth() === summaryPeriod.month
        })

        const totalMap = new Map<string, { qty: number; amount: number }>()
        for (const log of allMonthLogs) {
            for (const item of log.items ?? []) {
                const product = summaryNormalizeMilkType(item.milkType)
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
    }, [summaryHouse, summaryFilteredSummaryLogs, summaryPeriod])

    const summaryTotals = useMemo(() => {
        if (!summaryHouse) return { productTotals: [] as Array<{ product: string; quantity: number; amount: number }>, grandTotal: 0, previousBalance: 0, pendingTotal: 0 }

        const allMonthLogs = summaryFilteredSummaryLogs.filter(log => {
            const d = new Date(log.deliveredAt)
            return d.getFullYear() === summaryPeriod.year && d.getMonth() === summaryPeriod.month
        })

        const totalMap = new Map<string, { qty: number; amount: number }>()
        let allLogsGrandTotal = 0
        for (const log of allMonthLogs) {
            allLogsGrandTotal += Number(log.totalAmount ?? 0)
            for (const item of log.items ?? []) {
                const product = summaryNormalizeMilkType(item.milkType)
                const qty = Number(item.qty ?? 0)
                const amount = Number(item.amount ?? 0)
                if (product && qty > 0) {
                    const existing = totalMap.get(product) ?? { qty: 0, amount: 0 }
                    totalMap.set(product, { qty: existing.qty + qty, amount: existing.amount + amount })
                }
            }
        }

        for (const bill of summaryMatchingBills) {
            const billItems = (bill.items as Array<{ name?: string; qty: number; rate: number; amount: number }>) ?? []
            for (const item of billItems) {
                if (item.name && item.qty > 0) {
                    const product = summaryCleanItemName(item.name)
                    const existing = totalMap.get(product) ?? { qty: 0, amount: 0 }
                    totalMap.set(product, {
                        qty: Math.max(0, existing.qty - item.qty),
                        amount: Math.max(0, existing.amount - item.amount),
                    })
                }
            }
        }

        const billsTotalAmount = summaryMatchingBills.reduce((sum, b) => sum + Number(b.totalAmount), 0)
        const pendingGrandTotal = allLogsGrandTotal - billsTotalAmount
        const pendingTotal = Array.from(totalMap.values()).reduce((sum, d) => sum + d.amount, 0)

        return {
            productTotals: Array.from(totalMap.entries())
                .filter(([, data]) => data.qty > 0)
                .map(([product, data]) => ({ product, quantity: data.qty, amount: data.amount })),
            grandTotal: summaryMatchingBills.length > 0 ? billsTotalAmount + Math.max(0, pendingGrandTotal) : allLogsGrandTotal,
            previousBalance: summaryMatchingBills.length > 0 ? Number(summaryMatchingBills[0].previousBalance ?? 0) : Number(summaryBalance?.previousBalance ?? 0),
            pendingTotal,
        }
    }, [summaryHouse, summaryFilteredSummaryLogs, summaryPeriod, summaryMatchingBills, summaryBalance])

    const summaryEditDeliveryTotal = useMemo(() => {
        return (editDeliveryForm.items || []).reduce((sum, it) => sum + Number(it?.amount ?? 0), 0)
    }, [editDeliveryForm.items])

    async function handleOpenSummary() {
        if (!currentHouse) return
        const requestId = summaryRequestIdRef.current + 1
        summaryRequestIdRef.current = requestId

        setSummaryHouse(currentHouse)
        setSummaryLogs([])
        setSummaryBills([])
        setSummaryProductRates([])
        setSummaryBalance(null)
        setSummaryFromDate('')
        setSummaryToDate('')
        setDeletingDeliveryLog(null)
        setEditDeliveryDialogOpen(false)
        setSummaryOpen(true)
        setSummaryLoading(true)

        try {
            const [freshHouse, logs, bills, rates, balance] = await Promise.all([
                housesApi.get(currentHouse.id),
                deliveryLogsApi.list({ houseId: currentHouse.id }, true),
                billsApi.list({ houseId: currentHouse.id }),
                productRatesApi.list(),
                balanceApi.get(currentHouse.id),
            ])
            if (summaryRequestIdRef.current !== requestId) return
            setSummaryHouse(freshHouse)
            setSummaryLogs(logs)
            setSummaryBills(bills)
            setSummaryProductRates(rates.filter((rate) => rate.isActive && Number(rate.rate) > 0))
            setSummaryBalance(balance)
            setSummaryPeriod(summaryGetLogPeriod(logs))
        } catch (error: unknown) {
            if (summaryRequestIdRef.current === requestId) {
                toast.error(summaryGetErrorMessage(error))
            }
        } finally {
            if (summaryRequestIdRef.current === requestId) {
                setSummaryLoading(false)
            }
        }
    }

    function summaryGetPreferredRateForHouse(milkType: string): number {
        const mt = summaryNormalizeRateType(milkType)
        if (summaryHouse) {
            const r1Type = summaryNormalizeRateType(summaryHouse.rate1Type)
            const r2Type = summaryNormalizeRateType(summaryHouse.rate2Type)
            if (r1Type && r1Type === mt && Number(summaryHouse.rate1) > 0) return Number(summaryHouse.rate1)
            if (r2Type && r2Type === mt && Number(summaryHouse.rate2) > 0) return Number(summaryHouse.rate2)
        }
        return summaryGetRateByProductName(summaryProductRates, milkType)
    }

    function summaryGetBillForDateKey(dateKey: string): Bill | undefined {
        const [yearStr, monthStr] = dateKey.split('-')
        const month = parseInt(monthStr)
        const year = parseInt(yearStr)
        return summaryBills.find((bill) => bill.month === month && bill.year === year)
    }

    function summaryIsDeliveryBlockedByBill(dateKey: string): boolean {
        const bill = summaryGetBillForDateKey(dateKey)
        if (!bill) return false

        const [y, m, d] = dateKey.split('-').map(Number)
        const deliveryTs = new Date(y, m - 1, d).getTime()

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

        return true
    }

    function summaryOpenEditDeliveryDialog(row: HouseDeliverySummaryRow) {
        if (summaryIsDeliveryBlockedByBill(row.dateKey) || Boolean(row.log?.billGenerated)) {
            toast.error('Cannot edit deliveries that were included in a generated bill')
            return
        }

        if (row.log) {
            setEditingDeliveryLog(row.log)
            const normalized = (row.log.items ?? []).map((item) => {
                const milkType = summaryNormalizeMilkType(item.milkType)
                const qty = Number(item.qty ?? 0)
                const rate = summaryGetPreferredRateForHouse(milkType)
                return { milkType, qty, rate, amount: qty * rate }
            })
            setEditDeliveryForm({ items: normalized, note: row.log.note })
        } else {
            const [year, month, day] = row.dateKey.split('-').map(Number)
            const deliveryDate = new Date(year, month - 1, day)
            const newLog: DeliveryLog = {
                id: 0,
                houseId: summaryHouse?.id ?? 0,
                deliveredAt: deliveryDate.toISOString(),
                createdAt: new Date().toISOString(),
                shift: (summaryHouse?.configs?.[0]?.shift ?? 'morning') as 'morning' | 'evening' | 'shop',
                items: [],
                billGenerated: false,
                isClosed: false,
                totalAmount: '0',
                openingBalance: '0',
                closingBalance: '0',
                note: '',
            }
            setEditingDeliveryLog(newLog)
            setEditDeliveryForm({ items: [], note: '' })
        }
        setEditDeliveryDialogOpen(true)
    }

    async function handleSaveDeliveryEdit() {
        if (!editingDeliveryLog || !summaryHouse) return

        setEditDeliverySaving(true)
        try {
            const isNewDelivery = editingDeliveryLog.id === 0

            if (isNewDelivery) {
                await deliveryLogsApi.create({
                    houseId: summaryHouse.id,
                    shift: editingDeliveryLog.shift as 'morning' | 'evening' | 'shop',
                    items: editDeliveryForm.items,
                    note: editDeliveryForm.note,
                    deliveredAt: editingDeliveryLog.deliveredAt,
                })
                toast.success('Delivery created successfully')
            } else {
                await deliveryLogsApi.update(editingDeliveryLog.id, {
                    items: editDeliveryForm.items,
                    note: editDeliveryForm.note,
                })
                toast.success('Delivery updated successfully')
            }

            const logs = await deliveryLogsApi.list({ houseId: summaryHouse.id }, true)
            setSummaryLogs(logs)

            setEditDeliveryDialogOpen(false)
            setEditingDeliveryLog(null)
            setEditDeliveryForm({ items: [], note: '' })
        } catch (error: unknown) {
            toast.error(summaryGetErrorMessage(error))
        } finally {
            setEditDeliverySaving(false)
        }
    }

    async function handleDeleteDeliveryLog() {
        if (!deletingDeliveryLog || !summaryHouse) return
        const deleteDateKey = deletingDeliveryLog.deliveredAt ? new Date(deletingDeliveryLog.deliveredAt).toISOString().split('T')[0] : ''
        if (deleteDateKey && summaryIsDeliveryBlockedByBill(deleteDateKey)) {
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
            toast.error(summaryGetErrorMessage(error))
        } finally {
            setEditDeliverySaving(false)
        }
    }

    const handleExportSummaryPdf = useCallback(() => {
        if (!summaryHouse) return
        if (summarySummaryRows.length === 0) {
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
        doc.text(`Period: ${periodLabel}`, 14, 21)
        if (summaryHouse.area) {
            doc.text(`Area: ${summaryHouse.area}`, 14, 26)
        }

        const monthKeys = Array.from(new Set(summaryPdfMonthlyProductSummary.flatMap((row) => row.months.map((month) => `${month.year}-${String(month.month + 1).padStart(2, '0')}`)))).sort()
        const monthLabels = monthKeys.map((monthKey) => {
            const [year, month] = monthKey.split('-').map(Number)
            return `${MONTH_NAMES[month]} ${year}`
        })

        const pageWidth = doc.internal.pageSize.getWidth()
        const pageHeight = doc.internal.pageSize.getHeight()
        const left = 14
        const headerBottomY = summaryHouse.area ? 26 : 21
        const monthlyTitleY = headerBottomY + 7
        const top = monthlyTitleY + 4
        const bottom = 10
        const tableWidth = pageWidth - left - 14
        const productColWidth = monthLabels.length > 0 ? Math.max(58, Math.min(76, tableWidth * 0.36)) : tableWidth
        const monthColWidth = monthLabels.length > 0 ? (tableWidth - productColWidth) / monthLabels.length : 0
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
            text: string | string[], align: 'left' | 'right' = 'left', bold = false,
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

        let currentY = top
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(17, 24, 39)
        doc.text('Monthly Product Summary', 14, monthlyTitleY)

        drawCell(left, currentY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
        monthLabels.forEach((label, index) => {
            const x = left + productColWidth + (index * monthColWidth)
            drawCell(x, currentY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
        })
        currentY += headerHeight

        if (summaryPdfMonthlyProductSummary.length === 0) {
            drawCell(left, currentY, tableWidth, rowHeight, 'No product data available', 'left', false)
            currentY += rowHeight
        } else {
            summaryPdfMonthlyProductSummary.forEach((row) => {
                if (currentY > pageHeight - bottom - rowHeight) {
                    doc.addPage()
                    currentY = top
                    drawCell(left, currentY, productColWidth, headerHeight, 'Product', 'left', true, [17, 24, 39], [255, 255, 255])
                    monthLabels.forEach((label, index) => {
                        const x = left + productColWidth + (index * monthColWidth)
                        drawCell(x, currentY, monthColWidth, headerHeight, label, 'right', true, [17, 24, 39], [255, 255, 255])
                    })
                    currentY += headerHeight
                }

                const productTotal = summaryPdfMonthlyProductSummary.find((item) => item.product === row.product)
                const rowValues = monthKeys.map((monthKey) => {
                    const [year, month] = monthKey.split('-').map(Number)
                    const monthData = row.months.find((item) => item.year === year && item.month === month - 1)
                    return monthData ? `${monthData.quantity.toLocaleString('en-IN')}L - Rs ${(productTotal?.totalAmount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'
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

            const pdfTotalAmount = summaryPdfMonthlyProductSummary.reduce((sum, row) => sum + row.totalAmount, 0)
            drawCell(left, currentY, productColWidth, rowHeight, 'Total', 'left', true, [248, 250, 252])
            monthLabels.forEach((_, index) => {
                const x = left + productColWidth + (index * monthColWidth)
                drawCell(x, currentY, monthColWidth, rowHeight, `Rs ${pdfTotalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [248, 250, 252])
            })
            currentY += rowHeight

            if (summaryTotals.previousBalance > 0) {
                drawCell(left, currentY, productColWidth, rowHeight, 'Previous Balance', 'left', true, [255, 255, 255])
                monthLabels.forEach((_, index) => {
                    const x = left + productColWidth + (index * monthColWidth)
                    drawCell(x, currentY, monthColWidth, rowHeight, `Rs ${summaryTotals.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [255, 255, 255])
                })
                currentY += rowHeight

                const grandTotalWithPrev = pdfTotalAmount + summaryTotals.previousBalance
                drawCell(left, currentY, productColWidth, rowHeight, 'Grand Total', 'left', true, [255, 255, 255])
                monthLabels.forEach((_, index) => {
                    const x = left + productColWidth + (index * monthColWidth)
                    drawCell(x, currentY, monthColWidth, rowHeight, `Rs ${grandTotalWithPrev.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'right', true, [255, 255, 255])
                })
                currentY += rowHeight
            }
        }

        let deliveriesTitleY = currentY + 10
        if (deliveriesTitleY > pageHeight - 16) {
            doc.addPage()
            deliveriesTitleY = 14
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(17, 24, 39)
        doc.text('Daily Deliveries', 14, deliveriesTitleY)

        const daysLeft = summaryDisplaySummaryRows.slice(0, 15)
        const daysRight = summaryDisplaySummaryRows.slice(15)
        const splitX = 100
        const makeDeliveriesTable = (rows: HouseDeliverySummaryRow[], marginLeft: number, marginRight: number) => {
            if (rows.length === 0) return
            autoTable(doc, {
                startY: deliveriesTitleY + 4,
                head: [['Date', 'Products']],
                body: rows.map((row) => [row.dayLabel, row.hasDelivery ? row.productsLabel : '-']),
                styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
                headStyles: { fillColor: [17, 24, 39], textColor: 255 },
                columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 'auto' } },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                margin: { left: marginLeft, right: marginRight },
            })
        }
        makeDeliveriesTable(daysLeft, 14, pageWidth - splitX + 4)
        makeDeliveriesTable(daysRight, splitX, 14)

        const totalPages = doc.getNumberOfPages()
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.setTextColor(128, 128, 128)
            doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
        }

        doc.save(`house-${summaryHouse.houseNo}-summary-${summaryPeriod.year}-${String(summaryPeriod.month + 1).padStart(2, '0')}.pdf`)
    }, [summaryHouse, summaryPeriod, summarySummaryRows, summaryPdfMonthlyProductSummary, summaryTotals, summaryDisplaySummaryRows])

    // Navigate to previous day
    const handlePreviousDay = useCallback(() => {
        const newDate = new Date(selectedDate)
        newDate.setDate(newDate.getDate() - 1)
        setSelectedDate(newDate)
    }, [selectedDate])

    // Navigate to next day (up to today)
    const handleNextDay = useCallback(() => {
        const newDate = new Date(selectedDate)
        newDate.setDate(newDate.getDate() + 1)

        const today = new Date()
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        if (newDate > startOfToday) return

        setSelectedDate(newDate)
    }, [selectedDate])

    const handleDateInputChange = useCallback((value: string) => {
        const parsed = parseDateKeyToLocalDate(value)
        if (!parsed) return

        const today = new Date()
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        if (parsed > startOfToday) return

        setSelectedDate(parsed)
    }, [])

    const handleDatePickerConfirm = useCallback(() => {
        handleDateInputChange(datePickerValue)
        setIsDatePickerOpen(false)
    }, [datePickerValue, handleDateInputChange])

    // Open house in delivery view
    const handleOpenHouseInDelivery = useCallback(
        (houseId: number) => {
            const houseIndex = visibleHouses.findIndex((h) => h.id === houseId)
            if (houseIndex >= 0) {
                setCurrentIndex(houseIndex)
                setPanelView('delivery')
            }
        },
        [visibleHouses],
    )

    useEffect(() => {
        if (!selectedShift || visibleHouses.length === 0) return

        const previous = currentIndex > 0 ? visibleHouses[currentIndex - 1] : null
        const next = currentIndex < visibleHouses.length - 1 ? visibleHouses[currentIndex + 1] : null

        if (previous) {
            void preloadHouseLogs(previous.id)
        }

        if (next) {
            void preloadHouseLogs(next.id)
        }
    }, [selectedShift, currentIndex, visibleHouses, preloadHouseLogs])

    useEffect(() => {
        return () => {
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
        }
    }, [])

    useEffect(() => {
        if (highlightHouseId && highlightedRowRef.current) {
            highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [highlightHouseId])

    useEffect(() => {
        setDeliveryItems(buildDeliveryItemsFromLogs(currentHouseLogs))
    }, [currentHouseLogs, buildDeliveryItemsFromLogs])

    const getEffectiveRate = (house: House | undefined, productName: string): { rate: number; source: 'house' | 'global' | 'none' } => {
        const normalizedName = normalizeProductName(productName)
        const houseRate = resolveHouseRate(house, productName as MilkType)
        if (houseRate > 0) {
            return { rate: houseRate, source: 'house' }
        }

        const globalRate = Number(globalRateMap[normalizedName] ?? 0)
        if (globalRate > 0) {
            return { rate: globalRate, source: 'global' }
        }

        return { rate: 0, source: 'none' }
    }

    // NAVIGATION HANDLERS
    const handleNext = () => {
        if (currentIndex < visibleHouses.length - 1) {
            setSwipeOffset(0)
            const nextHouse = visibleHouses[currentIndex + 1]
            setHouseChangeDirection('next')
            setHouseChangeMessage(nextHouse ? `House ${nextHouse.houseNo} loaded` : 'House changed')
            if (houseChangeTimerRef.current) {
                clearTimeout(houseChangeTimerRef.current)
            }
            houseChangeTimerRef.current = setTimeout(() => {
                setHouseChangeMessage('')
                setHouseChangeDirection(null)
            }, 1100)
            setCurrentIndex((i) => i + 1)
            resetForm()
        }
    }

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setSwipeOffset(0)
            const prevHouse = visibleHouses[currentIndex - 1]
            setHouseChangeDirection('prev')
            setHouseChangeMessage(prevHouse ? `House ${prevHouse.houseNo} loaded` : 'House changed')
            if (houseChangeTimerRef.current) {
                clearTimeout(houseChangeTimerRef.current)
            }
            houseChangeTimerRef.current = setTimeout(() => {
                setHouseChangeMessage('')
                setHouseChangeDirection(null)
            }, 1100)
            setCurrentIndex((i) => i - 1)
            resetForm()
        }
    }

    const handleJumpToNextPending = () => {
        let lastCompletedIdx = -1
        for (let i = visibleHouses.length - 1; i >= 0; i--) {
            if (completedHouses.has(visibleHouses[i].id)) {
                lastCompletedIdx = i
                break
            }
        }
        const targetIdx = lastCompletedIdx + 1
        if (targetIdx >= visibleHouses.length) {
            toast.info('All houses delivered!')
            return
        }
        if (targetIdx === currentIndex) {
            toast.info('Already on next pending house')
            return
        }
        setSwipeOffset(0)
        const targetHouse = visibleHouses[targetIdx]
        setHouseChangeDirection(targetIdx > currentIndex ? 'next' : 'prev')
        setHouseChangeMessage(`Jumped to House ${targetHouse.houseNo}`)
        if (houseChangeTimerRef.current) {
            clearTimeout(houseChangeTimerRef.current)
        }
        houseChangeTimerRef.current = setTimeout(() => {
            setHouseChangeMessage('')
            setHouseChangeDirection(null)
        }, 1100)
        setCurrentIndex(targetIdx)
        resetForm()
    }

    useEffect(() => {
        if (!houseChangeMessage) return

        if (houseChangeTimerRef.current) {
            clearTimeout(houseChangeTimerRef.current)
        }

        houseChangeTimerRef.current = setTimeout(() => {
            setHouseChangeMessage('')
            setHouseChangeDirection(null)
        }, 1100)

        return () => {
            if (houseChangeTimerRef.current) {
                clearTimeout(houseChangeTimerRef.current)
            }
        }
    }, [houseChangeMessage])

    useEffect(() => {
        return () => {
            if (swipeCommitTimerRef.current) {
                clearTimeout(swipeCommitTimerRef.current)
            }
        }
    }, [])

    const handleHouseTouchStart = (event: TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0]
        navSwipeStartRef.current = { x: touch.clientX, y: touch.clientY }
        setIsSwiping(true)
    }

    const handleHouseTouchMove = (event: TouchEvent<HTMLDivElement>) => {
        const start = navSwipeStartRef.current
        if (!start) return

        const touch = event.touches[0]
        const deltaX = touch.clientX - start.x
        const deltaY = touch.clientY - start.y

        if (Math.abs(deltaY) > Math.abs(deltaX)) return

        const panelWidth = pageContainerRef.current?.clientWidth ?? window.innerWidth
        const maxOffset = Math.max(160, Math.floor(panelWidth * 0.9))
        const nextOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaX))
        setSwipeOffset(nextOffset)
    }

    const handleHouseTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
        const start = navSwipeStartRef.current
        navSwipeStartRef.current = null
        setIsSwiping(false)
        if (!start) {
            setSwipeOffset(0)
            return
        }

        const touch = event.changedTouches[0]
        const deltaX = touch.clientX - start.x
        const deltaY = touch.clientY - start.y
        const panelWidth = pageContainerRef.current?.clientWidth ?? window.innerWidth
        const commitThreshold = Math.max(72, Math.floor(panelWidth * 0.26))

        if (Math.abs(deltaX) < commitThreshold || Math.abs(deltaX) < Math.abs(deltaY)) {
            setSwipeOffset(0)
            return
        }

        const direction = deltaX < 0 ? 'next' : 'prev'
        setSwipeOffset(direction === 'next' ? -panelWidth : panelWidth)
        setHouseChangeDirection(direction)

        const targetHouse = direction === 'next' ? visibleHouses[currentIndex + 1] : visibleHouses[currentIndex - 1]
        setHouseChangeMessage(targetHouse ? `House ${targetHouse.houseNo} loaded` : 'House changed')

        if (swipeCommitTimerRef.current) {
            clearTimeout(swipeCommitTimerRef.current)
        }

        swipeCommitTimerRef.current = setTimeout(() => {
            if (direction === 'next' && currentIndex < visibleHouses.length - 1) {
                setCurrentIndex((index) => index + 1)
                resetForm()
            }

            if (direction === 'prev' && currentIndex > 0) {
                setCurrentIndex((index) => index - 1)
                resetForm()
            }

            setSwipeOffset(0)
            setHouseChangeDirection(null)
        }, 180)
    }

    const resetForm = () => {
        setDeliveryItems([...defaultDeliveryItems])
        setHasUnsavedChanges(false)
        setSaveStatus('idle')
    }

    useEffect(() => {
        setHasUnsavedChanges(false)
        setSaveStatus('idle')
        setLastSavedAt(null)
    }, [currentHouse?.id, selectedShift])

    // DELIVERY ITEMS
    const updateDeliveryItem = (idx: number, field: keyof DeliveryItemForm, value: string) => {
        if (field === 'qty') {
            const trimmed = value.trim()
            setDeliveryItems((prev) => {
                if (trimmed === '' && prev.length > 1) {
                    return prev.filter((_, i) => i !== idx)
                }
                return prev.map((item, i) => {
                    if (i !== idx) return item
                    const qty = value
                    const rate = getEffectiveRate(currentHouse, item.milkType).rate
                    const numQty = Number(qty)
                    const amount = numQty > 0 && rate > 0 ? String(numQty * rate) : ''
                    return { ...item, qty, amount }
                })
            })
            setHasUnsavedChanges(true)
            setSaveStatus('idle')
            return
        }

        if (field === 'amount') {
            const trimmed = value.trim()
            setDeliveryItems((prev) => {
                if (trimmed === '' && prev.length > 1) {
                    return prev.filter((_, i) => i !== idx)
                }
                return prev.map((item, i) => {
                    if (i !== idx) return item
                    const amount = value
                    const rate = getEffectiveRate(currentHouse, item.milkType).rate
                    const numAmount = Number(amount)
                    const qty = numAmount > 0 && rate > 0 ? String(Math.round((numAmount / rate) * 100) / 100) : ''
                    return { ...item, amount, qty }
                })
            })
            setHasUnsavedChanges(true)
            setSaveStatus('idle')
            return
        }

        setDeliveryItems((prev) =>
            prev.map((item, i) =>
                i === idx ? { ...item, milkType: value } : item
            )
        )
        setHasUnsavedChanges(true)
        setSaveStatus('idle')
    }

    const addItem = () => {
        setDeliveryItems((prev) => [...prev, { milkType: 'Buffalo Milk', qty: '', amount: '' }])
        setHasUnsavedChanges(true)
        setSaveStatus('idle')
    }

    const removeDeliveryItem = async (idx: number) => {
        const canModify = auth?.permissions?.canModifyDeliveryLogs === true
        const itemToRemove = deliveryItems[idx]
        const removedProductName = itemToRemove?.milkType.trim() ?? ''
        const itemsAfterDelete = deliveryItems.filter((_, i) => i !== idx)

        if (itemsAfterDelete.length === 0 && currentHouseLogs.length > 0 && selectedShift) {
            if (!canModify) {
                toast.error('You do not have permission to modify delivery logs')
                return
            }
            // Update local state immediately
            setCurrentHouseLogs([])
            setCompletedHouses((prev) => {
                const next = new Set(prev)
                next.delete(currentHouse.id)
                return next
            })
            setHouseLogsCache((prev) => {
                return {
                    ...prev,
                    [currentHouse.id]: [],
                }
            })
            setLoadedHouseLogIds((prev) => {
                const next = new Set(prev)
                next.add(currentHouse.id)
                return next
            })
            setAllocatedHouseProducts((prev) => {
                const next = { ...prev }
                delete next[currentHouse.id]
                return next
            })
            setSelectedDateProductTotals((prev) => {
                const map = new Map(prev.map((p) => [p.productName, p.qty]))
                for (const log of currentHouseLogs) {
                    for (const item of log.items) {
                        const name = item.milkType.trim()
                        if (!name) continue
                        const current = map.get(name) ?? 0
                        const remaining = current - Number(item.qty || 0)
                        if (remaining <= 0) map.delete(name)
                        else map.set(name, remaining)
                    }
                }
                return Array.from(map.entries())
                    .map(([productName, qty]) => ({ productName, qty }))
                    .sort((a, b) => b.qty - a.qty)
            })

            // Remove the matching logs from the server before continuing.
            await Promise.all(currentHouseLogs.map((log) => deliveryLogsApi.delete(log.id)))
        } else if (removedProductName && currentHouseLogs.length > 0) {
            if (!canModify) {
                toast.error('You do not have permission to modify delivery logs')
                return
            }
            const removedQty = currentHouseLogs.reduce((sum, log) => {
                return sum + log.items.reduce((itemSum, item) => {
                    if (item.milkType.trim() !== removedProductName) return itemSum
                    return itemSum + Number(item.qty || 0)
                }, 0)
            }, 0)

            const nextHouseLogs = currentHouseLogs
                .map((log) => ({
                    ...log,
                    items: log.items.filter((item) => item.milkType.trim() !== removedProductName),
                }))
                .filter((log) => log.items.length > 0)

            const persistChanges = currentHouseLogs.map(async (log) => {
                const nextItems = log.items.filter((item) => item.milkType.trim() !== removedProductName)

                if (nextItems.length === 0) {
                    await deliveryLogsApi.delete(log.id)
                    return null
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return deliveryLogsApi.update(log.id, { items: nextItems as any })
            })

            const savedLogs = (await Promise.all(persistChanges)).filter(Boolean) as DeliveryLog[]
            const resolvedNextLogs = savedLogs.length > 0 ? savedLogs : nextHouseLogs

            setCurrentHouseLogs(resolvedNextLogs)
            setHouseLogsCache((prev) => ({
                ...prev,
                [currentHouse.id]: resolvedNextLogs,
            }))
            setAllocatedHouseProducts((prev) => {
                const next = { ...prev }
                if (resolvedNextLogs.length === 0) {
                    delete next[currentHouse.id]
                } else {
                    const grouped = new Map<string, number>()
                    for (const log of resolvedNextLogs) {
                        for (const item of log.items) {
                            const name = item.milkType.trim()
                            if (!name) continue
                            grouped.set(name, (grouped.get(name) ?? 0) + Number(item.qty || 0))
                        }
                    }

                    next[currentHouse.id] = Array.from(grouped.entries())
                        .filter(([, qty]) => qty > 0)
                        .map(([name, qty]) => `${name} ${qty}L`)
                        .join(', ')
                }

                return next
            })
            setSelectedDateProductTotals((prev) => {
                const map = new Map(prev.map((p) => [p.productName, p.qty]))
                const current = map.get(removedProductName) ?? 0
                const remaining = current - removedQty
                if (remaining <= 0) map.delete(removedProductName)
                else map.set(removedProductName, remaining)

                return Array.from(map.entries())
                    .filter(([, qty]) => qty > 0)
                    .map(([productName, qty]) => ({ productName, qty }))
                    .sort((a, b) => b.qty - a.qty)
            })
        }

        setDeliveryItems((prev) => {
            if (prev.length <= 1) return [...defaultDeliveryItems]
            return prev.filter((_, i) => i !== idx)
        })
        setSwipedDeliveryItem({ index: null, offset: 0 })
        swipedDeliveryItemRef.current = { index: null, offset: 0 }
        setHasUnsavedChanges(true)
        setSaveStatus('idle')
    }

    const handleDeliveryItemTouchStart = (index: number, event: TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0]
        if (!touch) return

        setSwipedDeliveryItem((current) => (current.index === index ? current : { index: null, offset: 0 }))
        swipedDeliveryItemRef.current = { index: null, offset: 0 }
        deliveryItemSwipeStartRef.current = { x: touch.clientX, y: touch.clientY, index }
    }

    const handleDeliveryItemTouchMove = (index: number, event: TouchEvent<HTMLDivElement>) => {
        const start = deliveryItemSwipeStartRef.current
        if (!start || start.index !== index) return

        const touch = event.touches[0]
        if (!touch) return

        const deltaX = touch.clientX - start.x
        const deltaY = Math.abs(touch.clientY - start.y)

        if (deltaY > Math.abs(deltaX)) return
        if (deltaX >= 0) {
            setSwipedDeliveryItem({ index: null, offset: 0 })
            swipedDeliveryItemRef.current = { index: null, offset: 0 }
            return
        }

        const nextOffset = Math.max(deltaX, -64)
        setSwipedDeliveryItem({ index, offset: nextOffset })
        swipedDeliveryItemRef.current = { index, offset: nextOffset }
    }

    const handleDeliveryItemTouchEnd = async (index: number) => {
        const start = deliveryItemSwipeStartRef.current
        if (!start || start.index !== index) return

        const activeSwipe = swipedDeliveryItemRef.current
        const shouldDelete = activeSwipe.index === index && activeSwipe.offset <= -56
        if (shouldDelete) {
            setSwipeDeleteConfirmIndex(index)
        } else {
            setSwipedDeliveryItem({ index: null, offset: 0 })
            swipedDeliveryItemRef.current = { index: null, offset: 0 }
        }
        deliveryItemSwipeStartRef.current = null
    }

    // TOTAL CALCULATION
    const currentDeliveryTotal = deliveryItems.reduce((sum, item) => {
        const qty = Number(item.qty)
        const { rate } = getEffectiveRate(currentHouse, item.milkType)

        if (!qty || qty <= 0) return sum

        return sum + qty * rate
    }, 0)

    // MARK DELIVERED
    const handleMarkDelivered = async () => {
        if (!currentHouse) return
        if (!selectedShift) return

        const payloadItems = deliveryItems
            .map((item) => {
                const qty = Number(item.qty)
                const { rate } = getEffectiveRate(currentHouse, item.milkType)
                return {
                    milkType: item.milkType,
                    qty,
                    rate,
                    amount: qty > 0 ? qty * rate : 0,
                }
            })
            .filter((item) => item.qty > 0 && item.rate > 0)

        // Check modify permission for suppliers
        const canModify = auth?.permissions?.canModifyDeliveryLogs === true

        if (payloadItems.length === 0) {
            toast.error('Add at least one item with qty and rate before marking delivered')
            return
        }

        const now = new Date()
        const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

        if (isCompleted && currentHouseLogs.length > 0) {
            if (!canModify) {
                toast.error('You do not have permission to modify delivery logs')
                return
            }
            const primaryLog = currentHouseLogs[0]
            const duplicateIds = currentHouseLogs.slice(1).map((l) => l.id)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updatedLog = await deliveryLogsApi.update(primaryLog.id, { items: payloadItems as any })
            if (duplicateIds.length > 0) {
                await Promise.all(duplicateIds.map((id) => deliveryLogsApi.delete(id)))
            }

            setCurrentHouseLogs([updatedLog])
            setHouseLogsCache((prev) => ({ ...prev, [currentHouse.id]: [updatedLog] }))
            setHasUnsavedChanges(false)
            setSaveStatus('saved')
            setLastSavedAt(timeLabel)

            updateAllocatedProductsOptimistically(currentHouse.id, payloadItems, setAllocatedHouseProducts, setSelectedDateProductTotals)
            toast.success(`${currentHouse.houseNo} delivery updated!`)
        } else {
            setCompletedHouses((prev) => new Set([...prev, currentHouse.id]))
            setHasUnsavedChanges(false)
            setSaveStatus('saved')
            setLastSavedAt(timeLabel)

            const created = await deliveryLogsApi.create({
                houseId: currentHouse.id,
                shift: selectedShift,
                items: payloadItems,
                deliveredAt: buildDeliveredAtForDate(selectedDate),
            })

            setCurrentHouseLogs([created.log])
            setHouseLogsCache((prev) => ({ ...prev, [currentHouse.id]: [created.log] }))

            updateAllocatedProductsOptimistically(currentHouse.id, payloadItems, setAllocatedHouseProducts, setSelectedDateProductTotals)
            toast.success(`${currentHouse.houseNo} delivered!`)
        }

        // Invalidate cache so next visit to this house fetches fresh logs from API
        setLoadedHouseLogIds((prev) => {
            const next = new Set(prev)
            next.delete(currentHouse.id)
            return next
        })
        setTimeout(() => handleNext(), 200)
    }

    // SHIFT SELECTOR
    if (!selectedShift) {
        return (
            <Dialog
                open={shiftSelectorOpen}
                onOpenChange={(open) => {
                    setShiftSelectorOpen(open)
                    if (!open) {
                        router.push('/dashboard/supplier')
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Select Shift</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Button className="w-full" onClick={() => {
                            setCurrentIndex(0)
                            setSelectedShift('morning')
                        }}>
                            Morning
                        </Button>

                        <Button className="w-full" onClick={() => {
                            setCurrentIndex(0)
                            setSelectedShift('evening')
                        }}>
                            Evening
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        )
    }

    if (loading) return (
        <div className="p-2 space-y-2 sm:p-4">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <Skeleton className="h-60 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
        </div>
    )

    if (panelView === 'allocated-houses') {
        return (
            <div ref={pageContainerRef} style={containerStyle} className="mx-auto flex w-full max-w-4xl flex-col overflow-hidden px-2 py-2 sm:px-4 sm:py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Supplier Panel</p>
                        <h1 className="text-2xl font-bold">Allocated Houses</h1>
                        <p className="text-sm text-muted-foreground">
                            {selectedShift === 'morning'
                                ? 'Houses allotted to you for morning delivery.'
                                : 'Evening houses available in your delivery queue.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => handlePanelViewChange('delivery')}
                        >
                            <Rows3 className="h-4 w-4" /> Switch to Delivery View
                        </Button>
                    </div>
                </div>

                <Input
                    placeholder="Search by house number, area, phone, product, or alert"
                    value={houseSearch}
                    onChange={(event) => setHouseSearch(event.target.value)}
                />

                <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Delivered By Product ({selectedDate.toLocaleDateString('en-IN')})
                        </p>
                    </div>

                    {selectedDateProductTotals.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No deliveries recorded for this date yet.</p>
                    ) : (
                        <div className="rounded-xl border border-border overflow-hidden">
                            {selectedDateProductTotals.map((item, index) => (
                                <div
                                    key={item.productName}
                                    className={`flex items-center justify-between px-3 py-2 ${index !== 0 ? 'border-t border-border' : ''}`}
                                >
                                    <p className="text-sm text-foreground">{item.productName}</p>
                                    <p className="text-sm font-semibold text-foreground">{item.qty.toLocaleString('en-IN')}L</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-card p-2">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-20">Route</TableHead>
                                <TableHead>House Number</TableHead>
                                <TableHead>Products</TableHead>
                                <TableHead>Daily Alert</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {searchedAllocatedHouses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                                        No houses match your search.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                searchedAllocatedHouses.map(({ house, routeNumber }) => {
                                    const allAlerts = parseHouseAlerts(house.configs?.[0]?.dailyAlerts)
                                    const selectedDayKey = DAYS_BY_INDEX[selectedDate.getDay()]
                                    const todayAlerts = allAlerts
                                        .filter((alert) => alert.schedule?.[selectedDayKey])
                                        .map((alert) => alert.text.trim())
                                        .filter(Boolean)

                                    return (
                                        <TableRow
                                            key={house.id}
                                            ref={highlightHouseId === house.id ? highlightedRowRef : undefined}
                                            onClick={() => handleOpenHouseInDelivery(house.id)}
                                            className={`cursor-pointer hover:bg-muted/50 transition-all duration-500 ${highlightHouseId === house.id ? 'bg-blue-500/15 shadow-[0_0_14px_4px_rgba(59,130,246,0.45)]' : ''
                                                }`}
                                        >
                                            <TableCell>
                                                <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px] font-semibold">
                                                    #{routeNumber}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-semibold">{house.houseNo}</TableCell>
                                            <TableCell>{allocatedHouseProducts[house.id] ?? '_'}</TableCell>
                                            <TableCell>{todayAlerts.length > 0 ? todayAlerts.join(', ') : '_'}</TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        )
    }

    if (!currentHouse) return <div>No houses</div>

    const isCompleted = completedHouses.has(currentHouse.id)
    const canSubmitDelivery = !isCompleted || hasUnsavedChanges
    const canModify = auth?.permissions?.canModifyDeliveryLogs === true
    const currentRouteNumber = currentIndex + 1
    const houseMotionClass =
        houseChangeDirection === 'next'
            ? 'animate-in fade-in slide-in-from-right-4 duration-300'
            : houseChangeDirection === 'prev'
                ? 'animate-in fade-in slide-in-from-left-4 duration-300'
                : 'animate-in fade-in duration-200'
    const houseSwipeStyle = {
        transform: `translate3d(${swipeOffset}px, 0, 0) scale(${isSwiping ? 0.992 : 1})`,
        opacity: swipeOffset === 0 ? 1 : 1 - Math.min(Math.abs(swipeOffset) / 420, 0.12),
        transition: isSwiping
            ? 'none'
            : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'transform, opacity',
    } as const
    const previousHouse = currentIndex > 0 ? visibleHouses[currentIndex - 1] : null
    const nextHouse = currentIndex < visibleHouses.length - 1 ? visibleHouses[currentIndex + 1] : null
    const swipePreviewDirection = swipeOffset < 0 ? 'next' : swipeOffset > 0 ? 'prev' : null
    const swipePanelWidth = pageContainerRef.current?.clientWidth ?? 360
    const swipePreviewHouse =
        swipePreviewDirection === 'next'
            ? nextHouse
            : swipePreviewDirection === 'prev'
                ? previousHouse
                : null
    const swipePreviewRouteNumber =
        swipePreviewDirection === 'next'
            ? currentIndex + 2
            : swipePreviewDirection === 'prev'
                ? currentIndex
                : currentIndex + 1
    const swipePreviewLogs = swipePreviewHouse ? (houseLogsCache[swipePreviewHouse.id] ?? []) : []
    const swipePreviewItems = swipePreviewHouse ? buildDeliveryItemsFromLogs(swipePreviewLogs) : []
    const isSwipePreviewLogsLoaded = swipePreviewHouse ? loadedHouseLogIds.has(swipePreviewHouse.id) : false
    const swipePreviewTotal = swipePreviewHouse
        ? swipePreviewItems.reduce((sum, item) => {
            const qty = Number(item.qty)
            if (!qty || qty <= 0) return sum
            return sum + qty * getEffectiveRate(swipePreviewHouse, item.milkType).rate
        }, 0)
        : 0
    const swipePreviewStyle = swipePreviewDirection
        ? {
            transform: `translate3d(calc(${swipePreviewDirection === 'next' ? '100%' : '-100%'} + ${swipeOffset}px), 0, 0)`,
            opacity: Math.min(1, Math.abs(swipeOffset) / Math.max(120, swipePanelWidth * 0.35)),
            transition: isSwiping ? 'none' : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease-out',
            willChange: 'transform, opacity',
        }
        : undefined

    return (
        <div ref={pageContainerRef} style={containerStyle} className="mx-auto flex w-full max-w-md flex-col overflow-y-auto overflow-x-hidden">
            <div className="mb-1 flex items-center justify-between">
                <div className='flex items-center gap-2'>
                    <p className="text-xs font-medium text-muted-foreground">
                        {selectedDate.toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                        })}
                    </p>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                            setDatePickerValue(selectedDateKey)
                            setIsDatePickerOpen(true)
                        }}
                        title="Change delivery date"
                    >
                        <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <div className='flex items-center'>

                    <Button
                        variant="outline"
                        size="icon"
                        className=""
                        onClick={() => {
                            const switchingToAllocated = panelView === 'delivery'
                            handlePanelViewChange(panelView === 'delivery' ? 'allocated-houses' : 'delivery')
                            if (switchingToAllocated) {
                                if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
                                setHighlightHouseId(currentHouse.id)
                                highlightTimerRef.current = setTimeout(() => setHighlightHouseId(null), 2000)
                            }
                        }}
                        aria-label="Switch view"
                        title="Switch view"
                    >
                        <Rows3 className="h-4 w-4" />
                    </Button>

                </div>

            </div>

            <Dialog open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <DialogContent className="w-80">
                    <DialogHeader>
                        <DialogTitle>Change delivery date</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Input
                            type="date"
                            value={datePickerValue}
                            max={todayDateKey}
                            onChange={(event) => setDatePickerValue(event.target.value)}
                        />
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setIsDatePickerOpen(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDatePickerConfirm}
                                className="flex-1"
                            >
                                Set Date
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <div
                className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${houseMotionClass}`}
            >
                {houseChangeMessage ? (
                    <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-primary/90 px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-lg shadow-primary/20">
                        {houseChangeMessage}
                    </div>
                ) : null}
                {swipePreviewHouse ? (
                    <div className="pointer-events-none absolute inset-0 z-0" style={swipePreviewStyle}>
                        <div className="flex h-full min-h-0 flex-col">
                            <div className="shrink-0 rounded-t-2xl rounded-b-none bg-card px-2 py-2 space-y-1.5 sm:space-y-3 sm:p-4">
                                <span className="rounded-md bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    {swipePreviewDirection === 'next' ? 'Next House' : 'Previous House'}
                                </span>

                                <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-muted/20 p-2 sm:grid-cols-3 sm:gap-3 sm:p-3">
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
                                            <div>
                                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">House No.</p>

                                                <h2 className="mt-0.5 text-lg font-bold leading-none sm:mt-1 sm:text-2xl">{swipePreviewHouse.houseNo}<span>{completedHouses.has(swipePreviewHouse.id) ? <p className="bg-green-600 w-2 h-2 rounded"></p> : <p className="bg-yellow-600 w-2 h-2 rounded-full"></p>}</span></h2>
                                                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                    Route #{swipePreviewRouteNumber}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Balance</p>
                                                {hasPaymentThisMonth(swipePreviewHouse.id, allPayments)
                                                    ? <p className="mt-0.5 font-semibold text-green-600 sm:mt-1">Paid</p>
                                                    : <p className="mt-0.5 font-semibold text-orange-600 sm:mt-1">₹{getHouseTotalBalance(swipePreviewHouse).toLocaleString('en-IN')}</p>
                                                }
                                            </div>

                                        </div>

                                        <div className="flex items-center justify-between gap-3 text-[13px] leading-tight sm:text-sm">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <MapPin className="h-4 w-4 shrink-0" />
                                                <span className="truncate">{swipePreviewHouse.area || 'Area not set'}</span>
                                            </div>
                                            <div className="flex min-w-0 items-center gap-2 text-right">
                                                <Phone className="h-4 w-4 shrink-0" />
                                                <span className="truncate">{swipePreviewHouse.phoneNo || 'Phone not set'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1 sm:col-span-1 sm:flex-col sm:justify-center sm:gap-2">
                                        {getEffectiveRate(swipePreviewHouse, 'buffalo').rate > 0 ? (
                                            <Badge className="flex-1 justify-center py-0.5 text-[10px] sm:w-full sm:py-1 sm:text-[11px]">
                                                <span className="sm:hidden">Buf ₹{getEffectiveRate(swipePreviewHouse, 'buffalo').rate}/L</span>
                                                <span className="hidden sm:inline">Buffalo ₹{getEffectiveRate(swipePreviewHouse, 'buffalo').rate}/L</span>
                                            </Badge>
                                        ) : null}
                                        {getEffectiveRate(swipePreviewHouse, 'cow').rate > 0 ? (
                                            <Badge className="flex-1 justify-center py-0.5 text-[10px] sm:w-full sm:py-1 sm:text-[11px]">
                                                <span className="sm:hidden">Cow ₹{getEffectiveRate(swipePreviewHouse, 'cow').rate}/L</span>
                                                <span className="hidden sm:inline">Cow ₹{getEffectiveRate(swipePreviewHouse, 'cow').rate}/L</span>
                                            </Badge>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-card rounded-t-none overflow-y-auto">
                                <div className="border-t border-border/40 p-3 space-y-3">
                                    <div className="overflow-x-auto rounded-xl border border-border/70">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-22.5 sm:w-30">Product</TableHead>
                                                    <TableHead className="w-24 sm:w-27.5">Qty (L)</TableHead>
                                                    {showAmountField && <TableHead className="hidden sm:table-cell sm:w-25">Amount</TableHead>}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {!isSwipePreviewLogsLoaded ? (
                                                    <TableRow>
                                                        <TableCell colSpan={showAmountField ? 3 : 2} className="py-4 text-center text-xs text-muted-foreground">
                                                            Loading products...
                                                        </TableCell>
                                                    </TableRow>
                                                ) : swipePreviewItems.filter((item) => Number(item.qty) > 0).length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={showAmountField ? 3 : 2} className="py-4 text-center text-xs text-muted-foreground">
                                                            No products delivered yet for selected date
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    swipePreviewItems
                                                        .filter((item) => Number(item.qty) > 0)
                                                        .map((item, idx) => {
                                                            const qty = Number(item.qty)
                                                            const rate = getEffectiveRate(swipePreviewHouse, item.milkType).rate
                                                            const amount = qty * rate

                                                            return (
                                                                <TableRow key={`${item.milkType}-${idx}`}>
                                                                    <TableCell className="font-medium capitalize">{item.milkType}</TableCell>
                                                                    <TableCell>{qty}</TableCell>
                                                                    {showAmountField && <TableCell className="hidden sm:table-cell">₹{amount.toLocaleString('en-IN')}</TableCell>}
                                                                </TableRow>
                                                            )
                                                        })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <Button size="sm" className="text-xs" disabled>
                                            <Plus className="mr-1 h-3 w-3" /> Add Item
                                        </Button>
                                        <div className="text-sm font-bold">Total: ₹{swipePreviewTotal.toLocaleString('en-IN')}</div>
                                    </div>
                                </div>

                                <div className="shrink-0 sticky bottom-0 z-10 bg-card">
                                    <Button disabled className="w-full rounded-none rounded-b-2xl py-2 text-xs sm:text-sm">
                                        {completedHouses.has(swipePreviewHouse.id) ? 'Update Delivery' : 'Mark Delivered'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
                <div className="relative z-10 flex min-h-0 flex-1 flex-col" style={houseSwipeStyle}>
                    {/* HOUSE CARD */}
                    <div className="shrink-0 rounded-t-2xl rounded-b-none bg-card px-2 py-2 space-y-1.5 sm:space-y-3 sm:p-4">
                        <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-muted/20 p-2 sm:grid-cols-2 sm:gap-3 sm:p-3">
                            <div className="space-y-1.5 sm:col-span-2">
                                <div className="grid grid-cols-2  sm:items-center">
                                    <div className='flex gap-2 flex-col'>
                                        <div>
                                            <div className='flex sm:flex-row sm:items-end flex-col gap-1'>
                                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">House No.</p>
                                                <h1 className="mt-0.5 text-lg font-bold leading-none sm:mt-1 sm:text-lg flex  items-center gap-2">{currentHouse.houseNo}<span>{isCompleted ? <p className="bg-green-600 w-2 h-2 rounded"></p> : <p className="bg-yellow-600 w-2 h-2 rounded-full"></p>}</span></h1>
                                            </div>
                                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                Route #{currentRouteNumber}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-1 text-[13px] leading-tight sm:text-sm">
                                            <div className="flex min-w-0 gap-1">
                                                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                                                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{currentHouse.area || 'Area not set'}</span>
                                            </div>
                                            <div className="flex min-w-0 gap-1">
                                                <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
                                                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{currentHouse.phoneNo || 'Phone not set'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative flex flex-row justify-end gap-2 ">
                                        <div className='flex justify-center flex-col'>
                                            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Bill Bal</p>
                                            {hasPaymentThisMonth(currentHouse.id, allPayments)
                                                ? <p className="mt-0.5 font-semibold text-green-600 sm:mt-1">Paid</p>
                                                : <p className="mt-0.5 font-semibold text-orange-600 sm:mt-1">₹{getHouseBillBalance(currentHouse).toLocaleString('en-IN')}</p>
                                            }
                                            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total Bal</p>
                                            <p className="mt-0.5 font-semibold text-orange-600 sm:mt-1">₹{getHouseTotalBalance(currentHouse).toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className='flex flex-col gap-0.5'>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={handleClearToday}
                                                title="Clear selected-date deliveries"
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="gap-1.5"
                                                onClick={handleOpenHistory}
                                            >
                                                <History className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="gap-1.5"
                                                onClick={() => setIsMapExpanded(true)}
                                            >
                                                <MapIcon className="h-4 w-4" />
                                            </Button>
                                        </div>

                                    </div>
                                </div>
                            </div>


                        </div>
                    </div>
                    <div className="flex gap-1">
                        {(() => {
                            const buffalo = getEffectiveRate(currentHouse, 'buffalo')
                            const cow = getEffectiveRate(currentHouse, 'cow')

                            return (
                                <>
                                    {buffalo.rate !== 0 &&
                                        <Badge className="flex-1 justify-center w-full py-1 text-[11px]">
                                            <span className="sm:hidden">Buf ₹{buffalo.rate}/L</span>
                                            <span className="hidden sm:inline">Buffalo ₹{buffalo.rate}/L</span>
                                        </Badge>
                                    }
                                    {cow.rate !== 0 &&
                                        <Badge className="flex-1 justify-center w-full py-1 text-[11px]">
                                            <span className="sm:hidden">Cow ₹{cow.rate}/L</span>
                                            <span className="hidden sm:inline">Cow ₹{cow.rate}/L</span>
                                        </Badge>
                                    }
                                </>
                            )
                        })()}
                    </div>

                    {/* FIRST DELIVERY FORM */}
                    <div className="bg-card rounded-t-none overflow-y-auto">
                        <div className="border-t border-border/40 p-3 space-y-3">
                            <div className="overflow-x-auto rounded-xl border border-border/70">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-22.5 sm:w-30">Product</TableHead>
                                            <TableHead className="w-24 sm:w-27.5">Qty (L)</TableHead>
                                            {showAmountField && <TableHead className="hidden sm:table-cell sm:w-25">Amount</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {deliveryItems.map((item, idx) => {
                                            const effectiveRate = getEffectiveRate(currentHouse, item.milkType)
                                            const rate = effectiveRate.rate
                                            const qty = Number(item.qty)
                                            const amount = qty > 0 ? qty * rate : 0
                                            const isSwipedOpen = swipedDeliveryItem.index === idx
                                            const rowOffset = isSwipedOpen ? swipedDeliveryItem.offset : 0

                                            return (
                                                <TableRow key={idx} className="border-0">
                                                    <TableCell colSpan={showAmountField ? 3 : 2} className="p-0">
                                                        <div
                                                            className="relative overflow-hidden rounded-xl border border-border/70 bg-card"
                                                            style={{ touchAction: 'pan-y' }}
                                                            onTouchStart={(event) => isCompleted && !canModify ? null : handleDeliveryItemTouchStart(idx, event)}
                                                            onTouchMove={(event) => handleDeliveryItemTouchMove(idx, event)}
                                                            onTouchEnd={() => handleDeliveryItemTouchEnd(idx)}
                                                            onTouchCancel={() => {
                                                                deliveryItemSwipeStartRef.current = null
                                                                setSwipedDeliveryItem({ index: null, offset: 0 })
                                                            }}
                                                        >
                                                            <div
                                                                className="absolute inset-y-0 right-0 z-0 flex w-10 items-stretch"
                                                                style={{
                                                                    opacity: (isCompleted && !canModify) ? 0 : (rowOffset <= -16 ? 1 : 0),
                                                                    transform: `translate3d(${(isCompleted && !canModify) ? 8 : (rowOffset <= -16 ? 0 : 8)}px, 0, 0)`,
                                                                    transition: deliveryItemSwipeStartRef.current?.index === idx
                                                                        ? 'none'
                                                                        : 'opacity 180ms ease, transform 180ms ease',
                                                                    pointerEvents: (isCompleted && !canModify) ? 'none' : (rowOffset <= -16 ? 'auto' : 'none'),
                                                                }}
                                                            >
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    className="h-full w-full rounded-none rounded-l-xl bg-transparent p-0 text-destructive shadow-none hover:bg-destructive/10"
                                                                    onClick={() => removeDeliveryItem(idx)}
                                                                    aria-label="Delete item"
                                                                >
                                                                    <Trash2 className="h-3.25 w-3.25" />
                                                                </Button>
                                                            </div>

                                                            <div
                                                                className="relative z-10 transition-transform duration-200"
                                                                style={{
                                                                    transform: `translate3d(${rowOffset}px, 0, 0)`,
                                                                    backgroundColor: rowOffset < 0 ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                                                    transition: deliveryItemSwipeStartRef.current?.index === idx
                                                                        ? 'none'
                                                                        : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                                                                }}
                                                            >
                                                                {/* Mobile: 2-row layout */}
                                                                <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.8fr)] gap-2 p-2 sm:hidden">
                                                                    <div>
                                                                        <Select
                                                                            value={productRateOptions.find(o => o.value.toLowerCase() === item.milkType.toLowerCase())?.value ?? item.milkType}
                                                                            onValueChange={(val) =>
                                                                                updateDeliveryItem(idx, 'milkType', val)
                                                                            }
                                                                            disabled={isCompleted && !canModify}
                                                                        >
                                                                            <SelectTrigger className="h-9 w-full">
                                                                                <SelectValue placeholder={productRateOptions.length > 0 ? 'Select product' : 'No active products'} />
                                                                            </SelectTrigger>
                                                                            <SelectContent
                                                                                position="popper"
                                                                                side="bottom"
                                                                                align="start"
                                                                                collisionPadding={12}
                                                                                sideOffset={6}
                                                                                style={{
                                                                                    maxHeight: 'min(60dvh, var(--radix-select-content-available-height))',
                                                                                }}
                                                                            >
                                                                                {productRateOptions.length > 0 ? (
                                                                                    productRateOptions.map((option) => (
                                                                                        <SelectItem key={option.value} value={option.value}>
                                                                                            {option.label} (₹{getEffectiveRate(currentHouse, option.value).rate})
                                                                                        </SelectItem>
                                                                                    ))
                                                                                ) : (
                                                                                    <SelectItem value="__no_products__" disabled>
                                                                                        No active products
                                                                                    </SelectItem>
                                                                                )}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>

                                                                    <div>
                                                                        <Input
                                                                            type="number"
                                                                            placeholder="Qty"
                                                                            value={item.qty}
                                                                            onChange={(e) =>
                                                                                updateDeliveryItem(idx, 'qty', e.target.value)
                                                                            }
                                                                            className="h-9 border-border/90 bg-background text-foreground placeholder:text-muted-foreground"
                                                                            disabled={isCompleted && !canModify}
                                                                        />
                                                                    </div>

                                                                    {showAmountField && (
                                                                        <div>
                                                                            <Input
                                                                                type="number"
                                                                                placeholder="Amount"
                                                                                value={item.amount || (qty > 0 ? String(amount) : '')}
                                                                                onChange={(e) =>
                                                                                    updateDeliveryItem(idx, 'amount', e.target.value)
                                                                                }
                                                                                className="h-9 border-border/90 bg-background text-foreground placeholder:text-muted-foreground"
                                                                                disabled={isCompleted && !canModify}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Desktop: single-row layout */}
                                                                <div className={`hidden sm:grid sm:gap-3 sm:p-3 ${showAmountField ? 'sm:grid-cols-[minmax(0,1.25fr)_minmax(5.5rem,0.9fr)_minmax(6rem,0.9fr)]' : 'sm:grid-cols-[minmax(0,1.25fr)_minmax(5.5rem,0.9fr)]'}`}>
                                                                    <div>
                                                                        <Select
                                                                            value={productRateOptions.find(o => o.value.toLowerCase() === item.milkType.toLowerCase())?.value ?? item.milkType}
                                                                            onValueChange={(val) =>
                                                                                updateDeliveryItem(idx, 'milkType', val)
                                                                            }
                                                                            disabled={isCompleted && !canModify}
                                                                        >
                                                                            <SelectTrigger className="h-9 w-full">
                                                                                <SelectValue placeholder={productRateOptions.length > 0 ? 'Select product' : 'No active products'} />
                                                                            </SelectTrigger>
                                                                            <SelectContent
                                                                                position="popper"
                                                                                side="bottom"
                                                                                align="start"
                                                                                collisionPadding={12}
                                                                                sideOffset={6}
                                                                                style={{
                                                                                    maxHeight: 'min(60dvh, var(--radix-select-content-available-height))',
                                                                                }}
                                                                            >
                                                                                {productRateOptions.length > 0 ? (
                                                                                    productRateOptions.map((option) => (
                                                                                        <SelectItem key={option.value} value={option.value}>
                                                                                            {option.label} (₹{getEffectiveRate(currentHouse, option.value).rate})
                                                                                        </SelectItem>
                                                                                    ))
                                                                                ) : (
                                                                                    <SelectItem value="__no_products__" disabled>
                                                                                        No active products
                                                                                    </SelectItem>
                                                                                )}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>

                                                                    <div className="sm:min-w-30">
                                                                        <Input
                                                                            type="number"
                                                                            placeholder="0"
                                                                            value={item.qty}
                                                                            onChange={(e) =>
                                                                                updateDeliveryItem(idx, 'qty', e.target.value)
                                                                            }
                                                                            className="h-9 border-border/90 bg-background text-foreground placeholder:text-muted-foreground"
                                                                            disabled={isCompleted && !canModify}
                                                                        />
                                                                    </div>

                                                                    {showAmountField && (
                                                                        <div className="sm:min-w-24">
                                                                            <Input
                                                                                type="number"
                                                                                placeholder="0"
                                                                                value={item.amount || (qty > 0 ? String(amount) : '')}
                                                                                onChange={(e) =>
                                                                                    updateDeliveryItem(idx, 'amount', e.target.value)
                                                                                }
                                                                                className="h-9 border-border/90 bg-background text-foreground placeholder:text-muted-foreground"
                                                                                disabled={isCompleted && !canModify}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    {(!isCompleted || canModify) && (
                                        <Button onClick={addItem} size="sm" className="text-xs">
                                            <Plus className="mr-1 h-3 w-3" /> Add Item
                                        </Button>
                                    )}
                                    {!isCompleted && (
                                        <Button
                                            onClick={async () => {
                                                if (!currentHouse || !selectedShift) return
                                                try {
                                                    const sevenDaysAgo = new Date()
                                                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
                                                    sevenDaysAgo.setHours(0, 0, 0, 0)
                                                    const fromDate = sevenDaysAgo.toISOString()

                                                    const res = await directFetch(
                                                        `/delivery-logs?houseId=${currentHouse.id}&shift=${selectedShift}&fromDate=${fromDate}`,
                                                        { headers: { 'Content-Type': 'application/json', ...getAuthHeader() } },
                                                    )
                                                    if (!res.ok) return
                                                    const logs: DeliveryLog[] = await res.json()

                                                    const freq = new Map<string, Map<number, number>>()
                                                    for (const log of logs) {
                                                        for (const item of log.items) {
                                                            const product = String(item.milkType ?? '').trim()
                                                            if (!product) continue
                                                            const qty = Number(item.qty)
                                                            if (!qty || qty <= 0) continue
                                                            const qm = freq.get(product) ?? new Map()
                                                            qm.set(qty, (qm.get(qty) ?? 0) + 1)
                                                            freq.set(product, qm)
                                                        }
                                                    }

                                                    const recs: Array<{ milkType: string; qty: number }> = []
                                                    for (const [product, qm] of freq) {
                                                        const best = Array.from(qm.entries()).sort((a, b) => b[1] - a[1])[0]
                                                        if (best) recs.push({ milkType: product, qty: best[0] })
                                                    }

                                                    if (recs.length === 0) return

                                                    setDeliveryItems(recs.map((r) => ({ milkType: r.milkType, qty: String(r.qty), amount: '' })))
                                                    setHasUnsavedChanges(true)
                                                    setSaveStatus('idle')
                                                } catch {
                                                    // non-critical
                                                }
                                            }}
                                            variant="outline"
                                            size="sm"
                                            className="text-xs"
                                        >
                                            <Sparkles className="mr-1 h-3 w-3" /> Recommend
                                        </Button>
                                    )}
                                </div>
                                <div className="text-sm font-bold">
                                    Total: ₹{currentDeliveryTotal.toLocaleString('en-IN')}
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                {saveStatus === 'failed'
                                    ? 'Save failed. Please try again.'
                                    : hasUnsavedChanges
                                        ? 'Unsaved changes. Click the button below to save.'
                                        : saveStatus === 'saved'
                                            ? `Changes saved${lastSavedAt ? ` at ${lastSavedAt}` : ''}.`
                                            : isCompleted
                                                ? canModify ? 'No new changes to save.' : 'View-only — no changes allowed.'
                                                : ''}
                            </p>
                        </div>

                        {/* ACTION */}
                        <div className="sticky bottom-0 z-10 -mx-2 mb-4 rounded-2xl border border-border/70 bg-card px-2 py-2 shadow-lg shadow-black/10 sm:mx-0 sm:mb-0 sm:rounded-none sm:border-0 sm:bg-card sm:px-0 sm:py-0 sm:shadow-none">
                            <Button onClick={handleMarkDelivered} disabled={isCompleted && !canModify ? true : !canSubmitDelivery} className="w-full rounded-xl py-2 text-xs shadow-sm sm:rounded-none sm:rounded-b-2xl sm:text-sm">
                                {isCompleted ? (canModify ? 'Update Delivery' : 'View Only') : 'Mark Delivered'}
                            </Button>
                        </div>
                    </div>

                    <div
                        className="flex shrink-0 items-center justify-between px-0.5 py-0.5"
                        onTouchStart={handleHouseTouchStart}
                        onTouchMove={handleHouseTouchMove}
                        onTouchEnd={handleHouseTouchEnd}
                        onTouchCancel={() => {
                            navSwipeStartRef.current = null
                            setSwipeOffset(0)
                            setIsSwiping(false)
                        }}
                    >
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handlePrevious} disabled={currentIndex === 0}>
                            <ChevronLeft />
                        </Button>

                        <div className="text-center">
                            <p className="text-xs font-semibold sm:text-sm">
                                Route {currentRouteNumber} / {visibleHouses.length}
                            </p>
                            <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-[10px] text-muted-foreground sm:text-xs"
                                onClick={handleJumpToNextPending}
                            >
                                Next Pending →
                            </Button>
                        </div>

                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleNext} disabled={currentIndex === visibleHouses.length - 1}>
                            <ChevronRight />
                        </Button>
                    </div>
                </div>

            </div>

            <Dialog open={isMapExpanded} onOpenChange={setIsMapExpanded}>
                <DialogContent className="max-w-3xl max-h-[calc(100dvh-1rem)] overflow-y-auto top-2 translate-y-0 px-4 pb-4 pt-10 sm:top-1/2 sm:-translate-y-1/2 sm:px-6 sm:pb-6 sm:pt-6">
                    <DialogHeader className="pr-10">
                        <DialogTitle>House Location & Route</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                            <p className="font-semibold">{currentHouse.houseNo}</p>
                            <p className="text-muted-foreground">{currentHouse.area || 'Area not set'}</p>
                        </div>

                        <LocationRouteMap
                            searchQuery={`${currentHouse.houseNo}${currentHouse.area ? `, ${currentHouse.area}` : ''}`}
                            houseNo={currentHouse.houseNo}
                            area={currentHouse.area ?? ''}
                            houseId={currentHouse.id}
                            storedLocation={currentHouse.location}
                            onLocationSaved={handleLocationSaved}
                            onBack={() => setIsMapExpanded(false)}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={clearTodayDialogOpen} onOpenChange={setClearTodayDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Selected Date Deliveries?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete all delivery items for {selectedDate.toLocaleDateString('en-IN')} for House {currentHouse?.houseNo}. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmClearToday} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={swipeDeleteConfirmIndex !== null}
                onOpenChange={(open) => { if (!open) setSwipeDeleteConfirmIndex(null) }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Item?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this delivery item? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (swipeDeleteConfirmIndex !== null) {
                                    await removeDeliveryItem(swipeDeleteConfirmIndex)
                                }
                                setSwipeDeleteConfirmIndex(null)
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
                <DialogContent className="max-h-[80vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
                    <DialogHeader>
                        <DialogTitle>
                            Last Delivery — House {currentHouse?.houseNo}
                        </DialogTitle>
                    </DialogHeader>
                    {historyLoading ? (
                        <div className="space-y-3 py-4">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-16 w-full rounded-lg" />
                            ))}
                        </div>
                    ) : historyLogs.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No delivery records found.</p>
                    ) : (() => {
                        const latestLogDate = new Date(historyLogs[0].deliveredAt)
                        const dateStr = latestLogDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                        const allItems = new Map<string, { qty: number; rate: number }>()
                        for (const log of historyLogs) {
                            for (const item of log.items || []) {
                                if (Number(item.qty) <= 0) continue
                                const key = item.milkType.trim().toLowerCase()
                                const existing = allItems.get(key)
                                if (existing) {
                                    existing.qty += Number(item.qty)
                                } else {
                                    allItems.set(key, { qty: Number(item.qty), rate: item.rate })
                                }
                            }
                        }
                        const grandTotal = Array.from(allItems.values()).reduce((s, it) => s + it.qty * it.rate, 0)
                        return (
                            <div className="py-1">
                                <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Delivered on {dateStr}</p>
                                <div className="overflow-x-auto rounded-xl border border-border/70">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Product</TableHead>
                                                <TableHead className="text-right">Qty (L)</TableHead>
                                                <TableHead className="text-right">Rate</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Array.from(allItems.entries()).map(([key, { qty, rate }]) => (
                                                <TableRow key={key}>
                                                    <TableCell className="font-medium capitalize">{key}</TableCell>
                                                    <TableCell className="text-right">{qty}</TableCell>
                                                    <TableCell className="text-right">₹{rate}/L</TableCell>
                                                    <TableCell className="text-right font-semibold">₹{(qty * rate).toLocaleString('en-IN')}</TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                                                <TableCell className="text-right font-bold">₹{grandTotal.toLocaleString('en-IN')}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )
                    })()}
                    <div className="pt-2">
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                                setHistoryDialogOpen(false)
                                handleOpenSummary()
                            }}
                        >
                            <Rows3 className="mr-2 h-4 w-4" />
                            View Full Summary
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={summaryOpen} onOpenChange={(open) => {
                summaryRequestIdRef.current++
                setSummaryOpen(open)
                if (!open) {
                    setSummaryHouse(null)
                    setSummaryBalance(null)
                    setSummaryLogs([])
                    setSummaryBills([])
                    setSummaryProductRates([])
                    setSummaryLoading(false)
                    setSummaryFromDate('')
                    setSummaryToDate('')
                    setDeletingDeliveryLog(null)
                    setEditDeliveryDialogOpen(false)
                    setEditingDeliveryLog(null)
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
                                </DialogTitle>
                            </DialogHeader>

                            <div className="flex items-center justify-center gap-2 border-b border-border pb-3">
                                <Button variant="ghost" size="sm" onClick={() => { const p = summaryGetPreviousMonth(summaryPeriod.year, summaryPeriod.month); if (summaryIsValidMonth(p.year, p.month)) setSummaryPeriod(p) }} className="h-8 w-8 p-0">
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="min-w-48 text-center text-sm font-medium">
                                    {MONTH_NAMES[summaryPeriod.month + 1]} {summaryPeriod.year}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => { const p = summaryGetNextMonth(summaryPeriod.year, summaryPeriod.month); if (summaryIsValidMonth(p.year, p.month)) setSummaryPeriod(p) }} className="h-8 w-8 p-0">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="space-y-6 py-2">
                                {/* Date Range Filter */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-[11px] font-medium text-muted-foreground">From</Label>
                                            <Input type="date" value={summaryFromDate} onChange={(e) => setSummaryFromDate(e.target.value)} className="h-7 w-[140px] text-xs" />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-[11px] font-medium text-muted-foreground">To</Label>
                                            <Input type="date" value={summaryToDate} onChange={(e) => setSummaryToDate(e.target.value)} className="h-7 w-[140px] text-xs" />
                                        </div>
                                        {summaryHasDateRangeFilter && (
                                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSummaryFromDate(''); setSummaryToDate('') }}>
                                                Clear
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Received Payments */}
                                <div>
                                    <h3 className="mb-3 text-sm font-semibold">Received Payments</h3>
                                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                                        {summaryLoading ? (
                                            <div className="space-y-3">
                                                <Skeleton className="h-10 w-full rounded-lg" />
                                                <Skeleton className="h-10 w-full rounded-lg" />
                                            </div>
                                        ) : summaryPaymentSummaryRows.length === 0 ? (
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
                                                        {summaryPaymentSummaryRows.map((row, idx) => (
                                                            <tr key={row.id} className={`border-b border-border ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                                                <td className="px-4 py-3 font-medium text-foreground">
                                                                    {new Date(row.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                                                                ₹{summaryPaymentSummaryRows.reduce((sum, row) => sum + row.paidAmount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-red-500">
                                                                ₹{summaryPaymentSummaryRows.reduce((sum, row) => sum + row.discount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Generated Bills */}
                                {summaryMatchingBills.length > 0 && (() => {
                                    const combinedMap = new Map<string, { name: string; qty: number; rate: number; amount: number }>()
                                    for (const bill of summaryMatchingBills) {
                                        for (const item of (bill.items as BillItem[])) {
                                            if (!item.name || item.qty <= 0) continue
                                            const cleanName = summaryCleanItemName(item.name)
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
                                    const totalBillAmount = summaryMatchingBills.reduce((s, b) => s + Number(b.totalAmount), 0)
                                    const latestPreviousBalance = Number(summaryMatchingBills[0].previousBalance ?? 0)
                                    const dateRanges = summaryMatchingBills.map(b =>
                                        b.fromDate && b.toDate
                                            ? `${summaryParseDateOnly(b.fromDate).toLocaleDateString('en-IN')} — ${summaryParseDateOnly(b.toDate).toLocaleDateString('en-IN')}`
                                            : null
                                    ).filter(Boolean)

                                    return (
                                        <div>
                                            <h3 className="text-sm font-semibold text-foreground mb-3">Generated Bills</h3>
                                            {dateRanges.length > 0 && (
                                                <div className="mb-2 text-xs text-muted-foreground">{dateRanges.join(' | ')}</div>
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

                                {/* Monthly Product Summary */}
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground mb-3">Monthly Product Summary</h3>
                                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                                        {summaryLoading ? (
                                            <div className="space-y-3">
                                                <Skeleton className="h-10 w-full rounded-lg" />
                                                <Skeleton className="h-10 w-full rounded-lg" />
                                            </div>
                                        ) : summaryMonthlyProductSummary.length === 0 ? (
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
                                                            {Array.from(new Set(summaryMonthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => {
                                                                const [year, month] = monthKey.split('-').map(Number)
                                                                return (
                                                                    <th key={monthKey} className="px-3 py-3 text-right font-semibold text-foreground min-w-20">{MONTH_NAMES[month]} {year}</th>
                                                                )
                                                            })}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {summaryMonthlyProductSummary.map((row, idx) => {
                                                            const uniqueMonths = Array.from(new Set(summaryMonthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort()
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
                                                        {summaryMonthlyProductSummary.length > 0 && (
                                                            <>
                                                                <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                                                                    <td className="px-4 py-3 text-foreground">Total</td>
                                                                    {Array.from(new Set(summaryMonthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => (
                                                                        <td key={monthKey} className="px-3 py-3 text-right text-foreground">
                                                                            ₹{summaryTotals.pendingTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                                <tr className="border-t border-border bg-muted/50 font-semibold">
                                                                    <td className="px-4 py-3 text-amber-600 dark:text-amber-400">Previous Balance</td>
                                                                    {Array.from(new Set(summaryMonthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => (
                                                                        <td key={monthKey} className="px-3 py-3 text-right text-amber-600 dark:text-amber-400">
                                                                            ₹{summaryTotals.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                                <tr className="border-t-2 border-border bg-muted/50 font-bold">
                                                                    <td className="px-4 py-3 text-foreground">Grand Total</td>
                                                                    {Array.from(new Set(summaryMonthlyProductSummary.flatMap(p => p.months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`)))).sort().map((monthKey) => (
                                                                        <td key={monthKey} className="px-3 py-3 text-right text-primary">
                                                                            ₹{(summaryTotals.pendingTotal + summaryTotals.previousBalance).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                                        </td>
                                                                    ))}
                                                                </tr>
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
                                            </div>
                                        ) : summaryDisplaySummaryRows.length === 0 ? (
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
                                                    {summaryDisplaySummaryRows.map((row) => {
                                                        const blocked = summaryIsDeliveryBlockedByBill(row.dateKey) || Boolean(row.log?.isClosed)
                                                        return (
                                                            <TableRow key={row.dateKey} className={blocked ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}>
                                                                <TableCell className={`font-medium ${blocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>{row.dayLabel}</TableCell>
                                                                <TableCell className={`whitespace-normal ${blocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                                                                    {row.hasDelivery ? row.productsLabel : <span className="text-muted-foreground">-</span>}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        <Button variant="ghost" size="sm" onClick={() => summaryOpenEditDeliveryDialog(row)} title={blocked ? 'Cannot edit after bill generation' : 'Edit delivery'} disabled={blocked} className="h-8 w-8 p-0">
                                                                            <Edit2 className="h-4 w-4" />
                                                                        </Button>
                                                                        {!blocked && row.log && (
                                                                            <Button variant="ghost" size="sm" onClick={() => setDeletingDeliveryLog(row.log!)} title="Delete delivery" className="h-8 w-8 p-0 text-destructive hover:text-destructive">
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

                            <DialogFooter>
                                <Button variant="outline" onClick={handleExportSummaryPdf} disabled={summaryLoading || summaryDisplaySummaryRows.length === 0}>
                                    Export PDF
                                </Button>
                                <Button onClick={() => setSummaryOpen(false)}>Close</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Edit Delivery Dialog */}
            <Dialog open={editDeliveryDialogOpen} onOpenChange={setEditDeliveryDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit Delivery</DialogTitle>
                    </DialogHeader>
                    {editingDeliveryLog && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Note</Label>
                                <Input value={editDeliveryForm.note ?? ''} onChange={(e) => setEditDeliveryForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Optional note" />
                            </div>
                            <div className="space-y-2">
                                <Label>Items</Label>
                                {editDeliveryForm.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="flex-1 text-sm">{item.milkType}</span>
                                        <Input type="number" value={item.qty} onChange={(e) => {
                                            const qty = Number(e.target.value)
                                            const rate = summaryGetPreferredRateForHouse(item.milkType)
                                            setEditDeliveryForm((prev) => ({
                                                ...prev,
                                                items: prev.items.map((it, i) => i === idx ? { ...it, qty, rate, amount: qty * rate } : it),
                                            }))
                                        }} className="w-20" />
                                        <span className="text-sm text-muted-foreground">₹{item.amount.toLocaleString('en-IN')}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="text-right text-sm font-semibold">Total: ₹{summaryEditDeliveryTotal.toLocaleString('en-IN')}</div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setEditDeliveryDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleSaveDeliveryEdit} disabled={editDeliverySaving}>
                                    {editDeliverySaving ? 'Saving...' : 'Save'}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Delivery Confirmation */}
            <AlertDialog open={!!deletingDeliveryLog} onOpenChange={() => setDeletingDeliveryLog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Delivery?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this delivery record. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteDeliveryLog} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
