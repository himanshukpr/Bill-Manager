'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, BadgeAlert, Clock3, RefreshCcw, GripVertical, Check, Calendar } from 'lucide-react'
import {
    DndContext,
    MouseSensor,
    PointerSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    arrayMove,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { houseConfigApi, housesApi, type House, type HouseConfig } from '@/lib/api'
import { getSessionAuth, type SessionAuth } from '@/lib/auth'
import { parseDailyAlerts } from '@/lib/alerts'
import { toast } from 'sonner'

const SHIFT_LABEL: Record<string, string> = {
    morning: 'Morning',
    evening: 'Evening',
}

function formatAlertPreview(rawValue: string | null | undefined): string {
    const text = parseDailyAlerts(rawValue)
        .map((alert) => alert.text.trim())
        .filter(Boolean)
        .join(', ')

    if (!text) return ''
    return text.length > 96 ? `${text.slice(0, 93)}...` : text
}

export default function SupplierHousesPage() {
    const router = useRouter()
    const [auth, setAuth] = useState<SessionAuth | null>(null)
    const [houses, setHouses] = useState<House[]>([])
    const [allHouses, setAllHouses] = useState<House[]>([])
    const [allConfigs, setAllConfigs] = useState<HouseConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedShift, setSelectedShift] = useState<'morning' | 'evening'>('morning')
    const [morningPlan, setMorningPlan] = useState<HouseConfig[]>([])
    const [eveningPlan, setEveningPlan] = useState<HouseConfig[]>([])
    const [eveningBaselineOrder, setEveningBaselineOrder] = useState<number[]>([])
    const [savingMorning, setSavingMorning] = useState(false)
    const [savingEvening, setSavingEvening] = useState(false)

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 4 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 120,
                tolerance: 8,
            },
        }),
        useSensor(PointerSensor, {
            activationConstraint: { distance: 4 },
        })
    )

    useEffect(() => {
        const session = getSessionAuth()
        if (!session?.token || session.role !== 'supplier') {
            router.replace('/')
            return
        }
        setAuth(session)
    }, [router])

    useEffect(() => {
        if (!auth) return

        const session = auth

        let active = true

        async function load() {
            try {
                setLoading(true)
                const data = await housesApi.list()
                const configs = await houseConfigApi.list()
                if (!active) return

                // Store all data globally
                setAllHouses(data)
                setAllConfigs(configs)

                // Filter based on selected shift
                filterHousesByShift(data, configs, session, selectedShift)
            } catch (error: any) {
                toast.error(error.message)
            } finally {
                if (active) setLoading(false)
            }
        }

        load()

        return () => {
            active = false
        }
    }, [auth, selectedShift])

    function filterHousesByShift(data: House[], configs: HouseConfig[], session: SessionAuth, shift: 'morning' | 'evening') {
        const configsByHouse = new Map<number, HouseConfig[]>()
        for (const config of configs) {
            const next = configsByHouse.get(config.houseId) ?? []
            next.push(config)
            configsByHouse.set(config.houseId, next)
        }

        let filtered: House[] = []

        if (shift === 'morning') {
            // Morning: only show houses assigned to this supplier
            filtered = data
                .map((house) => ({
                    ...house,
                    configs: (configsByHouse.get(house.id) ?? house.configs ?? [])
                        .filter((config) => config.shift === 'morning' && config.supplierId === session.uuid)
                        .sort((left, right) => left.position - right.position),
                }))
                .filter((house) => (house.configs?.length ?? 0) > 0)
                .sort((left, right) => {
                    const leftOrder = left.configs?.[0]?.position ?? 0
                    const rightOrder = right.configs?.[0]?.position ?? 0
                    return leftOrder - rightOrder
                })

            const morningConfigs = configs
                .filter((c) => c.shift === 'morning' && c.supplierId === session.uuid)
                .sort((a, b) => a.position - b.position)
            setMorningPlan(morningConfigs)
        } else {
            // Evening: show evening routes visible to all suppliers
            filtered = data
                .map((house) => ({
                    ...house,
                    configs: (configsByHouse.get(house.id) ?? house.configs ?? [])
                        .filter((config) => config.shift === 'evening')
                        .sort((left, right) => left.position - right.position),
                }))
                .filter((house) => (house.configs?.length ?? 0) > 0)
                .sort((left, right) => {
                    const leftOrder = left.configs?.[0]?.position ?? 0
                    const rightOrder = right.configs?.[0]?.position ?? 0
                    return leftOrder - rightOrder
                })

            const eveningConfigs = configs
                .filter((c) => c.shift === 'evening')
                .sort((a, b) => a.position - b.position)
            setEveningPlan(eveningConfigs)
        }

        // Keep both planner sections hydrated regardless of selected shift
        const allMorningForSupplier = configs
            .filter((c) => c.shift === 'morning' && c.supplierId === session.uuid)
            .sort((a, b) => a.position - b.position)
        const allEvening = configs
            .filter((c) => c.shift === 'evening')
            .sort((a, b) => a.position - b.position)
        setMorningPlan(allMorningForSupplier)
        setEveningPlan(allEvening)
        setEveningBaselineOrder(allEvening.map((config) => config.id))

        setHouses(filtered)
    }

    const stats = useMemo(() => {
        const visibleCount = houses.length
        const pendingAmount = houses.reduce((sum, house) => sum + Number(house.balance?.previousBalance ?? 0), 0)

        return { visibleCount, pendingAmount }
    }, [houses])

    const isEveningPlanChanged = useMemo(() => {
        if (eveningPlan.length !== eveningBaselineOrder.length) return true
        return eveningPlan.some((config, index) => config.id !== eveningBaselineOrder[index])
    }, [eveningPlan, eveningBaselineOrder])

    function handleDragEnd(section: 'morning' | 'evening', event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const reorder = (prev: HouseConfig[]) => {
            const oldIndex = prev.findIndex((item) => item.id === Number(active.id))
            const newIndex = prev.findIndex((item) => item.id === Number(over.id))
            if (oldIndex < 0 || newIndex < 0) return prev
            return arrayMove(prev, oldIndex, newIndex)
        }

        if (section === 'morning') {
            setMorningPlan(reorder)
            return
        }
        setEveningPlan(reorder)
    }

    function movePlanItem(section: 'morning' | 'evening', index: number, direction: 'up' | 'down') {
        const updater = (prev: HouseConfig[]) => {
            if (direction === 'up' && index === 0) return prev
            if (direction === 'down' && index === prev.length - 1) return prev
            const next = [...prev]
            const swapIndex = direction === 'up' ? index - 1 : index + 1
            const temp = next[index]
            next[index] = next[swapIndex]
            next[swapIndex] = temp
            return next
        }

        if (section === 'morning') {
            setMorningPlan(updater)
            return
        }
        setEveningPlan(updater)
    }

    async function saveMorningPlan() {
        if (morningPlan.length === 0) {
            toast.error('No morning routes to save')
            return
        }
        setSavingMorning(true)
        try {
            await houseConfigApi.reorder(morningPlan.map((c) => c.id))
            toast.success('Morning route order saved')
            if (auth && selectedShift) {
                const data = await housesApi.list()
                const configs = await houseConfigApi.list()
                setAllHouses(data)
                setAllConfigs(configs)
                filterHousesByShift(data, configs, auth, selectedShift)
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to save morning order')
        } finally {
            setSavingMorning(false)
        }
    }

    async function saveEveningPlan() {
        if (eveningPlan.length === 0) {
            toast.error('No evening routes to save')
            return
        }
        setSavingEvening(true)
        try {
            await houseConfigApi.reorder(eveningPlan.map((c) => c.id))
            toast.success('Evening route order saved')
            if (auth && selectedShift) {
                const data = await housesApi.list()
                const configs = await houseConfigApi.list()
                setAllHouses(data)
                setAllConfigs(configs)
                filterHousesByShift(data, configs, auth, selectedShift)
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to save evening order')
        } finally {
            setSavingEvening(false)
        }
    }

    const renderSkeleton = () => (
        <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="mt-4 h-7 w-40 rounded-lg" />
                    <Skeleton className="mt-3 h-4 w-52 rounded-lg" />
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <Skeleton className="h-24 rounded-2xl" />
                        <Skeleton className="h-24 rounded-2xl" />
                    </div>
                </div>
            ))}
        </div>
    )

    if (!auth) {
        return <div className="min-h-[50vh]" />
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Supplier Workspace</p>
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            {selectedShift === 'morning' ? 'Your Morning Routes' : 'Shared Evening Routes'}
                        </h1>
                        {/* <p className="max-w-xl text-sm text-muted-foreground">
                            {selectedShift === 'morning'
                                ? 'Manage and arrange your personally assigned morning delivery houses.'
                                : 'Collaboratively manage the global evening delivery sequence visible to all suppliers.'}
                        </p> */}
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setSelectedShift((prev) => (prev === 'morning' ? 'evening' : 'morning'))}
                            className="gap-2"
                        >
                            <Calendar className="h-4 w-4" /> {selectedShift === 'morning' ? 'Switch to Evening' : 'Switch to Morning'}
                        </Button>
                        <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
                            <RefreshCcw className="h-4 w-4" /> Refresh
                        </Button>
                        <Button asChild className="gap-2">
                            <Link href="/dashboard/supplier">
                                Go to Dashboard <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <StatCard
                        label={selectedShift === 'morning' ? 'My Morning Routes' : 'Evening Routes'}
                        value={loading ? '—' : String(stats.visibleCount)}
                        hint={selectedShift === 'morning' ? 'Houses assigned to me' : 'Shared delivery sequence'}
                    />
                    {/* <StatCard
                        label="Pending Balance"
                        value={loading ? '—' : `₹${stats.pendingAmount.toLocaleString('en-IN')}`}
                        hint="Total previous balance"
                    /> */}
                </div>
            </section>

            <div className="rounded-2xl border border-border bg-card p-2 shadow-sm sm:p-6">
                <div className="mb-6 sm:mb-8">
                    <h2 className="text-lg font-semibold mb-2">Drag Route Planner</h2>
                    <div className="mb-4 inline-flex rounded-xl border border-border/70 bg-muted/30 p-1 sm:mb-5">
                        <Button
                            type="button"
                            size="sm"
                            variant={selectedShift === 'morning' ? 'default' : 'ghost'}
                            onClick={() => setSelectedShift('morning')}
                            className="rounded-lg px-4"
                        >
                            Morning
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={selectedShift === 'evening' ? 'default' : 'ghost'}
                            onClick={() => setSelectedShift('evening')}
                            className="rounded-lg px-4"
                        >
                            Evening
                        </Button>
                    </div>

                    <div className="grid gap-3">
                        {selectedShift === 'morning' ? (
                            <div className="rounded-xl border border-border/70 bg-muted/20 p-2 sm:p-3">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">Morning Routes (Your Assigned)</p>
                                    <Button size="sm" className="w-full sm:w-auto" onClick={saveMorningPlan} disabled={savingMorning || morningPlan.length === 0}>
                                        <Check className="mr-1 h-4 w-4" /> {savingMorning ? 'Saving...' : 'Save Morning'}
                                    </Button>
                                </div>
                                {morningPlan.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No morning routes assigned.</p>
                                ) : (
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleDragEnd('morning', event)}>
                                        <SortableContext items={morningPlan.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                                            <div className="space-y-1 sm:space-y-1.5">
                                                {morningPlan.map((config, idx) => {
                                                    const house = allHouses.find((h) => h.id === config.houseId)
                                                    return (
                                                        <PlannerSortableItem
                                                            key={config.id}
                                                            id={config.id}
                                                            idx={idx}
                                                            title={`House ${house?.houseNo ?? config.houseId}`}
                                                            area={house?.area}
                                                            onMoveUp={() => movePlanItem('morning', idx, 'up')}
                                                            onMoveDown={() => movePlanItem('morning', idx, 'down')}
                                                            canMoveUp={idx > 0}
                                                            canMoveDown={idx < morningPlan.length - 1}
                                                        />
                                                    )
                                                })}
                                            </div>
                                        </SortableContext>
                                    </DndContext>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-border/70 bg-muted/20 p-2 sm:p-3">
                                <div className="mb-2 flex items-start justify-between gap-3">
                                    <p className="text-sm font-semibold">Evening Routes (Shared)</p>
                                    <Button
                                        size="sm"
                                        className="h-8 shrink-0 px-3 text-xs"
                                        onClick={saveEveningPlan}
                                        disabled={savingEvening || eveningPlan.length === 0 || !isEveningPlanChanged}
                                    >
                                        <Check className="mr-1 h-4 w-4" /> {savingEvening ? 'Saving...' : 'Save Evening'}
                                    </Button>
                                </div>
                                {eveningPlan.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No evening routes available.</p>
                                ) : (
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleDragEnd('evening', event)}>
                                        <SortableContext items={eveningPlan.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                                            <div className="space-y-1 sm:space-y-1.5">
                                                {eveningPlan.map((config, idx) => {
                                                    const house = allHouses.find((h) => h.id === config.houseId)
                                                    return (
                                                        <PlannerSortableItem
                                                            key={config.id}
                                                            id={config.id}
                                                            idx={idx}
                                                            title={`House ${house?.houseNo ?? config.houseId}`}
                                                            area={house?.area}
                                                            onMoveUp={() => movePlanItem('evening', idx, 'up')}
                                                            onMoveDown={() => movePlanItem('evening', idx, 'down')}
                                                            canMoveUp={idx > 0}
                                                            canMoveDown={idx < eveningPlan.length - 1}
                                                        />
                                                    )
                                                })}
                                            </div>
                                        </SortableContext>
                                    </DndContext>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
    )
}

function PlannerSortableItem({
    id,
    idx,
    title,
    area,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
}: {
    id: number
    idx: number
    title: string
    area?: string
    onMoveUp: () => void
    onMoveDown: () => void
    canMoveUp: boolean
    canMoveDown: boolean
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`w-full touch-none select-none rounded-lg border border-border bg-background px-0.5 py-1.5 transition-shadow sm:px-1 sm:py-1.5 ${isDragging ? 'z-10 shadow-lg ring-2 ring-primary/20' : ''}`}
        >
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-1">
                <div className="flex min-w-0 items-center gap-0.5">
                    <button
                        type="button"
                        aria-label="Drag to reorder"
                        className="cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="h-4 w-4" />
                    </button>
                    <span className="min-w-6 text-xs font-semibold text-muted-foreground">#{idx + 1}</span>
                    <div className="min-w-0">
                        <p className="text-[14px] font-medium leading-tight break-words sm:text-[15px]">{title}</p>
                        {area ? <p className="text-[10px] text-muted-foreground break-words sm:text-[11px]">{area}</p> : null}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-1 px-2 sm:ml-auto sm:flex sm:w-auto sm:items-center sm:px-0 sm:pr-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={onMoveUp}
                        disabled={!canMoveUp}
                        onPointerDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                    >
                        Up
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={onMoveDown}
                        disabled={!canMoveDown}
                        onPointerDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                    >
                        Down
                    </Button>
                </div>
            </div>
        </div>
    )
}

function ConfigBlock({ title, items, emptyText }: { title: string; items: HouseConfig[]; emptyText: string }) {
    return (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
                <Clock3 className="h-4 w-4 text-muted-foreground" />
            </div>
            {items.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
            ) : (
                <div className="mt-3 space-y-2">
                    {items.map((config) => (
                        <div key={config.id} className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant="outline" className="rounded-full">{SHIFT_LABEL[config.shift]}</Badge>
                            {config.supplier?.username ? <span className="font-medium">{config.supplier.username}</span> : <span className="font-medium text-muted-foreground">Shared route</span>}
                            <span className="text-muted-foreground">Position {config.position + 1}</span>
                            {(() => {
                                const alertPreview = formatAlertPreview(config.dailyAlerts)
                                if (!alertPreview) return null

                                return (
                                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                                        <BadgeAlert className="h-3.5 w-3.5" /> {alertPreview}
                                    </span>
                                )
                            })()}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
