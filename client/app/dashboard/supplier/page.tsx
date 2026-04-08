'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Navigation,
    Clock,
    TrendingUp,
    Settings,
    Home,
    Package,
    ArrowRight,
} from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { houseConfigApi, housesApi } from '@/lib/api'
import { getSessionAuth, type SessionAuth } from '@/lib/auth'
import { toast } from 'sonner'

export default function SupplierPage() {
    const router = useRouter()
    const [auth, setAuth] = useState<SessionAuth | null>(null)
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        morningCount: 0,
        eveningCount: 0,
        totalPending: 0,
    })

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

        const load = async () => {
            try {
                setLoading(true)
                const [houses, configs] = await Promise.all([
                    housesApi.list(),
                    houseConfigApi.list(auth.uuid),
                ])

                const morningCount = configs.filter((c) => c.shift === 'morning').length
                const eveningCount = configs.filter((c) => c.shift === 'evening').length
                const assignedHouseIds = new Set(configs.map((c) => c.houseId))
                const totalPending = houses.reduce(
                    (sum, h) => sum + Number(h.balance?.previousBalance ?? 0),
                    0
                )
                const assignedPending = houses
                    .filter((h) => assignedHouseIds.has(h.id))
                    .reduce((sum, h) => sum + Number(h.balance?.previousBalance ?? 0), 0)

                setStats({
                    morningCount,
                    eveningCount,
                    totalPending: assignedHouseIds.size ? assignedPending : totalPending,
                })
            } catch (error: any) {
                toast.error(error.message)
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [auth])

    if (!auth) {
        return <div className="min-h-screen" />
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <div>
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">
                    Supplier Workspace
                </p>
                <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">Welcome, {auth.username}</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">Manage route delivery, sequence and pending balances.</p>
            </div>

            <section className="grid gap-4 md:grid-cols-2">
                <Link
                    href="/dashboard/supplier/delivery"
                    className="group relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-400/10 to-emerald-500/5 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-900/40"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Quick Action</p>
                            <h2 className="mt-1 text-xl font-semibold">Start Delivery</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Open live route mode and mark houses delivered.</p>
                        </div>
                        <div className="rounded-xl bg-emerald-100 p-3 dark:bg-emerald-900/40">
                            <Navigation className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                        </div>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        Open delivery
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </Link>

                <Link
                    href="/dashboard/supplier/houses"
                    className="group relative overflow-hidden rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-400/10 to-blue-500/5 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-blue-900/40"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Quick Action</p>
                            <h2 className="mt-1 text-xl font-semibold">Plan Routes</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Reorder house sequence and configure route data.</p>
                        </div>
                        <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/40">
                            <Settings className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                        </div>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-300">
                        Open route manager
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </Link>
            </section>

            {loading ? (
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Skeleton className="h-36 w-full rounded-2xl" />
                    <Skeleton className="h-36 w-full rounded-2xl" />
                    <Skeleton className="h-36 w-full rounded-2xl" />
                </section>
            ) : (
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Morning Routes</p>
                                <p className="mt-2 text-3xl font-bold">{stats.morningCount}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Assigned to you</p>
                            </div>
                            <div className="rounded-xl bg-emerald-100 dark:bg-emerald-900/30 p-3">
                                <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                        </div>
                    </Card>

                    <Card className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Evening Routes</p>
                                <p className="mt-2 text-3xl font-bold">{stats.eveningCount}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Assigned to you</p>
                            </div>
                            <div className="rounded-xl bg-indigo-100 dark:bg-indigo-900/30 p-3">
                                <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                            </div>
                        </div>
                    </Card>

                    <Card className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Pending Balance</p>
                                <p className="mt-2 text-3xl font-bold text-amber-600 dark:text-amber-400">₹{stats.totalPending.toLocaleString('en-IN')}</p>
                                <p className="mt-1 text-xs text-muted-foreground">For your assigned houses</p>
                            </div>
                            <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-3">
                                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            </div>
                        </div>
                    </Card>
                </section>
            )}

            <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
                <Card className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                    <h3 className="text-base font-semibold">Today&apos;s Route Checklist</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Step 1</p>
                            <p className="mt-1 text-sm">Open delivery mode before starting your route.</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Step 2</p>
                            <p className="mt-1 text-sm">Update balances and add notes after each drop.</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Step 3</p>
                            <p className="mt-1 text-sm">Review pending list and close all completed houses.</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Step 4</p>
                            <p className="mt-1 text-sm">Use route manager to optimize sequence for tomorrow.</p>
                        </div>
                    </div>
                </Card>

                <Card className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                    <h3 className="text-base font-semibold">Shortcuts</h3>
                    <div className="mt-4 space-y-2">
                        <Link href="/dashboard/supplier/delivery" className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-muted/60">
                            <span>Live Delivery Screen</span>
                            <Navigation className="h-4 w-4 text-muted-foreground" />
                        </Link>
                        <Link href="/dashboard/supplier/houses" className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-muted/60">
                            <span>Route House Order</span>
                            <Settings className="h-4 w-4 text-muted-foreground" />
                        </Link>
                        <Link href="/dashboard" className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-muted/60">
                            <span>Main Dashboard</span>
                            <Home className="h-4 w-4 text-muted-foreground" />
                        </Link>
                    </div>
                </Card>
            </section>
        </div>
    )
}
