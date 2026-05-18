'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, BadgeAlert, Clock3, RefreshCcw, GripVertical, Check, Calendar, Search, X } from 'lucide-react'
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
import { AnimatePresence, motion } from 'framer-motion'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { houseConfigApi, housesApi, usersApi, type House, type HouseConfig, type User } from '@/lib/api'
import { getSessionAuth, type SessionAuth } from '@/lib/auth'
import { parseDailyAlerts } from '@/lib/alerts'
import { toast } from 'sonner'

const SHIFT_LABEL: Record<string, string> = {
    morning: 'Morning',
    evening: 'Evening',
}

function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
    const updated = [...list]
    const [item] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, item)
    return updated
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
    const [suppliers, setSuppliers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedShift, setSelectedShift] = useState<'morning' | 'evening'>('morning')
    const [morningPlan, setMorningPlan] = useState<HouseConfig[]>([])
    const [eveningPlan, setEveningPlan] = useState<HouseConfig[]>([])
    const [morningBaselineOrder, setMorningBaselineOrder] = useState<number[]>([])
    const [eveningBaselineOrder, setEveningBaselineOrder] = useState<number[]>([])
    const [savingMorning, setSavingMorning] = useState(false)
    const [savingEvening, setSavingEvening] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
    const [selectedShiftForModal, setSelectedShiftForModal] = useState<'morning' | 'evening'>('morning')
    const [searchQuery, setSearchQuery] = useState('')
    const [moveAnimation, setMoveAnimation] = useState<{ id: number; direction: 'up' | 'down' } | null>(null)
    const [modalSearchMode, setModalSearchMode] = useState<'position' | 'houseNumber'>('position')
    const [modalPlacement, setModalPlacement] = useState<'before' | 'after'>('before')
    const [modalHouseNumber, setModalHouseNumber] = useState('')
    const [dropdownOpen, setDropdownOpen] = useState(false)
    const moveAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
                const [data, configs, supplierData] = await Promise.all([
                    housesApi.list(),
                    houseConfigApi.list(),
                    usersApi.list('supplier'),
                ])
                if (!active) return

                // Store only active houses for supplier view (hide deactivated)
                setAllHouses(data.filter((h) => h.active))
                setAllConfigs(configs)
                setSuppliers(supplierData)

                // Filter based on selected shift
                filterHousesByShift(data.filter((h) => h.active), configs, session, selectedShift)
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
            const supplier = suppliers.find((s) => s.uuid === config.supplierId)
            const enriched: HouseConfig = supplier ? { ...config, supplier: { uuid: supplier.uuid, username: supplier.username } } : config
            const next = configsByHouse.get(config.houseId) ?? []
            next.push(enriched)
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
                .map((c) => {
                    const supplier = suppliers.find((s) => s.uuid === c.supplierId)
                    return supplier ? { ...c, supplier: { uuid: supplier.uuid, username: supplier.username } } : c
                })
                .sort((a, b) => a.position - b.position)
            setMorningPlan(morningConfigs)
            setMorningBaselineOrder(morningConfigs.map((config) => config.id))
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
                .map((c) => {
                    const supplier = suppliers.find((s) => s.uuid === c.supplierId)
                    return supplier ? { ...c, supplier: { uuid: supplier.uuid, username: supplier.username } } : c
                })
                .sort((a, b) => a.position - b.position)
            setEveningPlan(eveningConfigs)
        }

        // Keep both planner sections hydrated regardless of selected shift
        const allMorningForSupplier = configs
            .filter((c) => c.shift === 'morning' && c.supplierId === session.uuid)
            .map((c) => {
                const supplier = suppliers.find((s) => s.uuid === c.supplierId)
                return supplier ? { ...c, supplier: { uuid: supplier.uuid, username: supplier.username } } : c
            })
            .sort((a, b) => a.position - b.position)
        const allEvening = configs
            .filter((c) => c.shift === 'evening')
            .map((c) => {
                const supplier = suppliers.find((s) => s.uuid === c.supplierId)
                return supplier ? { ...c, supplier: { uuid: supplier.uuid, username: supplier.username } } : c
            })
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

    const isMorningPlanChanged = useMemo(() => {
        if (morningPlan.length !== morningBaselineOrder.length) return true
        return morningPlan.some((config, index) => config.id !== morningBaselineOrder[index])
    }, [morningPlan, morningBaselineOrder])

    const hasUnsavedChanges = selectedShift === 'morning' ? isMorningPlanChanged : isEveningPlanChanged

    const filteredMorningPlan = useMemo(() => {
        if (!searchQuery.trim()) return morningPlan
        const query = searchQuery.toLowerCase()
        
        const exactMatches: typeof morningPlan = []
        const partialMatches: typeof morningPlan = []

        morningPlan.forEach((config) => {
            const house = allHouses.find((h) => h.id === config.houseId)
            const houseNo = (house?.houseNo?.toString() ?? config.houseId.toString()).toLowerCase()
            const area = (house?.area ?? '').toLowerCase()

            if (houseNo === query || area === query) {
                exactMatches.push(config)
            } else if (houseNo.includes(query) || area.includes(query)) {
                partialMatches.push(config)
            }
        })

        return [...exactMatches, ...partialMatches]
    }, [morningPlan, allHouses, searchQuery])

    const filteredEveningPlan = useMemo(() => {
        if (!searchQuery.trim()) return eveningPlan
        const query = searchQuery.toLowerCase()
        
        const exactMatches: typeof eveningPlan = []
        const partialMatches: typeof eveningPlan = []

        eveningPlan.forEach((config) => {
            const house = allHouses.find((h) => h.id === config.houseId)
            const houseNo = (house?.houseNo?.toString() ?? config.houseId.toString()).toLowerCase()
            const area = (house?.area ?? '').toLowerCase()

            if (houseNo === query || area === query) {
                exactMatches.push(config)
            } else if (houseNo.includes(query) || area.includes(query)) {
                partialMatches.push(config)
            }
        })

        return [...exactMatches, ...partialMatches]
    }, [eveningPlan, allHouses, searchQuery])

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

    function movePlanItemById(section: 'morning' | 'evening', configId: number, direction: 'up' | 'down') {
        const currentPlan = section === 'morning' ? morningPlan : eveningPlan
        const originalIndex = currentPlan.findIndex((c) => c.id === configId)
        if (originalIndex === -1) return
        
        if (direction === 'up' && originalIndex === 0) return
        if (direction === 'down' && originalIndex === currentPlan.length - 1) return
        
        const next = [...currentPlan]
        const swapIndex = direction === 'up' ? originalIndex - 1 : originalIndex + 1
        const temp = next[originalIndex]
        next[originalIndex] = next[swapIndex]
        next[swapIndex] = temp
        
        if (section === 'morning') {
            setMorningPlan(next)
        } else {
            setEveningPlan(next)
        }

        setMoveAnimation({ id: configId, direction })
        if (moveAnimationTimerRef.current) {
            clearTimeout(moveAnimationTimerRef.current)
        }
        moveAnimationTimerRef.current = setTimeout(() => {
            setMoveAnimation(null)
        }, 420)
    }

    function handleMoveToPositionById(section: 'morning' | 'evening', configId: number, toIndex: number) {
        const currentPlan = section === 'morning' ? morningPlan : eveningPlan
        const fromIndex = currentPlan.findIndex((c) => c.id === configId)
        if (fromIndex === -1 || fromIndex < 0 || toIndex < 0 || fromIndex >= currentPlan.length || toIndex >= currentPlan.length) return
        if (fromIndex === toIndex) return
        
        const newPlan = moveItem(currentPlan, fromIndex, toIndex)
        
        if (section === 'morning') {
            setMorningPlan(newPlan)
        } else {
            setEveningPlan(newPlan)
        }
        toast.success(`Moved to position ${toIndex + 1}`)
    }

    useEffect(() => {
        return () => {
            if (moveAnimationTimerRef.current) {
                clearTimeout(moveAnimationTimerRef.current)
            }
        }
    }, [])

    // Legacy functions - use filtered list when searching
    function movePlanItem(section: 'morning' | 'evening', filteredIndex: number, direction: 'up' | 'down') {
        const currentPlan = section === 'morning' ? filteredMorningPlan : filteredEveningPlan
        if (filteredIndex < 0 || filteredIndex >= currentPlan.length) return
        const configId = currentPlan[filteredIndex].id
        movePlanItemById(section, configId, direction)
    }

    function handleMoveToPosition(section: 'morning' | 'evening', filteredFromIndex: number, toIndex: number) {
        const currentPlan = section === 'morning' ? filteredMorningPlan : filteredEveningPlan
        if (filteredFromIndex < 0 || filteredFromIndex >= currentPlan.length) return
        const configId = currentPlan[filteredFromIndex].id
        handleMoveToPositionById(section, configId, toIndex)
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
                // Keep only active houses for supplier
                setAllHouses(data.filter((h) => h.active))
                setAllConfigs(configs)
                filterHousesByShift(data.filter((h) => h.active), configs, auth, selectedShift)
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
                // Keep only active houses for supplier
                setAllHouses(data.filter((h) => h.active))
                setAllConfigs(configs)
                filterHousesByShift(data.filter((h) => h.active), configs, auth, selectedShift)
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to save evening order')
        } finally {
            setSavingEvening(false)
        }
    }

    const modalPlan = selectedShiftForModal === 'morning' ? morningPlan : eveningPlan
    const modalSelectedIndex = selectedItemId === null ? -1 : modalPlan.findIndex((config) => config.id === selectedItemId)
    const modalSelectedConfig = modalSelectedIndex >= 0 ? modalPlan[modalSelectedIndex] : null
    const modalTotal = modalPlan.length
    const modalCurrentPosition = modalSelectedIndex >= 0 ? modalSelectedIndex + 1 : 0
    const modalTargetConfig = modalSearchMode === 'houseNumber'
        ? modalPlan.find((config) => {
            const house = allHouses.find((item) => item.id === config.houseId)
            const displayNo = house?.houseNo?.toString() ?? config.houseId.toString()
            return displayNo === modalHouseNumber.trim()
        })
        : null
    const modalTargetIndex = modalTargetConfig ? modalPlan.findIndex((config) => config.id === modalTargetConfig.id) : -1
    const modalTargetHouseNo = modalTargetConfig
        ? allHouses.find((item) => item.id === modalTargetConfig.houseId)?.houseNo?.toString() ?? modalTargetConfig.houseId.toString()
        : ''
    
    const modalHouseDropdown = useMemo(() => {
        if (!modalHouseNumber.trim()) return []
        const query = modalHouseNumber.toLowerCase().trim()
        return modalPlan
            .map((config) => {
                const house = allHouses.find((item) => item.id === config.houseId)
                const displayNo = house?.houseNo?.toString() ?? config.houseId.toString()
                return { config, displayNo, house, houseId: config.houseId }
            })
            .filter((item) => item.displayNo.toLowerCase().includes(query))
            .slice(0, 8)
    }, [modalHouseNumber, modalPlan, allHouses])

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
                    <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="inline-flex rounded-xl border border-border/70 bg-muted/30 p-1">
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
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search houses..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-md hover:bg-muted"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
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
                                {filteredMorningPlan.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        {searchQuery ? 'No houses match your search.' : 'No morning routes assigned.'}
                                    </p>
                                ) : (
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleDragEnd('morning', event)}>
                                        <SortableContext items={filteredMorningPlan.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                                            <motion.div 
                                                className="space-y-1 sm:space-y-1.5"
                                                layout
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                {filteredMorningPlan.map((config, idx) => {
                                                    const house = allHouses.find((h) => h.id === config.houseId)
                                                    const originalIndex = morningPlan.findIndex((item) => item.id === config.id)
                                                    return (
                                                        <PlannerSortableItem
                                                            key={config.id}
                                                            id={config.id}
                                                            idx={idx}
                                                            displayIndex={originalIndex >= 0 ? originalIndex + 1 : idx + 1}
                                                            title={`House ${house?.houseNo ?? config.houseId}`}
                                                            area={house?.area}
                                                            moveAnimation={moveAnimation}
                                                            onMoveUp={() => movePlanItem('morning', idx, 'up')}
                                                            onMoveDown={() => movePlanItem('morning', idx, 'down')}
                                                            canMoveUp={idx > 0}
                                                            canMoveDown={idx < filteredMorningPlan.length - 1}
                                                            onMoveToPosition={() => {
                                                                setSelectedItemId(config.id)
                                                                setSelectedShiftForModal('morning')
                                                                setModalOpen(true)
                                                                setModalSearchMode('position')
                                                                setModalPlacement('before')
                                                                setModalHouseNumber('')
                                                                setDropdownOpen(false)
                                                            }}
                                                        />
                                                    )
                                                })}
                                            </motion.div>
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
                                {filteredEveningPlan.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        {searchQuery ? 'No houses match your search.' : 'No evening routes available.'}
                                    </p>
                                ) : (
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleDragEnd('evening', event)}>
                                        <SortableContext items={filteredEveningPlan.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                                            <motion.div 
                                                className="space-y-1 sm:space-y-1.5"
                                                layout
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                {filteredEveningPlan.map((config, idx) => {
                                                    const house = allHouses.find((h) => h.id === config.houseId)
                                                    const originalIndex = eveningPlan.findIndex((item) => item.id === config.id)
                                                    return (
                                                        <PlannerSortableItem
                                                            key={config.id}
                                                            id={config.id}
                                                            idx={idx}
                                                            displayIndex={originalIndex >= 0 ? originalIndex + 1 : idx + 1}
                                                            title={`House ${house?.houseNo ?? config.houseId}`}
                                                            area={house?.area}
                                                            moveAnimation={moveAnimation}
                                                            onMoveUp={() => movePlanItem('evening', idx, 'up')}
                                                            onMoveDown={() => movePlanItem('evening', idx, 'down')}
                                                            canMoveUp={idx > 0}
                                                            canMoveDown={idx < filteredEveningPlan.length - 1}
                                                            onMoveToPosition={() => {
                                                                setSelectedItemId(config.id)
                                                                setSelectedShiftForModal('evening')
                                                                setModalOpen(true)
                                                                setModalSearchMode('position')
                                                                setModalPlacement('before')
                                                                setModalHouseNumber('')
                                                                setDropdownOpen(false)
                                                            }}
                                                        />
                                                    )
                                                })}
                                            </motion.div>
                                        </SortableContext>
                                    </DndContext>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {modalOpen && selectedItemId !== null && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <div className="fixed inset-0 z-[101] bg-black/80" onClick={() => { setModalOpen(false); setSelectedItemId(null); setDropdownOpen(false); setModalHouseNumber('') }} />
                    <div className="relative z-[102] w-full max-w-md rounded-4xl bg-popover p-6 text-popover-foreground ring-1 ring-foreground/5">
                        <>
                        <div className="space-y-1">
                            <h2 className="text-lg font-semibold">Move to Position</h2>
                            <p className="text-sm text-muted-foreground">
                                Move {modalSelectedConfig?.houseId} to position
                            </p>
                        </div>
                        <div className="space-y-4 mt-4">
                            <div className="rounded-lg bg-muted/50 p-3">
                                <p className="text-xs text-muted-foreground">Current Position</p>
                                <p className="text-lg font-semibold">#{modalCurrentPosition} of {modalTotal}</p>
                            </div>
                            
                            <div className="flex gap-2 border-b border-border/50 pb-3">
                                <button
                                    type="button"
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                        modalSearchMode === 'position'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                    onClick={() => setModalSearchMode('position')}
                                >
                                    By Position
                                </button>
                                <button
                                    type="button"
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                        modalSearchMode === 'houseNumber'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                    onClick={() => setModalSearchMode('houseNumber')}
                                >
                                    By House #
                                </button>
                            </div>

                            {modalSearchMode === 'position' ? (
                                <div className="space-y-2">
                                    <label className="text-sm">New Position (1-{modalTotal})</label>
                                    <input
                                        id="new-position"
                                        type="number"
                                        min={1}
                                        max={modalTotal}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const value = parseInt((e.target as HTMLInputElement).value, 10)
                                                if (!isNaN(value) && value >= 1 && value <= modalTotal && value !== modalCurrentPosition) {
                                                    handleMoveToPositionById(selectedShiftForModal, selectedItemId, value - 1)
                                                }
                                                setModalOpen(false)
                                                setSelectedItemId(null)
                                            }
                                            if (e.key === 'Escape') {
                                                setModalOpen(false)
                                                setSelectedItemId(null)
                                            }
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-3 pb-2">
                                    <div>
                                        <label className="text-sm">House Number</label>
                                        <div className="relative mt-1">
                                            <input
                                                id="house-number"
                                                type="text"
                                                placeholder="Enter house number"
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                autoFocus
                                                value={modalHouseNumber}
                                                onChange={(e) => {
                                                    setModalHouseNumber(e.target.value)
                                                    setDropdownOpen(true)
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        setModalOpen(false)
                                                        setSelectedItemId(null)
                                                    }
                                                }}
                                            />
                                            {dropdownOpen && modalHouseDropdown.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-1 z-50 border border-input rounded-md bg-popover shadow-lg max-h-48 overflow-y-auto">
                                                    {modalHouseDropdown.map((item) => (
                                                        <button
                                                            key={item.config.id}
                                                            type="button"
                                                            className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm first:rounded-t-md last:rounded-b-md transition-colors"
                                                            onClick={() => {
                                                                setModalHouseNumber(item.displayNo)
                                                                setDropdownOpen(false)
                                                            }}
                                                        >
                                                            <span className="font-medium">House #{item.displayNo}</span>
                                                            {item.house?.area && (
                                                                <span className="text-xs text-muted-foreground ml-2">{item.house.area}</span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {modalTargetConfig ? (
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                This will move {modalPlacement} House #{modalTargetHouseNo}.
                                            </p>
                                        ) : modalHouseNumber.trim() ? (
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                House #{modalHouseNumber.trim()} not found in this route.
                                            </p>
                                        ) : null}
                                    </div>
                                    <div>
                                        <p className="text-sm mb-2">Placement</p>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                                                    modalPlacement === 'before'
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'border border-input hover:bg-accent'
                                                }`}
                                                onClick={() => setModalPlacement('before')}
                                            >
                                                Before
                                            </button>
                                            <button
                                                type="button"
                                                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                                                    modalPlacement === 'after'
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'border border-input hover:bg-accent'
                                                }`}
                                                onClick={() => setModalPlacement('after')}
                                            >
                                                After
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button
                                type="button"
                                className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
                                onClick={() => { setModalOpen(false); setSelectedItemId(null); setDropdownOpen(false); setModalHouseNumber('') }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                                onClick={(e) => {
                                    if (modalSearchMode === 'position') {
                                        const input = document.getElementById('new-position') as HTMLInputElement
                                        const value = parseInt(input.value, 10)
                                        if (!isNaN(value) && value >= 1 && value <= modalTotal && value !== modalCurrentPosition) {
                                            handleMoveToPositionById(selectedShiftForModal, selectedItemId, value - 1)
                                        }
                                    } else {
                                        const houseNo = modalHouseNumber.trim()
                                        if (!houseNo) {
                                            toast.error('Please enter a house number')
                                            return
                                        }
                                        if (!modalTargetConfig) {
                                            toast.error(`House #${houseNo} not found in this route`)
                                            return
                                        }
                                        const targetIndex = modalTargetIndex
                                        const finalIndex = modalPlacement === 'before' ? targetIndex : targetIndex + 1

                                        if (finalIndex === modalCurrentPosition - 1 || finalIndex === modalCurrentPosition) {
                                            toast.error('Item is already at this position')
                                            return
                                        }

                                        handleMoveToPositionById(selectedShiftForModal, selectedItemId, finalIndex)
                                    }
                                    setModalOpen(false)
                                    setSelectedItemId(null)
                                    setModalHouseNumber('')
                                    setDropdownOpen(false)
                                }}
                            >
                                Move
                            </button>
                        </div>
                        </>
                    </div>
                </div>
            )}

            {hasUnsavedChanges ? (
                <div className="fixed bottom-2 right-2 z-[90] sm:hidden">
                    {selectedShift === 'morning' ? (
                        <Button
                            type="button"
                            size="sm"
                            className="h-8 rounded-full px-2.5 text-[11px] shadow-lg shadow-black/20"
                            onClick={saveMorningPlan}
                            disabled={savingMorning || morningPlan.length === 0}
                        >
                            <Check className="mr-1 h-3 w-3" />
                            {savingMorning ? 'Saving...' : 'Save Morning'}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            size="sm"
                            className="h-8 rounded-full px-2.5 text-[11px] shadow-lg shadow-black/20"
                            onClick={saveEveningPlan}
                            disabled={savingEvening || eveningPlan.length === 0 || !isEveningPlanChanged}
                        >
                            <Check className="mr-1 h-3 w-3" />
                            {savingEvening ? 'Saving...' : 'Save Evening'}
                        </Button>
                    )}
                </div>
            ) : null}
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
    displayIndex,
    title,
    area,
    moveAnimation,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
    onMoveToPosition,
}: {
    id: number
    idx: number
    displayIndex: number
    title: string
    area?: string
    moveAnimation: { id: number; direction: 'up' | 'down' } | null
    onMoveUp: () => void
    onMoveDown: () => void
    canMoveUp: boolean
    canMoveDown: boolean
    onMoveToPosition: () => void
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id })

    const [contextMenuOpen, setContextMenuOpen] = useState(false)
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
    const startPosRef = useRef<{ x: number; y: number } | null>(null)

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenuPos({ x: e.clientX, y: e.clientY })
        setContextMenuOpen(true)
    }, [])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        startPosRef.current = { x: e.clientX, y: e.clientY }
        longPressTimerRef.current = setTimeout(() => {
            const rect = (e.target as HTMLElement).getBoundingClientRect()
            setContextMenuPos({ x: rect.left + rect.width / 2, y: rect.bottom + 4 })
            setContextMenuOpen(true)
        }, 500)
    }, [])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!startPosRef.current) return
        const dx = Math.abs(e.clientX - startPosRef.current.x)
        const dy = Math.abs(e.clientY - startPosRef.current.y)
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current)
                longPressTimerRef.current = null
            }
        }
    }, [])

    const handlePointerUp = useCallback(() => {
        startPosRef.current = null
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    const closeMenu = useCallback(() => {
        setContextMenuOpen(false)
    }, [])

    useEffect(() => {
        if (!contextMenuOpen) return
        const handleClickOutside = (e: MouseEvent) => setContextMenuOpen(false)
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenuOpen(false) }
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEsc)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEsc)
        }
    }, [contextMenuOpen])

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const isMoveAnimating = moveAnimation?.id === id
    const moveAnimationDirection = moveAnimation?.direction ?? 'up'

    return (
        <>
            <div
                ref={setNodeRef}
                style={style}
                tabIndex={0}
                className={`w-full select-none rounded-lg border border-border bg-background px-0.5 py-1.5 transition-shadow sm:px-1 sm:py-1.5 ${isDragging ? 'z-10 shadow-lg ring-2 ring-primary/20' : ''} focus-within:ring-2 focus-within:ring-primary/50`}
                onContextMenu={handleContextMenu}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onMoveToPosition()
                    }
                }}
            >
                <motion.div
                    animate={isDragging ? {
                        y: -8,
                        scale: 1.02,
                        rotate: -0.4,
                        boxShadow: '0 18px 40px -18px rgba(15, 23, 42, 0.38), 0 0 0 1px rgba(59, 130, 246, 0.18)',
                    } : isMoveAnimating ? {
                        y: moveAnimationDirection === 'up' ? [-2, -7, 0] : [2, 7, 0],
                        boxShadow: [
                            '0 0 0 0 rgba(34, 197, 94, 0)',
                            '0 10px 30px -18px rgba(34, 197, 94, 0.45)',
                            '0 0 0 0 rgba(34, 197, 94, 0)',
                        ],
                    } : { y: 0, scale: 1, rotate: 0, boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)' }}
                    transition={isDragging ? {
                        type: 'spring',
                        stiffness: 520,
                        damping: 32,
                    } : {
                        duration: 0.42,
                        ease: 'easeOut',
                    }}
                    style={{ willChange: 'transform, box-shadow' }}
                    className={isDragging ? 'pointer-events-none' : ''}
                >
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-1">
                        <div className="flex min-w-0 items-center gap-0.5">
                            <button
                                type="button"
                                aria-label="Drag to reorder"
                                className="touch-none cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"
                                {...attributes}
                                {...listeners}
                            >
                                <GripVertical className="h-4 w-4" />
                            </button>
                            <span className="min-w-6 text-xs font-semibold text-muted-foreground">#{displayIndex}</span>
                            <div className="min-w-0">
                                <p className="text-[14px] font-medium leading-tight break-words sm:text-[15px]">{title}</p>
                                {area ? <p className="text-[10px] text-muted-foreground break-words sm:text-[11px]">{area}</p> : null}
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1 px-2 sm:ml-auto sm:flex sm:w-auto sm:items-center sm:px-0 sm:pr-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={onMoveToPosition}
                                onPointerDown={(event) => event.stopPropagation()}
                                onTouchStart={(event) => event.stopPropagation()}
                            >
                                Move
                            </Button>
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
                </motion.div>
            </div>
            <AnimatePresence>
                {contextMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="fixed z-[99] min-w-[160px] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
                        style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
                        role="menu"
                    >
                        <button
                            type="button"
                            role="menuitem"
                            className="flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-sm text-popover-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                            onClick={() => { 
                                closeMenu()
                                setTimeout(() => onMoveToPosition(), 50)
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    closeMenu()
                                    setTimeout(() => onMoveToPosition(), 50)
                                }
                            }}
                        >
                            Move to Position
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
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