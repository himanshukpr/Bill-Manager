'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ChevronLeft,
    ChevronRight,
    MapPin,
    Phone,
    IndianRupee,
    CheckCircle,
    AlertCircle,
    Home,
    Clock,
    Navigation,
    X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { houseConfigApi, housesApi, balanceApi, type House, type HouseConfig } from '@/lib/api'
import { getSessionAuth, type SessionAuth } from '@/lib/auth'
import { toast } from 'sonner'

export default function DeliveryPage() {
    const router = useRouter()
    const [auth, setAuth] = useState<SessionAuth | null>(null)
    const [selectedShift, setSelectedShift] = useState<'morning' | 'evening' | null>(null)
    const [showShiftSelector, setShowShiftSelector] = useState(false)
    const [houses, setHouses] = useState<House[]>([])
    const [loading, setLoading] = useState(true)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [completedHouses, setCompletedHouses] = useState<Set<number>>(new Set())
    const [showNotes, setShowNotes] = useState(false)
    const [notes, setNotes] = useState('')
    const [currentBalance, setCurrentBalance] = useState('')
    const [marking, setMarking] = useState(false)

    useEffect(() => {
        const session = getSessionAuth()
        if (!session?.token || session.role !== 'supplier') {
            router.replace('/')
            return
        }
        setAuth(session)
        setShowShiftSelector(true)
    }, [router])

    const loadHouses = useCallback(async () => {
        if (!auth || !selectedShift) return

        try {
            setLoading(true)
            const data = await housesApi.list()
            const configs = await houseConfigApi.list()

            const configsByHouse = new Map<number, HouseConfig[]>()
            for (const config of configs) {
                const next = configsByHouse.get(config.houseId) ?? []
                next.push(config)
                configsByHouse.set(config.houseId, next)
            }

            let filtered: House[] = []

            if (selectedShift === 'morning') {
                filtered = data
                    .map((house) => ({
                        ...house,
                        configs: (configsByHouse.get(house.id) ?? house.configs ?? [])
                            .filter((config) => config.shift === 'morning' && config.supplierId === auth.uuid)
                            .sort((left, right) => left.position - right.position),
                    }))
                    .filter((house) => (house.configs?.length ?? 0) > 0)
                    .sort((left, right) => {
                        const leftOrder = left.configs?.[0]?.position ?? 0
                        const rightOrder = right.configs?.[0]?.position ?? 0
                        return leftOrder - rightOrder
                    })
            } else {
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
            }

            setHouses(filtered)
            setCurrentIndex(0)
            setCompletedHouses(new Set())
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }, [auth, selectedShift])

    useEffect(() => {
        loadHouses()
    }, [loadHouses])

    const currentHouse = houses[currentIndex]
    const progress = `${currentIndex + 1} of ${houses.length}`
    const completedCount = completedHouses.size

    const handleNext = () => {
        if (currentIndex < houses.length - 1) {
            setCurrentIndex(currentIndex + 1)
            setNotes('')
            setCurrentBalance('')
            setShowNotes(false)
        }
    }

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1)
            setNotes('')
            setCurrentBalance('')
            setShowNotes(false)
        }
    }

    const handleMarkDelivered = async () => {
        if (!currentHouse) return

        setMarking(true)
        try {
            // Update balance if provided
            if (currentBalance) {
                await balanceApi.update(currentHouse.id, {
                    currentBalance: Number(currentBalance),
                })
            }

            // Mark as completed
            setCompletedHouses((prev) => new Set([...prev, currentHouse.id]))
            toast.success(`${currentHouse.houseNo} delivered!`)

            // Auto-move to next
            if (currentIndex < houses.length - 1) {
                setTimeout(() => {
                    handleNext()
                }, 500)
            }
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setMarking(false)
        }
    }

    if (!auth) {
        return <div className="min-h-screen" />
    }

    // Shift selector
    if (!selectedShift) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-emerald-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-4">
                <Dialog open={!selectedShift} onOpenChange={() => { }}>
                    <DialogContent className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle>Select Shift</DialogTitle>
                            <DialogDescription>
                                Choose which shift you want to deliver today
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                            <Button
                                onClick={() => setSelectedShift('morning')}
                                className="w-full h-14 flex flex-col items-start justify-center"
                                variant="outline"
                            >
                                <span className="font-semibold">Morning Shift</span>
                                <span className="text-xs text-muted-foreground">Your assigned routes</span>
                            </Button>
                            <Button
                                onClick={() => setSelectedShift('evening')}
                                className="w-full h-14 flex flex-col items-start justify-center"
                                variant="outline"
                            >
                                <span className="font-semibold">Evening Shift</span>
                                <span className="text-xs text-muted-foreground">Shared routes</span>
                            </Button>
                        </div>
                        <Button
                            asChild
                            variant="ghost"
                            className="w-full mt-4"
                        >
                            <Link href="/dashboard/supplier">Go Back</Link>
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-linear-to-br from-emerald-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-4">
                <div className="max-w-md mx-auto space-y-4">
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                    <Skeleton className="h-32 w-full rounded-xl" />
                </div>
            </div>
        )
    }

    if (houses.length === 0) {
        return (
            <div className="min-h-screen bg-linear-to-br from-emerald-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-4 flex items-center justify-center">
                <div className="max-w-sm text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                        <Home className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">No routes available</h2>
                    <p className="text-muted-foreground mb-6">
                        No {selectedShift} shift routes for delivery today
                    </p>
                    <Button asChild>
                        <Link href="/dashboard/supplier">Go Back</Link>
                    </Button>
                </div>
            </div>
        )
    }

    const isCompleted = completedHouses.has(currentHouse.id)
    const pending = Number(currentHouse.balance?.previousBalance ?? 0)
    const current = Number(currentHouse.balance?.currentBalance ?? 0)

    return (
        <div className="min-h-screen bg-linear-to-br from-emerald-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-4">
            <div className="max-w-md mx-auto space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <Button asChild variant="ghost" size="icon">
                        <Link href="/dashboard/supplier">
                            <ChevronLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div className="text-center">
                        <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                            {selectedShift === 'morning' ? 'Morning' : 'Evening'} Route
                        </p>
                        <p className="text-lg font-bold">{progress}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedShift(null)}
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${((currentIndex + 1) / houses.length) * 100}%` }}
                    />
                </div>

                {/* Current House Card */}
                <div className="bg-card dark:bg-slate-800 rounded-3xl border border-border/70 shadow-lg overflow-hidden">
                    {/* Status Badge */}
                    <div
                        className={`px-6 py-4 ${isCompleted
                                ? 'bg-emerald-100 dark:bg-emerald-900'
                                : 'bg-amber-100 dark:bg-amber-900'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            {isCompleted ? (
                                <>
                                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                                    <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                                        Delivered
                                    </span>
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="h-5 w-5 text-amber-600" />
                                    <span className="font-semibold text-amber-900 dark:text-amber-100">
                                        Pending
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* House Details */}
                    <div className="p-6 space-y-4">
                        {/* House No and Area */}
                        <div>
                            <p className="text-4xl font-bold text-foreground">{currentHouse.houseNo}</p>
                            {currentHouse.area && (
                                <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                                    <MapPin className="h-4 w-4" />
                                    <span>{currentHouse.area}</span>
                                </div>
                            )}
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-2 pt-2 border-t border-border">
                            <div className="flex items-center gap-3">
                                <Phone className="h-5 w-5 text-primary shrink-0" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Primary</p>
                                    <p className="font-semibold">{currentHouse.phoneNo}</p>
                                </div>
                            </div>
                            {currentHouse.alternativePhone && (
                                <div className="flex items-center gap-3">
                                    <Phone className="h-5 w-5 text-muted-foreground shrink-0" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">Alternative</p>
                                        <p className="font-semibold">{currentHouse.alternativePhone}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Balance Info */}
                        <div className="pt-2 border-t border-border grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                                    Previous Balance
                                </p>
                                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                    ₹{pending.toLocaleString('en-IN')}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                                    Current
                                </p>
                                <p className="text-2xl font-bold text-primary">
                                    ₹{current.toLocaleString('en-IN')}
                                </p>
                            </div>
                        </div>

                        {/* Rates */}
                        {(currentHouse.rate1Type || currentHouse.rate2Type) && (
                            <div className="pt-2 border-t border-border">
                                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">
                                    Rates
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {currentHouse.rate1Type && (
                                        <Badge variant="secondary">
                                            {currentHouse.rate1Type} ₹{currentHouse.rate1}/L
                                        </Badge>
                                    )}
                                    {currentHouse.rate2Type && (
                                        <Badge variant="secondary">
                                            {currentHouse.rate2Type} ₹{currentHouse.rate2}/L
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Alerts/Notes from config */}
                        {currentHouse.configs?.[0]?.dailyAlerts && (
                            <div className="pt-2 border-t border-border bg-amber-50 dark:bg-amber-950 p-3 rounded-lg">
                                <div className="flex gap-2">
                                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                                            Special Instructions
                                        </p>
                                        <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                                            {currentHouse.configs[0].dailyAlerts}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Update Balance Form */}
                {!isCompleted && (
                    <>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setShowNotes(!showNotes)}
                        >
                            {showNotes ? 'Hide Details' : 'Update Balance'}
                        </Button>

                        {showNotes && (
                            <div className="bg-card dark:bg-slate-800 rounded-2xl border border-border/70 p-6 space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="balance">Current Balance</Label>
                                    <Input
                                        id="balance"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder={current.toString()}
                                        value={currentBalance}
                                        onChange={(e) => setCurrentBalance(e.target.value)}
                                        className="text-lg"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Leave empty to keep: ₹{current.toLocaleString('en-IN')}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="notes">Delivery Notes (Optional)</Label>
                                    <Textarea
                                        id="notes"
                                        placeholder="e.g., Not at home, Call later..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Action Buttons */}
                <div className="space-y-3">
                    {!isCompleted ? (
                        <Button
                            onClick={handleMarkDelivered}
                            disabled={marking}
                            size="lg"
                            className="w-full h-16 text-lg font-semibold"
                        >
                            <CheckCircle className="h-5 w-5 mr-2" />
                            {marking ? 'Marking...' : 'Mark Delivered'}
                        </Button>
                    ) : (
                        <Button
                            disabled
                            size="lg"
                            className="w-full h-16 text-lg font-semibold"
                            variant="outline"
                        >
                            <CheckCircle className="h-5 w-5 mr-2" />
                            Delivered
                        </Button>
                    )}

                    <div className="flex gap-3">
                        <Button
                            onClick={handlePrevious}
                            disabled={currentIndex === 0}
                            variant="outline"
                            className="flex-1 h-12"
                        >
                            <ChevronLeft className="h-5 w-5 mr-2" />
                            Previous
                        </Button>
                        <Button
                            onClick={handleNext}
                            disabled={currentIndex === houses.length - 1}
                            variant="outline"
                            className="flex-1 h-12"
                        >
                            Next
                            <ChevronRight className="h-5 w-5 ml-2" />
                        </Button>
                    </div>
                </div>

                {/* Stats Footer */}
                <div className="bg-card dark:bg-slate-800 rounded-2xl border border-border/70 p-4 text-center">
                    <p className="text-sm text-muted-foreground">Deliveries Completed Today</p>
                    <p className="text-3xl font-bold text-emerald-600">
                        {completedCount}/{houses.length}
                    </p>
                </div>

                {/* Jump to any house */}
                {houses.length > 5 && (
                    <div className="bg-card dark:bg-slate-800 rounded-2xl border border-border/70 p-4">
                        <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-3">
                            Jump to House
                        </p>
                        <div className="grid grid-cols-5 gap-2">
                            {houses.map((house, idx) => (
                                <Button
                                    key={house.id}
                                    variant={currentIndex === idx ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-10 text-xs font-bold"
                                    onClick={() => setCurrentIndex(idx)}
                                >
                                    {house.houseNo}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
