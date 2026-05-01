'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type TouchEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
    ChevronLeft,
    ChevronRight,
    Maximize2,
    MapPin,
    Phone,
    Rows3,
    Plus,
    Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
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
import {
    houseConfigApi,
    housesApi,
    deliveryLogsApi,
    productRatesApi,
    type DeliveryLog,
    type ProductRate,
    type House,
    type HouseConfig,
} from '@/lib/api'
import { parseDailyAlerts, type AlertDays, type HouseAlert } from '@/lib/alerts'
import { useHouseConfigs } from '@/hooks/use-house-configs'
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
import { getSessionAuth } from '@/lib/auth'
import { toast } from 'sonner'

type DeliveryItemForm = {
    milkType: string
    qty: string
}

const emptyDeliveryItem: DeliveryItemForm = {
    milkType: '',
    qty: '',
}

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

    const configured = [
        { type: normalizeProductName(house.rate1Type), rate: Number(house.rate1 ?? 0) },
        { type: normalizeProductName(house.rate2Type), rate: Number(house.rate2 ?? 0) },
    ]

    const typedMatch = configured.find((entry) =>
        entry.type.includes(milkType) && Number.isFinite(entry.rate) && entry.rate > 0
    )

    if (typedMatch) return typedMatch.rate

    const fallback = milkType === 'buffalo' ? Number(house.rate1 ?? 0) : Number(house.rate2 ?? 0)
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

function getStoredShift(dateKey: string): 'morning' | 'evening' | null {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(`delivery_shift_${dateKey}`)
    if (stored === 'morning' || stored === 'evening') return stored
    return null
}

function getStoredIndex(dateKey: string, shift: 'morning' | 'evening'): number {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(`delivery_index_${dateKey}_${shift}`)
    const parsed = parseInt(stored ?? '0', 10)
    return isNaN(parsed) ? 0 : parsed
}

export default function DeliveryPage() {
    const router = useRouter()

    const [auth, setAuth] = useState<any>(null)
    const [todayKey, setTodayKey] = useState(() => getLocalDateKey())
    const [selectedShift, setSelectedShift] = useState<'morning' | 'evening' | null>(null)
    const [shiftSelectorOpen, setShiftSelectorOpen] = useState(true)

    const [houses, setHouses] = useState<House[]>([])
    const { configs: rawConfigs, loading: configsLoading } = useHouseConfigs()
    const [productRates, setProductRates] = useState<ProductRate[]>([])
    const [globalRateMap, setGlobalRateMap] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)
    const [panelView, setPanelView] = useState<'delivery' | 'allocated-houses'>('delivery')
    const [houseSearch, setHouseSearch] = useState('')
    const [allocatedHouseProducts, setAllocatedHouseProducts] = useState<Record<number, string>>({})

    const [currentIndex, setCurrentIndex] = useState(0)
    const [completedHouses, setCompletedHouses] = useState<Set<number>>(new Set())
    const [currentHouseLogs, setCurrentHouseLogs] = useState<DeliveryLog[]>([])
    const [houseLogsCache, setHouseLogsCache] = useState<Record<number, DeliveryLog[]>>({})
    const [loadedHouseLogIds, setLoadedHouseLogIds] = useState<Set<number>>(new Set())
    const [logsLoading, setLogsLoading] = useState(false)

    const [deliveryItems, setDeliveryItems] = useState<DeliveryItemForm[]>([{ ...emptyDeliveryItem }])
    const [marking, setMarking] = useState(false)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'failed'>('idle')
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
    const [swipedDeliveryItem, setSwipedDeliveryItem] = useState<{ index: number | null; offset: number }>({
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
    const pageContainerRef = useRef<HTMLDivElement | null>(null)
    const [availableHeight, setAvailableHeight] = useState<number | null>(null)

    const containerStyle = useMemo(
        () => ({ height: availableHeight ? `${availableHeight}px` : 'calc(100dvh - 0.5rem)' }),
        [availableHeight],
    )

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
            .filter((house) => house.configs.length > 0)
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
        if (selectedShift && typeof window !== 'undefined' && !hasInitiallyRestored.current) {
            hasInitiallyRestored.current = true
            const savedIndex = getStoredIndex(todayKey, selectedShift)
            setCurrentIndex(savedIndex)
            setShiftSelectorOpen(false)
        }
    }, [selectedShift, todayKey])

    // SAVE SHIFT TO LOCALSTORAGE
    useEffect(() => {
        if (selectedShift && typeof window !== 'undefined') {
            localStorage.setItem(`delivery_shift_${todayKey}`, selectedShift)
        }
    }, [selectedShift, todayKey])

    // SAVE CURRENT INDEX TO LOCALSTORAGE
    useEffect(() => {
        if (selectedShift && typeof window !== 'undefined') {
            localStorage.setItem(`delivery_index_${todayKey}_${selectedShift}`, String(currentIndex))
        }
    }, [currentIndex, selectedShift, todayKey])

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

            const [data, rates] = await Promise.all([
                housesApi.list(),
                productRatesApi.list(),
            ])

            setProductRates(rates)
            setGlobalRateMap(resolveGlobalRateMap(rates))
            setDeliveryItems((prev) => {
                const defaultProduct = rates.find((rate) => rate.isActive && Number(rate.rate) > 0)?.name.trim() ?? ''
                return prev.map((item) => (item.milkType ? item : { ...item, milkType: defaultProduct }))
            })
            setHouses(data)
            if (resetIndex || selectedShift) {
                const savedIndex = getStoredIndex(todayKey, selectedShift)
                setCurrentIndex(savedIndex)
            }
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setLoading(false)
        }
    }, [auth, selectedShift, todayKey])

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
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
                    {
                        headers: {
                            Accept: 'application/json',
                        },
                    },
                )

                if (!response.ok) throw new Error('Geocoding failed')

                const result = (await response.json()) as Array<{ lat: string; lon: string }>
                if (!active || result.length === 0) {
                    setMiniMapCenter(DEFAULT_MAP_CENTER)
                    return
                }

                const lat = Number(result[0].lat)
                const lon = Number(result[0].lon)
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
                const todayKey = DAYS_BY_INDEX[new Date().getDay()]
                const alertText = configAlerts
                    .filter((alert) => alert.schedule?.[todayKey])
                    .map((alert) => alert.text.trim())
                    .filter(Boolean)
                    .join(', ')

                const searchable = [
                    house.houseNo,
                    house.area ?? '',
                    house.phoneNo,
                    allocatedHouseProducts[house.id] ?? '',
                    alertText,
                ]

                return searchable.some((value) => value.toLowerCase().includes(query))
            })
    }, [visibleHouses, houseSearch, allocatedHouseProducts])

    const loadTodayDeliveredSummary = useCallback(async () => {
        if (!auth || !selectedShift) return

        const logs = await deliveryLogsApi.list({ shift: selectedShift })
        const today = new Date()
        const deliveredToday = logs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), today))

        const nextProducts: Record<number, Map<string, number>> = {}
        const nextCompleted = new Set<number>()

        for (const log of deliveredToday) {
            nextCompleted.add(log.houseId)

            if (!nextProducts[log.houseId]) {
                nextProducts[log.houseId] = new Map<string, number>()
            }

            for (const item of log.items) {
                const productName = item.milkType.trim()
                if (!productName) continue

                const currentQty = nextProducts[log.houseId].get(productName) ?? 0
                nextProducts[log.houseId].set(productName, currentQty + Number(item.qty || 0))
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
        setCompletedHouses(nextCompleted)
    }, [auth, selectedShift])

    useEffect(() => {
        if (!auth || !selectedShift) return

        let active = true

        const loadDeliveredProducts = async () => {
            try {
                await loadTodayDeliveredSummary()

                if (!active) return
            } catch (error: any) {
                if (active) toast.error(error.message)
            }
        }

        loadDeliveredProducts()

        return () => {
            active = false
        }
    }, [auth, selectedShift, loadTodayDeliveredSummary])

    useEffect(() => {
        const timer = setInterval(() => {
            const nextKey = getLocalDateKey()
            if (nextKey === todayKey) return

            setTodayKey(nextKey)
            setCompletedHouses(new Set())
            setAllocatedHouseProducts({})
            setCurrentHouseLogs([])
            setHouseLogsCache({})
            setLoadedHouseLogIds(new Set())
            void loadTodayDeliveredSummary()
        }, 60_000)

        return () => clearInterval(timer)
    }, [todayKey, loadTodayDeliveredSummary])

    const buildDeliveryItemsFromLogs = useCallback((logs: DeliveryLog[]): DeliveryItemForm[] => {
        if (logs.length === 0) return [{ ...emptyDeliveryItem }]

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
        }))

        return nextItems.length > 0 ? nextItems : [{ ...emptyDeliveryItem }]
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
            })

            const today = new Date()
            const todayLogs = logs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), today))

            setHouseLogsCache((prev) => ({
                ...prev,
                [houseId]: todayLogs,
            }))
            setLoadedHouseLogIds((prev) => new Set([...prev, houseId]))
            setCompletedHouses((prev) => {
                const next = new Set(prev)
                if (todayLogs.length > 0) next.add(houseId)
                else next.delete(houseId)
                return next
            })
        } catch {
            // Keep swipe smooth even if a neighbor preload fails.
        } finally {
            loadingHouseLogIdsRef.current.delete(houseId)
        }
    }, [selectedShift, loadedHouseLogIds])

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
                })

                const today = new Date()
                const todayLogs = logs.filter((log) => {
                    const deliveredAt = new Date(log.deliveredAt)
                    return isSameLocalDate(deliveredAt, today)
                })

                if (!active) return

                setCurrentHouseLogs(todayLogs)
                setHouseLogsCache((prev) => ({
                    ...prev,
                    [currentHouse.id]: todayLogs,
                }))
                setLoadedHouseLogIds((prev) => new Set([...prev, currentHouse.id]))
                if (todayLogs.length > 0) {
                    setCompletedHouses((prev) => new Set([...prev, currentHouse.id]))
                } else {
                    setCompletedHouses((prev) => {
                        const next = new Set(prev)
                        next.delete(currentHouse.id)
                        return next
                    })
                }
            } catch (err: any) {
                if (active) toast.error(err.message)
            } finally {
                if (active) setLogsLoading(false)
            }
        }

        loadCurrentHouseLogs()

        return () => {
            active = false
        }
    }, [currentHouse?.id, selectedShift, todayKey, houseLogsCache])

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

        try {
            const today = new Date()
            const toDelete = currentHouseLogs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), today))

            if (toDelete.length === 0) {
                toast.info('No delivery items found for today')
                setClearTodayDialogOpen(false)
                return
            }

            await Promise.all(toDelete.map((log) => deliveryLogsApi.delete(log.id)))

            // Update local UI state for current house
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

            setDeliveryItems([{ ...emptyDeliveryItem }])
            await loadTodayDeliveredSummary()
            toast.success(`Deleted ${toDelete.length} delivery log(s) from today`)
        } catch (err: any) {
            toast.error(err.message || 'Failed to clear today deliveries')
        } finally {
            setClearTodayDialogOpen(false)
        }
    }, [currentHouse, currentHouseLogs, selectedShift, loadTodayDeliveredSummary])

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
        setDeliveryItems(buildDeliveryItemsFromLogs(currentHouseLogs))
    }, [currentHouseLogs, buildDeliveryItemsFromLogs])

    const getEffectiveRate = (house: House | undefined, productName: string): { rate: number; source: 'house' | 'global' | 'none' } => {
        const normalizedName = normalizeProductName(productName)
        const globalRate = Number(globalRateMap[normalizedName] ?? 0)
        if (globalRate > 0) {
            return { rate: globalRate, source: 'global' }
        }

        const houseRate = resolveHouseRate(house, productName as MilkType)
        if (houseRate > 0) {
            return { rate: houseRate, source: 'house' }
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

        event.preventDefault()

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
        setDeliveryItems([{ ...emptyDeliveryItem }])
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
                return prev.map((item, i) =>
                    i === idx ? { ...item, qty: value } : item
                )
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
        setDeliveryItems((prev) => [...prev, { ...emptyDeliveryItem }])
        setHasUnsavedChanges(true)
        setSaveStatus('idle')
    }

    const removeDeliveryItem = (idx: number) => {
        setDeliveryItems((prev) => {
            if (prev.length <= 1) return [{ ...emptyDeliveryItem }]
            return prev.filter((_, i) => i !== idx)
        })
        setSwipedDeliveryItem({ index: null, offset: 0 })
        setHasUnsavedChanges(true)
        setSaveStatus('idle')
    }

    const handleDeliveryItemTouchStart = (index: number, event: TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0]
        if (!touch) return

        setSwipedDeliveryItem((current) => (current.index === index ? current : { index: null, offset: 0 }))
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
            return
        }

        const nextOffset = Math.max(deltaX, -64)
        setSwipedDeliveryItem({ index, offset: nextOffset })
    }

    const handleDeliveryItemTouchEnd = (index: number) => {
        const start = deliveryItemSwipeStartRef.current
        if (!start || start.index !== index) return

        const shouldRevealDelete = swipedDeliveryItem.index === index && swipedDeliveryItem.offset <= -56
        setSwipedDeliveryItem(shouldRevealDelete ? { index, offset: -84 } : { index: null, offset: 0 })
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

        const wasCompleted = completedHouses.has(currentHouse.id)
        const previousLogs = currentHouseLogs

        setMarking(true)
        setSaveStatus('idle')

        try {
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

            if (payloadItems.length === 0) {
                toast.error('Add at least one item with qty and rate before marking delivered')
                return
            }

            if (isCompleted && currentHouseLogs.length > 0) {
                const primaryLog = currentHouseLogs[0]
                const updated = await deliveryLogsApi.update(primaryLog.id, {
                    items: payloadItems as any,
                })

                const duplicateLogIds = currentHouseLogs
                    .slice(1)
                    .map((log) => log.id)

                if (duplicateLogIds.length > 0) {
                    await Promise.all(duplicateLogIds.map((logId) => deliveryLogsApi.delete(logId)))
                }

                setCurrentHouseLogs([updated as DeliveryLog])
                setHouseLogsCache((prev) => ({
                    ...prev,
                    [currentHouse.id]: [updated as DeliveryLog],
                }))
                setLoadedHouseLogIds((prev) => new Set([...prev, currentHouse.id]))
            } else {
                await deliveryLogsApi.create({
                    houseId: currentHouse.id,
                    shift: selectedShift,
                    items: payloadItems,
                })

                setCompletedHouses((prev) => new Set([...prev, currentHouse.id]))
                const refreshedLogs = await deliveryLogsApi.list({
                    houseId: currentHouse.id,
                    shift: selectedShift,
                })
                const today = new Date()
                setCurrentHouseLogs(
                    refreshedLogs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), today))
                )
                setHouseLogsCache((prev) => ({
                    ...prev,
                    [currentHouse.id]: refreshedLogs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), today)),
                }))
                setLoadedHouseLogIds((prev) => new Set([...prev, currentHouse.id]))
            }

            await loadTodayDeliveredSummary()

            const now = new Date()
            const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            setHasUnsavedChanges(false)
            setSaveStatus('saved')
            setLastSavedAt(timeLabel)

            toast.success(
                isCompleted
                    ? `${currentHouse.houseNo} delivery updated!`
                    : `${currentHouse.houseNo} delivered!`
            )

            if (!isCompleted) {
                setTimeout(() => handleNext(), 400)
            }
        } catch (err: any) {
            toast.error(err.message)
            setSaveStatus('failed')
        } finally {
            setMarking(false)
        }
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
                            const dateKey = getLocalDateKey()
                            const savedIndex = getStoredIndex(dateKey, 'morning')
                            setCurrentIndex(savedIndex)
                            localStorage.setItem(`delivery_shift_${dateKey}`, 'morning')
                            setSelectedShift('morning')
                        }}>
                            Morning
                        </Button>

                        <Button className="w-full" onClick={() => {
                            const dateKey = getLocalDateKey()
                            const savedIndex = getStoredIndex(dateKey, 'evening')
                            setCurrentIndex(savedIndex)
                            localStorage.setItem(`delivery_shift_${dateKey}`, 'evening')
                            setSelectedShift('evening')
                        }}>
                            Evening
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        )
    }

    if (loading) return <Skeleton className="h-40 w-full" />

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

                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setPanelView('delivery')}
                    >
                        <Rows3 className="h-4 w-4" /> Switch to Delivery View
                    </Button>
                </div>

                <Input
                    placeholder="Search by house number, area, phone, product, or alert"
                    value={houseSearch}
                    onChange={(event) => setHouseSearch(event.target.value)}
                />

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
                                    const todayKey = DAYS_BY_INDEX[new Date().getDay()]
                                    const todayAlerts = allAlerts
                                        .filter((alert) => alert.schedule?.[todayKey])
                                        .map((alert) => alert.text.trim())
                                        .filter(Boolean)

                                    return (
                                        <TableRow key={house.id}>
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
    const canSubmitDelivery = !marking && (!isCompleted || hasUnsavedChanges)
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
        <div ref={pageContainerRef} style={containerStyle} className="mx-auto flex w-full max-w-md flex-col overflow-y-auto overflow-x-hidden px-2 pb-2 pt-0 sm:px-4 sm:py-4">

            {/* <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/supplier/rates">Rate List</Link>
                </Button>
            </div> */}

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
                                <div className="relative h-36 w-full overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(15,23,42,0.02))] p-1 text-left sm:h-60 sm:p-2">
                                    <div className="absolute inset-0 bg-emerald-900/10" />
                                    <div className="absolute inset-x-0 bottom-2 flex items-center justify-between px-2">
                                        <span className="rounded-md bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                            {swipePreviewDirection === 'next' ? 'Next House' : 'Previous House'}
                                        </span>
                                        <Maximize2 className="h-3.5 w-3.5 text-foreground/80" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-muted/20 p-2 sm:grid-cols-3 sm:gap-3 sm:p-3">
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
                                            <div>
                                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">House No.</p>
                                                <h2 className="mt-0.5 text-lg font-bold leading-none sm:mt-1 sm:text-2xl">{swipePreviewHouse.houseNo}</h2>
                                                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                    Route #{swipePreviewRouteNumber}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Status</p>
                                                {completedHouses.has(swipePreviewHouse.id) ? <p className="mt-0.5 font-semibold text-green-600 sm:mt-1">Delivered</p> : <p className="mt-0.5 font-semibold text-yellow-600 sm:mt-1">Pending</p>}
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
                                        <Badge className="flex-1 justify-center py-0.5 text-[10px] sm:w-full sm:py-1 sm:text-[11px]">
                                            <span className="sm:hidden">Buf ₹{getEffectiveRate(swipePreviewHouse, 'buffalo').rate}/L</span>
                                            <span className="hidden sm:inline">Buffalo ₹{getEffectiveRate(swipePreviewHouse, 'buffalo').rate}/L</span>
                                        </Badge>
                                        <Badge className="flex-1 justify-center py-0.5 text-[10px] sm:w-full sm:py-1 sm:text-[11px]">
                                            <span className="sm:hidden">Cow ₹{getEffectiveRate(swipePreviewHouse, 'cow').rate}/L</span>
                                            <span className="hidden sm:inline">Cow ₹{getEffectiveRate(swipePreviewHouse, 'cow').rate}/L</span>
                                        </Badge>
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
                                                    <TableHead className="w-18.5 sm:w-22.5">Rate</TableHead>
                                                    <TableHead className="hidden sm:table-cell sm:w-25">Amount</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {!isSwipePreviewLogsLoaded ? (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                                                            Loading products...
                                                        </TableCell>
                                                    </TableRow>
                                                ) : swipePreviewItems.filter((item) => Number(item.qty) > 0).length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                                                            No products delivered yet for today
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
                                                                    <TableCell>₹{rate}/L</TableCell>
                                                                    <TableCell className="hidden sm:table-cell">₹{amount.toLocaleString('en-IN')}</TableCell>
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
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setIsMapExpanded(true)}
                            onKeyDown={(e) => e.key === 'Enter' && setIsMapExpanded(true)}
                            className="relative h-36 w-full overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(15,23,42,0.02))] p-1 text-left sm:h-60 sm:p-2 cursor-pointer"
                        >
                            <div className="absolute inset-0 pointer-events-none">
                                <iframe
                                    title="Mini map preview"
                                    src={miniMapEmbedUrl}
                                    className="h-full w-full border-0"
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                />
                            </div>
                            <div className="absolute inset-0 bg-emerald-900/10" />
                            {miniMapLoading ? (
                                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/85">
                                    Loading map...
                                </div>
                            ) : null}
                            {miniMapLocationWarning ? (
                                <div className="absolute left-2 right-2 top-2 rounded-md border border-amber-500/35 bg-amber-50/95 px-2 py-1 text-[11px] font-medium text-amber-800 shadow-sm">
                                    {miniMapLocationWarning}
                                </div>
                            ) : null}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-2 h-7 w-7 rounded-md bg-background/90 hover:bg-background/95 shadow-sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleClearToday()
                                }}
                                title="Clear today's deliveries"
                            >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                            <div className="absolute bottom-2 left-2 rounded-md bg-background/90 px-2 py-1">
                                <Maximize2 className="h-3.5 w-3.5 text-foreground" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-muted/20 p-2 sm:grid-cols-3 sm:gap-3 sm:p-3">
                            <div className="space-y-1.5 sm:col-span-2">
                                <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">House No.</p>
                                        <h1 className="mt-0.5 text-lg font-bold leading-none sm:mt-1 sm:text-2xl">{currentHouse.houseNo}</h1>
                                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                            Route #{currentRouteNumber}
                                        </p>
                                    </div>
                                    <div className="relative flex flex-col items-start pr-10">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="absolute right-0 top-0 h-8 w-8 rounded-full border-border/70 bg-background/90 shadow-none"
                                            onClick={() => setPanelView((view) => (view === 'delivery' ? 'allocated-houses' : 'delivery'))}
                                            aria-label="Switch view"
                                            title="Switch view"
                                        >
                                            <Rows3 className="h-4 w-4" />
                                        </Button>
                                        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Status</p>
                                        {isCompleted ? <p className="mt-0.5 font-semibold text-green-600 sm:mt-1">Delivered</p> : <p className="mt-0.5 font-semibold text-yellow-600 sm:mt-1">Pending</p>}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3 text-[13px] leading-tight sm:text-sm">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <MapPin className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{currentHouse.area || 'Area not set'}</span>
                                    </div>
                                    <div className="flex min-w-0 items-center gap-2 text-right">
                                        <Phone className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{currentHouse.phoneNo || 'Phone not set'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1 sm:col-span-1 sm:flex-col sm:justify-center sm:gap-2">
                                {(() => {
                                    const buffalo = getEffectiveRate(currentHouse, 'buffalo')
                                    const cow = getEffectiveRate(currentHouse, 'cow')

                                    return (
                                        <>
                                            <Badge className="flex-1 justify-center py-0.5 text-[10px] sm:w-full sm:py-1 sm:text-[11px]">
                                                <span className="sm:hidden">Buf ₹{buffalo.rate}/L</span>
                                                <span className="hidden sm:inline">Buffalo ₹{buffalo.rate}/L</span>
                                            </Badge>
                                            <Badge className="flex-1 justify-center py-0.5 text-[10px] sm:w-full sm:py-1 sm:text-[11px]">
                                                <span className="sm:hidden">Cow ₹{cow.rate}/L</span>
                                                <span className="hidden sm:inline">Cow ₹{cow.rate}/L</span>
                                            </Badge>
                                        </>
                                    )
                                })()}
                            </div>
                        </div>
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
                                            <TableHead className="w-18.5 sm:w-22.5">Rate</TableHead>
                                            <TableHead className="hidden sm:table-cell sm:w-25">Amount</TableHead>
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
                                                    <TableCell colSpan={4} className="p-0">
                                                        <div
                                                            className="relative overflow-hidden rounded-xl border border-border/70 bg-card"
                                                            style={{ touchAction: 'pan-y' }}
                                                            onTouchStart={(event) => handleDeliveryItemTouchStart(idx, event)}
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
                                                                    opacity: rowOffset <= -16 ? 1 : 0,
                                                                    transform: `translate3d(${rowOffset <= -16 ? 0 : 8}px, 0, 0)`,
                                                                    transition: deliveryItemSwipeStartRef.current?.index === idx
                                                                        ? 'none'
                                                                        : 'opacity 180ms ease, transform 180ms ease',
                                                                    pointerEvents: rowOffset <= -16 ? 'auto' : 'none',
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
                                                                className="relative z-10 grid grid-cols-[minmax(0,1.3fr)_minmax(5rem,0.8fr)_minmax(4.5rem,0.6fr)] gap-2 p-2 transition-transform duration-200 sm:grid-cols-[minmax(0,1.25fr)_minmax(5.5rem,0.9fr)_minmax(4.75rem,0.7fr)_minmax(5.75rem,0.9fr)] sm:gap-3 sm:p-3"
                                                                style={{
                                                                    transform: `translate3d(${rowOffset}px, 0, 0)`,
                                                                    backgroundColor: rowOffset < 0 ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                                                    transition: deliveryItemSwipeStartRef.current?.index === idx
                                                                        ? 'none'
                                                                        : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                                                                }}
                                                            >
                                                                <div>
                                                                    <Select
                                                                        value={item.milkType}
                                                                        onValueChange={(val) =>
                                                                            updateDeliveryItem(idx, 'milkType', val)
                                                                        }
                                                                    >
                                                                        <SelectTrigger className="h-9 w-full">
                                                                            <SelectValue placeholder={productRateOptions.length > 0 ? 'Select product' : 'No active products'} />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {productRateOptions.length > 0 ? (
                                                                                productRateOptions.map((option) => (
                                                                                    <SelectItem key={option.value} value={option.value}>
                                                                                        {option.label}
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
                                                                    />
                                                                </div>

                                                                <div className="flex items-center text-sm font-medium">
                                                                    ₹{rate}/L
                                                                </div>

                                                                <div className="hidden items-center text-sm font-semibold sm:flex">
                                                                    ₹{amount.toLocaleString('en-IN')}
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
                                <Button onClick={addItem} size="sm" className="text-xs">
                                    <Plus className="mr-1 h-3 w-3" /> Add Item
                                </Button>
                                <div className="text-sm font-bold">
                                    Total: ₹{currentDeliveryTotal.toLocaleString('en-IN')}
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                {marking
                                    ? 'Saving changes...'
                                    : saveStatus === 'failed'
                                        ? 'Save failed. Please try again.'
                                        : hasUnsavedChanges
                                            ? 'Unsaved changes. Click the button below to save.'
                                            : saveStatus === 'saved'
                                                ? `Changes saved${lastSavedAt ? ` at ${lastSavedAt}` : ''}.`
                                                : isCompleted
                                                    ? 'No new changes to save.'
                                                    : ''}
                            </p>
                        </div>

                        {/* ACTION */}
                        <div className="shrink-0 sticky bottom-0 z-10 bg-card">
                            <Button onClick={handleMarkDelivered} disabled={!canSubmitDelivery} className="w-full rounded-none rounded-b-2xl py-2 text-xs sm:text-sm">
                                {marking ? 'Saving...' : isCompleted ? 'Update Delivery' : 'Mark Delivered'}
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
                        <AlertDialogTitle>Delete Today's Deliveries?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete all delivery items added today for House {currentHouse?.houseNo}. This action cannot be undone.
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
        </div>
    )
}
