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
    milkType: 'buffalo' | 'cow'
    qty: string
}

const emptyDeliveryItem: DeliveryItemForm = {
    milkType: 'buffalo',
    qty: '',
}

const DEFAULT_MAP_CENTER = { lat: 28.6139, lon: 77.2090 }

type MilkType = DeliveryItemForm['milkType']

type AlertDays = {
    Monday: boolean
    Tuesday: boolean
    Wednesday: boolean
    Thursday: boolean
    Friday: boolean
    Saturday: boolean
    Sunday: boolean
}

type HouseAlert = {
    id: string
    text: string
    schedule: AlertDays
}

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
    if (!jsonStr) return []
    const trimmed = jsonStr.trim()
    if (!trimmed) return []

    try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        // Backward compatibility for legacy plain-text alert values.
        return [
            {
                id: 'legacy-alert',
                text: trimmed,
                schedule: {
                    Monday: true,
                    Tuesday: true,
                    Wednesday: true,
                    Thursday: true,
                    Friday: true,
                    Saturday: true,
                    Sunday: true,
                },
            },
        ]
    }
}

function normalizeProductName(name?: string | null): string {
    return (name ?? '').trim().toLowerCase()
}

function resolveGlobalRateMap(rates: ProductRate[]): Record<MilkType, number> {
    const next: Record<MilkType, number> = {
        buffalo: 0,
        cow: 0,
    }

    for (const rate of rates) {
        if (!rate.isActive) continue

        const name = normalizeProductName(rate.name)
        const parsedRate = Number(rate.rate)

        if (!Number.isFinite(parsedRate) || parsedRate <= 0) continue

        if (!next.buffalo && name.includes('buffalo')) {
            next.buffalo = parsedRate
        }

        if (!next.cow && (name.includes('cow') || name.includes('cows'))) {
            next.cow = parsedRate
        }
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

export default function DeliveryPage() {
    const router = useRouter()

    const [auth, setAuth] = useState<any>(null)
    const [selectedShift, setSelectedShift] = useState<'morning' | 'evening' | null>(null)
    const [shiftSelectorOpen, setShiftSelectorOpen] = useState(true)

    const [houses, setHouses] = useState<House[]>([])
    const [globalRateMap, setGlobalRateMap] = useState<Record<MilkType, number>>({
        buffalo: 0,
        cow: 0,
    })
    const [loading, setLoading] = useState(true)
    const [panelView, setPanelView] = useState<'delivery' | 'allocated-houses'>('delivery')
    const [houseSearch, setHouseSearch] = useState('')
    const [allocatedHouseProducts, setAllocatedHouseProducts] = useState<Record<number, string>>({})

    const [currentIndex, setCurrentIndex] = useState(0)
    const [completedHouses, setCompletedHouses] = useState<Set<number>>(new Set())
    const [currentHouseLogs, setCurrentHouseLogs] = useState<DeliveryLog[]>([])
    const [logsLoading, setLogsLoading] = useState(false)

    const [deliveryItems, setDeliveryItems] = useState<DeliveryItemForm[]>([{ ...emptyDeliveryItem }])
    const [currentBalance, setCurrentBalance] = useState('')
    const [marking, setMarking] = useState(false)

    // Edit log state (inline editing)
    const [editingLogId, setEditingLogId] = useState<number | null>(null)
    const [editingItems, setEditingItems] = useState<DeliveryItemForm[]>([])
    const [editingSaving, setEditingSaving] = useState(false)
    const [sheetDirty, setSheetDirty] = useState(false)
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const navSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
    const [isMapExpanded, setIsMapExpanded] = useState(false)
    const [miniMapCenter, setMiniMapCenter] = useState<{ lat: number; lon: number }>(DEFAULT_MAP_CENTER)
    const [miniMapLoading, setMiniMapLoading] = useState(false)

    // AUTH
    useEffect(() => {
        const session = getSessionAuth()
        if (!session?.token || session.role !== 'supplier') {
            router.replace('/')
            return
        }
        setAuth(session)
    }, [])

    // LOAD HOUSES
    const loadHouses = useCallback(async () => {
        if (!auth || !selectedShift) return

        try {
            setLoading(true)

            const [data, configs, rates] = await Promise.all([
                housesApi.list(),
                houseConfigApi.list(),
                productRatesApi.list(),
            ])

            setGlobalRateMap(resolveGlobalRateMap(rates))

            const configsMap = new Map<number, HouseConfig[]>()

            configs.forEach((c) => {
                const arr = configsMap.get(c.houseId) || []
                arr.push(c)
                configsMap.set(c.houseId, arr)
            })

            const filtered = data
                .map((house) => ({
                    ...house,
                    configs: (configsMap.get(house.id) || [])
                        .filter((c) => {
                            if (c.shift !== selectedShift) return false
                            if (selectedShift === 'morning') return c.supplierId === auth.uuid
                            return true
                        })
                        .sort((a, b) => a.position - b.position),
                }))
                .filter((h) => h.configs.length > 0)

            setHouses(filtered)
            setCurrentIndex(0)
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setLoading(false)
        }
    }, [auth, selectedShift])

    useEffect(() => {
        loadHouses()
    }, [loadHouses])

    const currentHouse = houses[currentIndex]

    useEffect(() => {
        if (!currentHouse) return

        let active = true
        const storedLocation = parseHouseLocation(currentHouse.location)
        const query = `${currentHouse.houseNo}${currentHouse.area ? `, ${currentHouse.area}` : ''}`.trim()

        if (storedLocation) {
            setMiniMapCenter(storedLocation)
            setMiniMapLoading(false)
            return
        }

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
        if (!query) return houses

        return houses.filter((house) => {
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
    }, [houses, houseSearch, allocatedHouseProducts])

    useEffect(() => {
        if (!auth || !selectedShift || panelView !== 'allocated-houses') return

        let active = true

        const loadDeliveredProducts = async () => {
            try {
                const logs = await deliveryLogsApi.list({ shift: selectedShift })
                const today = new Date()
                const deliveredToday = logs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), today))

                const nextProducts: Record<number, Map<string, number>> = {}

                for (const log of deliveredToday) {
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

                if (!active) return

                const resolvedProducts: Record<number, string> = {}
                for (const [houseId, products] of Object.entries(nextProducts)) {
                    const formattedProducts = Array.from(products.entries())
                        .filter(([, qty]) => qty > 0)
                        .map(([productName, qty]) => `${productName} ${qty}L`)

                    resolvedProducts[Number(houseId)] = formattedProducts.join(', ')
                }

                setAllocatedHouseProducts(resolvedProducts)
            } catch (error: any) {
                if (active) toast.error(error.message)
            }
        }

        loadDeliveredProducts()

        return () => {
            active = false
        }
    }, [auth, selectedShift, panelView])

    useEffect(() => {
        if (!currentHouse || !selectedShift) {
            setCurrentHouseLogs([])
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
                if (todayLogs.length > 0) {
                    setCompletedHouses((prev) => new Set([...prev, currentHouse.id]))
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
    }, [currentHouse?.id, selectedShift])

    useEffect(() => {
        if (currentHouseLogs.length === 0) {
            setEditingLogId(null)
            setEditingItems([])
            setSheetDirty(false)
            return
        }

        const primaryLog = currentHouseLogs[0]
        const grouped = new Map<MilkType, number>()

        for (const log of currentHouseLogs) {
            for (const item of log.items) {
                const milkType = item.milkType as MilkType
                grouped.set(milkType, (grouped.get(milkType) ?? 0) + Number(item.qty || 0))
            }
        }

        const nextItems = Array.from(grouped.entries()).map(([milkType, qty]) => ({
            milkType,
            qty: String(qty),
        }))

        setEditingLogId(primaryLog.id)
        setEditingItems(nextItems.length > 0 ? nextItems : [{ ...emptyDeliveryItem }])
        setSheetDirty(false)
    }, [currentHouseLogs])

    const getEffectiveRate = (house: House | undefined, milkType: MilkType): { rate: number; source: 'house' | 'global' | 'none' } => {
        const houseRate = resolveHouseRate(house, milkType)
        if (houseRate > 0) {
            return { rate: houseRate, source: 'house' }
        }

        const globalRate = Number(globalRateMap[milkType] ?? 0)
        if (globalRate > 0) {
            return { rate: globalRate, source: 'global' }
        }

        return { rate: 0, source: 'none' }
    }

    // NAVIGATION HANDLERS
    const handleNext = () => {
        if (currentIndex < houses.length - 1) {
            setCurrentIndex((i) => i + 1)
            resetForm()
        }
    }

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex((i) => i - 1)
            resetForm()
        }
    }

    const handleNavTouchStart = (event: TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0]
        navSwipeStartRef.current = { x: touch.clientX, y: touch.clientY }
    }

    const handleNavTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
        const start = navSwipeStartRef.current
        navSwipeStartRef.current = null
        if (!start) return

        const touch = event.changedTouches[0]
        const deltaX = touch.clientX - start.x
        const deltaY = touch.clientY - start.y

        if (Math.abs(deltaX) < 40) return
        if (Math.abs(deltaX) < Math.abs(deltaY)) return

        if (deltaX < 0) {
            handleNext()
            return
        }

        handlePrevious()
    }

    const resetForm = () => {
        setDeliveryItems([{ ...emptyDeliveryItem }])
        setCurrentBalance('')
    }

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
            return
        }

        setDeliveryItems((prev) =>
            prev.map((item, i) =>
                i === idx ? { ...item, milkType: value as MilkType } : item
            )
        )
    }

    const addItem = () => {
        setDeliveryItems((prev) => [...prev, { ...emptyDeliveryItem }])
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

            const optimisticLogId = -Date.now()
            const deliveredAt = new Date().toISOString()
            const openingBalance = Number(currentBalance || 0)
            const totalAmount = payloadItems.reduce((sum, item) => sum + item.amount, 0)

            const optimisticLog: DeliveryLog = {
                id: optimisticLogId,
                houseId: currentHouse.id,
                supplierId: auth?.uuid || '',
                shift: selectedShift,
                items: payloadItems,
                totalAmount: String(totalAmount),
                openingBalance: String(openingBalance),
                closingBalance: String(openingBalance + totalAmount),
                deliveredAt,
            }

            // Reflect delivered state instantly while request is in-flight.
            setCompletedHouses((prev) => new Set([...prev, currentHouse.id]))
            setCurrentHouseLogs((prev) => [optimisticLog, ...prev])

            const created = await deliveryLogsApi.create({
                houseId: currentHouse.id,
                shift: selectedShift,
                items: payloadItems,
                currentBalance: currentBalance ? Number(currentBalance) : undefined,
            })

            setCurrentHouseLogs(
                (prev) => prev.map((log) => (log.id === optimisticLogId ? created.log : log)),
            )

            toast.success(`${currentHouse.houseNo} delivered!`)

            setTimeout(() => handleNext(), 400)
        } catch (err: any) {
            setCurrentHouseLogs(previousLogs)
            if (!wasCompleted) {
                setCompletedHouses((prev) => {
                    const next = new Set(prev)
                    next.delete(currentHouse.id)
                    return next
                })
            }
            toast.error(err.message)
        } finally {
            setMarking(false)
        }
    }

    const persistTodaySheet = useCallback(async () => {
        if (!currentHouse || !selectedShift || editingItems.length === 0) return

        const validItems = editingItems
            .filter((item) => Number(item.qty) > 0)
            .map((item) => {
                const qty = Number(item.qty)
                const { rate } = getEffectiveRate(currentHouse, item.milkType)
                return {
                    milkType: item.milkType,
                    qty,
                    rate,
                    amount: qty * rate,
                }
            })
            .filter((item) => item.rate > 0)

        if (validItems.length === 0) return

        try {
            setEditingSaving(true)

            if (!editingLogId) {
                const created = await deliveryLogsApi.create({
                    houseId: currentHouse.id,
                    shift: selectedShift,
                    items: validItems,
                })

                setEditingLogId(created.log.id)
                setCurrentHouseLogs([created.log])
                setCompletedHouses((prev) => new Set([...prev, currentHouse.id]))
            } else {
                const updated = await deliveryLogsApi.update(editingLogId, {
                    items: validItems as any,
                })

                const duplicateLogIds = currentHouseLogs
                    .filter((log) => log.id !== editingLogId)
                    .map((log) => log.id)

                if (duplicateLogIds.length > 0) {
                    await Promise.all(duplicateLogIds.map((logId) => deliveryLogsApi.delete(logId)))
                }

                setCurrentHouseLogs([updated as DeliveryLog])
            }
        } catch (err: any) {
            toast.error(err.message || 'Auto-save failed')
        } finally {
            setEditingSaving(false)
        }
    }, [currentHouse, selectedShift, editingItems, editingLogId, currentHouseLogs])

    useEffect(() => {
        if (!sheetDirty) return

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current)
        }

        autoSaveTimerRef.current = setTimeout(() => {
            void persistTodaySheet().finally(() => setSheetDirty(false))
        }, 3000)

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current)
            }
        }
    }, [sheetDirty, persistTodaySheet])

    const updateTodayRecordItem = (idx: number, field: keyof DeliveryItemForm, value: string) => {
        const previousItem = editingItems[idx]

        if (field === 'qty') {
            const trimmed = value.trim()
            const hadQty = Number(previousItem?.qty || 0) > 0

            setEditingItems((prev) => {
                if (trimmed === '' && prev.length > 1) {
                    return prev.filter((_, i) => i !== idx)
                }
                return prev.map((item, i) =>
                    i === idx ? { ...item, qty: value } : item,
                )
            })

            if (trimmed !== '' || hadQty) {
                setSheetDirty(true)
            }
            return
        }

        setEditingItems((prev) =>
            prev.map((item, i) => (i === idx ? { ...item, milkType: value as MilkType } : item)),
        )

        if (Number(previousItem?.qty || 0) > 0) {
            setSheetDirty(true)
        }
    }

    const addTodayRecordItem = () => {
        setEditingItems((prev) => [...prev, { ...emptyDeliveryItem }])
    }

    const todaySheetTotal = useMemo(
        () =>
            editingItems
                .filter((item) => Number(item.qty) > 0)
                .reduce((sum, item) => {
                    const qty = Number(item.qty)
                    const { rate } = getEffectiveRate(currentHouse, item.milkType)
                    return sum + qty * rate
                }, 0),
        [editingItems, currentHouse, globalRateMap],
    )

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
                        <Button className="w-full" onClick={() => setSelectedShift('morning')}>
                            Morning
                        </Button>

                        <Button className="w-full" onClick={() => setSelectedShift('evening')}>
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
            <div className="max-w-4xl mx-auto p-4 space-y-4">
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

                <div className="rounded-2xl border border-border bg-card p-2">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>House Number</TableHead>
                                <TableHead>Products</TableHead>
                                <TableHead>Daily Alert</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {searchedAllocatedHouses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                                        No houses match your search.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                searchedAllocatedHouses.map((house) => {
                                    const allAlerts = parseHouseAlerts(house.configs?.[0]?.dailyAlerts)
                                    const todayKey = DAYS_BY_INDEX[new Date().getDay()]
                                    const todayAlerts = allAlerts
                                        .filter((alert) => alert.schedule?.[todayKey])
                                        .map((alert) => alert.text.trim())
                                        .filter(Boolean)

                                    return (
                                        <TableRow key={house.id}>
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

    return (
        <div className="mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden px-2 pb-2 pt-0 sm:h-auto sm:overflow-visible sm:px-4 sm:py-4">
            
            <div className="flex shrink-0 items-center justify-between gap-1.5 py-0 sm:py-1">
                <Badge variant="outline" className="capitalize">
                    {selectedShift} Shift
                </Badge>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-3 rounded-full"
                    onClick={() => setPanelView('allocated-houses')}
                >
                    <Rows3 className="h-4 w-4" /> Switch View
                </Button>
            </div>

            {/* <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/supplier/rates">Rate List</Link>
                </Button>
            </div> */}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* HOUSE CARD */}
            <div className="shrink-0 rounded-t-2xl rounded-b-none bg-card px-2 py-2 space-y-1.5 sm:space-y-3 sm:p-4">
                <button
                    type="button"
                    onClick={() => setIsMapExpanded(true)}
                    className="relative h-36 w-full overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(15,23,42,0.02))] p-1 text-left sm:h-60 sm:p-2"
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
                    <div className="absolute bottom-2 left-2 rounded-md bg-background/90 px-2 py-1">
                        <Maximize2 className="h-3.5 w-3.5 text-foreground" />
                    </div>
                </button>

                <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-muted/20 p-2 sm:grid-cols-3 sm:gap-3 sm:p-3">
                    <div className="space-y-1.5 sm:col-span-2">
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">House No.</p>
                                <h1 className="mt-0.5 text-lg font-bold leading-none sm:mt-1 sm:text-2xl">{currentHouse.houseNo}</h1>
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Status</p>
                                {isCompleted ? <p className="mt-0.5 font-semibold text-green-600 sm:mt-1">Delivered</p> : <p className="mt-0.5 font-semibold text-yellow-600 sm:mt-1">Pending</p>}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-[13px] leading-tight sm:text-sm">
                            <MapPin className="h-4 w-4" />
                            <span>{currentHouse.area || 'Area not set'}</span>
                        </div>

                        <div className="flex items-center gap-2 text-[13px] leading-tight sm:text-sm">
                            <Phone className="h-4 w-4" />
                            <span>{currentHouse.phoneNo || 'Phone not set'}</span>
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
            <div className="bg-card rounded-t-none overflow-hidden">
                <div className="border-t border-border/40 p-3 space-y-3">
                    <div className="overflow-x-auto rounded-xl border border-border/70">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[90px] sm:w-[120px]">Product</TableHead>
                                    <TableHead className="w-[96px] sm:w-[110px]">Qty (L)</TableHead>
                                    <TableHead className="w-[74px] sm:w-[90px]">Rate</TableHead>
                                    <TableHead className="hidden sm:table-cell sm:w-[100px]">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deliveryItems.map((item, idx) => {
                                    const effectiveRate = getEffectiveRate(currentHouse, item.milkType)
                                    const rate = effectiveRate.rate
                                    const qty = Number(item.qty)
                                    const amount = qty > 0 ? qty * rate : 0

                                    return (
                                        <TableRow key={idx}>
                                            <TableCell>
                                                <Select
                                                    value={item.milkType}
                                                    onValueChange={(val) =>
                                                        updateDeliveryItem(idx, 'milkType', val)
                                                    }
                                                >
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="buffalo">Buffalo</SelectItem>
                                                        <SelectItem value="cow">Cow</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>

                                            <TableCell className="w-[96px] sm:min-w-[120px]">
                                                <Input
                                                    type="number"
                                                    placeholder="0"
                                                    value={item.qty}
                                                    onChange={(e) =>
                                                        updateDeliveryItem(idx, 'qty', e.target.value)
                                                    }
                                                    className="h-9 border-border/90 bg-background text-foreground placeholder:text-muted-foreground"
                                                />
                                            </TableCell>

                                            <TableCell className="text-sm font-medium">
                                                ₹{rate}/L
                                            </TableCell>

                                            <TableCell className="hidden text-sm font-semibold sm:table-cell">
                                                ₹{amount.toLocaleString('en-IN')}
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
                </div>

            {/* ACTION */}
            <Button onClick={handleMarkDelivered} disabled={marking || isCompleted} className="w-full rounded-none rounded-b-2xl py-2 text-xs sm:text-sm">
                {isCompleted ? 'Already Delivered Today' : marking ? 'Saving...' : 'Mark Delivered'}
            </Button>
            </div>

            <div
                className="flex shrink-0 items-center justify-between px-0.5 py-0.5"
                onTouchStart={handleNavTouchStart}
                onTouchEnd={handleNavTouchEnd}
                onTouchCancel={() => {
                    navSwipeStartRef.current = null
                }}
            >
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handlePrevious} disabled={currentIndex === 0}>
                    <ChevronLeft />
                </Button>

                <div className="text-center">
                    <p className="text-xs font-semibold sm:text-sm">
                        {currentIndex + 1} / {houses.length}
                    </p>
                </div>

                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleNext} disabled={currentIndex === houses.length - 1}>
                    <ChevronRight />
                </Button>
            </div>

            </div>

            <Dialog open={isMapExpanded} onOpenChange={setIsMapExpanded}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
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
        </div>
    )
}
