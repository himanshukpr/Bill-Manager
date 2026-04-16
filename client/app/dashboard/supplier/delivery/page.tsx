'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
    ChevronLeft,
    ChevronRight,
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
import { Textarea } from '@/components/ui/textarea'
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

type MilkType = DeliveryItemForm['milkType']

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

export default function DeliveryPage() {
    const router = useRouter()

    const [auth, setAuth] = useState<any>(null)
    const [selectedShift, setSelectedShift] = useState<'morning' | 'evening' | null>(null)

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
    const [notes, setNotes] = useState('')
    const [marking, setMarking] = useState(false)

    // Edit log state (inline editing)
    const [editingLogId, setEditingLogId] = useState<number | null>(null)
    const [editingItems, setEditingItems] = useState<DeliveryItemForm[]>([])
    const [editingNotes, setEditingNotes] = useState('')
    const [editingSaving, setEditingSaving] = useState(false)

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

    const searchedAllocatedHouses = useMemo(() => {
        const query = houseSearch.trim().toLowerCase()
        if (!query) return houses

        return houses.filter((house) => {
            const searchable = [
                house.houseNo,
                house.area ?? '',
                house.phoneNo,
                allocatedHouseProducts[house.id] ?? '',
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
            setEditingNotes('')
            return
        }

        const activeLog = currentHouseLogs[0]
        setEditingLogId(activeLog.id)
        setEditingItems(
            activeLog.items.map((item: any) => ({
                milkType: item.milkType,
                qty: String(item.qty),
            }))
        )
        setEditingNotes(activeLog.note || '')
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

    const resetForm = () => {
        setDeliveryItems([{ ...emptyDeliveryItem }])
        setCurrentBalance('')
        setNotes('')
    }

    // DELIVERY ITEMS
    const updateDeliveryItem = (idx: number, field: keyof DeliveryItemForm, value: string) => {
        setDeliveryItems((prev) =>
            prev.map((item, i) =>
                i === idx ? { ...item, [field]: value } : item
            )
        )
    }

    const addItem = () => {
        setDeliveryItems((prev) => [...prev, { ...emptyDeliveryItem }])
    }

    const removeItem = (idx: number) => {
        setDeliveryItems((prev) => prev.filter((_, i) => i !== idx))
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

            await deliveryLogsApi.create({
                houseId: currentHouse.id,
                shift: selectedShift,
                items: payloadItems,
                currentBalance: currentBalance ? Number(currentBalance) : undefined,
                note: notes.trim() || undefined,
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

            toast.success(`${currentHouse.houseNo} delivered!`)

            setTimeout(() => handleNext(), 400)
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setMarking(false)
        }
    }

    const cancelEdit = () => {
        const activeLog = currentHouseLogs.find((log) => log.id === editingLogId) ?? currentHouseLogs[0]
        if (!activeLog) return

        setEditingItems(
            activeLog.items.map((item: any) => ({
                milkType: item.milkType,
                qty: String(item.qty),
            }))
        )
        setEditingNotes(activeLog.note || '')
    }

    const handleUpdateLog = async () => {
        if (!editingLogId || editingItems.length === 0) return

        try {
            setEditingSaving(true)

            const validItems = editingItems
                .filter((item) => Number(item.qty) > 0)
                .map((item) => {
                    const { rate } = getEffectiveRate(currentHouse, item.milkType)
                    const qty = Number(item.qty)
                    return {
                        milkType: item.milkType,
                        qty,
                        rate,
                        amount: qty * rate,
                    }
                })

            if (validItems.length === 0) {
                toast.error('At least one item with qty > 0 is required')
                return
            }

            await deliveryLogsApi.update(editingLogId, {
                items: validItems as any,
                note: editingNotes.trim() || undefined,
            })

            toast.success('Delivery log updated')
            cancelEdit()

            // Reload logs
            const refreshedLogs = await deliveryLogsApi.list({
                houseId: currentHouse.id,
                shift: selectedShift as 'morning' | 'evening',
            })
            const today = new Date()
            setCurrentHouseLogs(
                refreshedLogs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), today))
            )
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setEditingSaving(false)
        }
    }

    const normalizeEditingItems = (items: DeliveryItemForm[]) =>
        items
            .map((item) => ({
                milkType: item.milkType,
                qty: Number(item.qty) || 0,
            }))
            .filter((item) => item.qty > 0)

    const activeEditingLog = currentHouseLogs.find((log) => log.id === editingLogId) ?? null
    const activeEditingSnapshot = activeEditingLog
        ? JSON.stringify({
              items: activeEditingLog.items
                  .map((item: any) => ({
                      milkType: item.milkType,
                      qty: Number(item.qty) || 0,
                  }))
                  .filter((item: any) => item.qty > 0),
              note: activeEditingLog.note || '',
          })
        : ''
    const currentEditingSnapshot = JSON.stringify({
        items: normalizeEditingItems(editingItems),
        note: editingNotes.trim(),
    })
    const hasPendingEditChanges = activeEditingLog
        ? activeEditingSnapshot !== currentEditingSnapshot
        : false

    const handleDeleteLog = async (logId: number) => {
        if (!confirm('Delete this delivery log?')) return

        try {
            await deliveryLogsApi.delete(logId)
            toast.success('Delivery log deleted')

            // Reload logs
            const refreshedLogs = await deliveryLogsApi.list({
                houseId: currentHouse.id,
                shift: selectedShift as 'morning' | 'evening',
            })
            const today = new Date()
            setCurrentHouseLogs(
                refreshedLogs.filter((log) => isSameLocalDate(new Date(log.deliveredAt), today))
            )
        } catch (err: any) {
            toast.error(err.message)
        }
    }

    // SHIFT SELECTOR
    if (!selectedShift) {
        return (
            <Dialog open>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Select Shift</DialogTitle>
                    </DialogHeader>

                    <Button onClick={() => setSelectedShift('morning')}>
                        Morning
                    </Button>

                    <Button onClick={() => setSelectedShift('evening')}>
                        Evening
                    </Button>
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
                    placeholder="Search by house number, area, phone, or product"
                    value={houseSearch}
                    onChange={(event) => setHouseSearch(event.target.value)}
                />

                <div className="rounded-2xl border border-border bg-card p-2">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>House Number</TableHead>
                                <TableHead>Products</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {searchedAllocatedHouses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                                        No houses match your search.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                searchedAllocatedHouses.map((house) => (
                                    <TableRow key={house.id}>
                                        <TableCell className="font-semibold">{house.houseNo}</TableCell>
                                        <TableCell>{allocatedHouseProducts[house.id] ?? '_'}</TableCell>
                                    </TableRow>
                                ))
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
        <div className="max-w-md mx-auto p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="capitalize">
                    {selectedShift} Shift
                </Badge>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setPanelView('allocated-houses')}
                >
                    <Rows3 className="h-4 w-4" /> Switch View
                </Button>
            </div>

            {/* HEADER NAV */}
            <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={handlePrevious} disabled={currentIndex === 0}>
                    <ChevronLeft />
                </Button>

                <div className="text-center">
                    <p className="text-sm font-semibold">
                        {currentIndex + 1} / {houses.length}
                    </p>
                </div>

                <Button variant="ghost" onClick={handleNext} disabled={currentIndex === houses.length - 1}>
                    <ChevronRight />
                </Button>
            </div>

            {/* <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/supplier/rates">Rate List</Link>
                </Button>
            </div> */}

            {/* PROGRESS BAR */}
            <div className="w-full bg-gray-200 h-2 rounded-full">
                <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${((currentIndex + 1) / houses.length) * 100}%` }}
                />
            </div>

            {/* HOUSE CARD */}
            <div className="bg-card p-5 rounded-2xl">
                <h1 className="text-3xl font-bold">{currentHouse.houseNo}</h1>

                <div className="flex gap-2 mt-2">
                    <MapPin className="h-4 w-4" />
                    {currentHouse.area}
                </div>

                <div className="mt-2">
                    <Phone className="inline mr-2" />
                    {currentHouse.phoneNo}
                </div>

                <div className="mt-3 flex gap-2">
                    {(() => {
                        const buffalo = getEffectiveRate(currentHouse, 'buffalo')
                        const cow = getEffectiveRate(currentHouse, 'cow')

                        return (
                            <>
                                <Badge>
                                    Buffalo ₹{buffalo.rate}/L
                                    {buffalo.source === 'global' ? ' (Rate List)' : ''}
                                </Badge>
                                <Badge>
                                    Cow ₹{cow.rate}/L
                                    {cow.source === 'global' ? ' (Rate List)' : ''}
                                </Badge>
                            </>
                        )
                    })()}
                </div>

                <div className="mt-3">
                    {isCompleted ? (
                        <span className="text-green-600 font-semibold">Delivered</span>
                    ) : (
                        <span className="text-yellow-600 font-semibold">Pending</span>
                    )}
                </div>
            </div>

            <div className="bg-card p-5 rounded-2xl space-y-3">
                <p className="text-sm font-semibold">Today&apos;s Delivery Records</p>
                {logsLoading ? (
                    <Skeleton className="h-20 w-full" />
                ) : currentHouseLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No delivery records saved for this house yet.</p>
                ) : (
                    <div className="space-y-3">
                        {currentHouseLogs.map((log) => (
                            <div key={log.id}>
                                {editingLogId === log.id ? (
                                    // INLINE EDIT MODE
                                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4 sm:p-5">
                                        <div className="flex items-center justify-between border-b border-border pb-3">
                                            <div>
                                                <div className="text-sm font-semibold text-foreground">Editing delivery</div>
                                                <div className="text-xs text-muted-foreground">Update items, notes, or totals directly here</div>
                                            </div>
                                            <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                                                {new Date(log.deliveredAt).toLocaleTimeString('en-IN')}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery items</div>

                                        {editingItems.map((item, idx) => {
                                            const effectiveRate = getEffectiveRate(currentHouse, item.milkType)
                                            const rate = effectiveRate.rate
                                            const qty = Number(item.qty)
                                            const amount = qty > 0 ? qty * rate : 0

                                            return (
                                                <div key={idx} className="rounded-lg border border-border bg-background p-3 space-y-2">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                                                        {editingItems.length > 1 && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() =>
                                                                    setEditingItems((prev) =>
                                                                        prev.filter((_, i) => i !== idx)
                                                                    )
                                                                }
                                                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                                            >
                                                                <Trash2 size={14} />
                                                            </Button>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                        <div>
                                                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
                                                            <Select
                                                                value={item.milkType}
                                                                onValueChange={(val) =>
                                                                    setEditingItems((prev) =>
                                                                        prev.map((it, i) =>
                                                                            i === idx ? { ...it, milkType: val as MilkType } : it
                                                                        )
                                                                    )
                                                                }
                                                            >
                                                                <SelectTrigger className="h-9 text-sm">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="buffalo">Buffalo</SelectItem>
                                                                    <SelectItem value="cow">Cow</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div>
                                                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Qty (L)</label>
                                                            <Input
                                                                type="number"
                                                                placeholder="0"
                                                                value={item.qty}
                                                                onChange={(e) =>
                                                                    setEditingItems((prev) =>
                                                                        prev.map((it, i) =>
                                                                            i === idx ? { ...it, qty: e.target.value } : it
                                                                        )
                                                                    )
                                                                }
                                                                className="h-9 text-sm"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount</label>
                                                            <div className="flex items-center rounded-md border border-border bg-muted px-2 py-2 text-sm font-semibold text-foreground">
                                                                ₹{amount.toLocaleString('en-IN')}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                                                        <span>Rate: ₹{rate}/L</span>
                                                        {qty > 0 && <span className="font-semibold text-foreground">{qty}L × ₹{rate} = ₹{amount}</span>}
                                                    </div>
                                                </div>
                                            )
                                        })}

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    setEditingItems((prev) => [...prev, { ...emptyDeliveryItem }])
                                                }
                                                className="w-full text-xs"
                                            >
                                                <Plus className="mr-2 h-4 w-4" /> Add Item
                                            </Button>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</label>
                                            <Input
                                                placeholder="Optional delivery notes..."
                                                value={editingNotes}
                                                onChange={(e) => setEditingNotes(e.target.value)}
                                                className="text-sm"
                                            />
                                        </div>

                                        <div className="rounded-lg border border-border bg-muted/60 p-3">
                                            <div className="mb-1 text-xs font-semibold text-muted-foreground">Total Amount</div>
                                            <div className="text-2xl font-bold text-foreground">
                                                ₹{editingItems
                                                    .filter((item) => Number(item.qty) > 0)
                                                    .reduce((sum, item) => {
                                                        const { rate } = getEffectiveRate(currentHouse, item.milkType)
                                                        return sum + Number(item.qty) * rate
                                                    }, 0)
                                                    .toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            {hasPendingEditChanges ? (
                                                <Button
                                                    onClick={handleUpdateLog}
                                                    disabled={editingSaving}
                                                    className="flex-1 text-sm font-semibold"
                                                >
                                                    {editingSaving ? 'Saving...' : 'Update'}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : (
                                    // VIEW MODE
                                    <div className="rounded-xl border border-border p-3">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>{new Date(log.deliveredAt).toLocaleTimeString('en-IN')}</span>
                                            <div className="flex gap-2 items-center">
                                                <span>Total ₹{Number(log.totalAmount).toLocaleString('en-IN')}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteLog(log.id)}
                                                    className="text-red-500 hover:text-red-600"
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="mt-2 space-y-1 text-sm">
                                            {log.items.map((item, idx) => (
                                                <div key={`${log.id}-${idx}`} className="flex items-center justify-between">
                                                    <span className="capitalize">{item.milkType} {item.qty}L x ₹{item.rate}</span>
                                                    <span>₹{item.amount}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {log.note ? (
                                            <p className="mt-2 text-xs text-muted-foreground">Note: {log.note}</p>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* FORM */}
            {!isCompleted && (
                <div className="bg-card p-5 rounded-2xl space-y-4">

                    {deliveryItems.map((item, idx) => {
                        const effectiveRate = getEffectiveRate(currentHouse, item.milkType)
                        const rate = effectiveRate.rate

                        const qty = Number(item.qty)
                        const amount = qty > 0 ? qty * rate : 0

                        return (
                            <div key={idx} className="grid grid-cols-12 gap-2">

                                <div className="col-span-4">
                                    <Select
                                        value={item.milkType}
                                        onValueChange={(val) =>
                                            updateDeliveryItem(idx, 'milkType', val)
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="buffalo">Buffalo</SelectItem>
                                            <SelectItem value="cow">Cow</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="col-span-4">
                                    <Input
                                        type="number"
                                        placeholder="Litres"
                                        value={item.qty}
                                        onChange={(e) =>
                                            updateDeliveryItem(idx, 'qty', e.target.value)
                                        }
                                    />
                                </div>

                                <div className="col-span-3 text-sm">
                                    ₹{rate}/L
                                    {effectiveRate.source === 'global' ? <div className="text-xs text-muted-foreground">Rate List</div> : null}
                                    {qty > 0 && <div>₹{amount}</div>}
                                </div>

                                <div className="col-span-1">
                                    {deliveryItems.length > 1 && (
                                        <Button onClick={() => removeItem(idx)}>
                                            <Trash2 size={16} />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )
                    })}

                    <Button onClick={addItem}>
                        <Plus className="mr-2" /> Add Item
                    </Button>

                    <div className="text-lg font-bold">
                        Total: ₹{currentDeliveryTotal}
                    </div>

                    <Input
                        placeholder="Override balance"
                        value={currentBalance}
                        onChange={(e) => setCurrentBalance(e.target.value)}
                    />

                    <Textarea
                        placeholder="Notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </div>
            )}

            {/* ACTION */}
            {/* ACTION */}
            <Button onClick={handleMarkDelivered} disabled={marking || isCompleted} className="w-full">
                {isCompleted ? 'Already Delivered Today' : marking ? 'Saving...' : 'Mark Delivered'}
            </Button>
        </div>
    )
}
