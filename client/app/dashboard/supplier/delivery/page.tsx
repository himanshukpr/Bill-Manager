'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ChevronLeft,
    ChevronRight,
    MapPin,
    Phone,
    CheckCircle,
    AlertCircle,
    Home,
    X,
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

    const [currentIndex, setCurrentIndex] = useState(0)
    const [completedHouses, setCompletedHouses] = useState<Set<number>>(new Set())
    const [currentHouseLogs, setCurrentHouseLogs] = useState<DeliveryLog[]>([])
    const [logsLoading, setLogsLoading] = useState(false)

    const [deliveryItems, setDeliveryItems] = useState<DeliveryItemForm[]>([{ ...emptyDeliveryItem }])
    const [currentBalance, setCurrentBalance] = useState('')
    const [notes, setNotes] = useState('')
    const [marking, setMarking] = useState(false)

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
                        .filter((c) => c.shift === selectedShift)
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
    if (!currentHouse) return <div>No houses</div>

    const isCompleted = completedHouses.has(currentHouse.id)

    return (
        <div className="max-w-md mx-auto p-4 space-y-4">

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
                            <div key={log.id} className="rounded-xl border border-border p-3">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>{new Date(log.deliveredAt).toLocaleTimeString('en-IN')}</span>
                                    <span>Total ₹{Number(log.totalAmount).toLocaleString('en-IN')}</span>
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
            <Button onClick={handleMarkDelivered} disabled={marking || isCompleted} className="w-full">
                {isCompleted ? 'Already Delivered Today' : marking ? 'Saving...' : 'Mark Delivered'}
            </Button>
        </div>
    )
}
