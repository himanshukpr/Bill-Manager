'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Package,
    Navigation,
    Clock,
    TrendingUp,
    Settings,
    Home,
    ArrowRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { houseConfigApi, housesApi, type House, type HouseConfig } from '@/lib/api'
import { getSessionAuth, clearSessionAuth, type SessionAuth } from '@/lib/auth'
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
                    houseConfigApi.list(),
                ])

                const morningCount = configs.filter(
                    (c) => c.shift === 'morning' && c.supplierId === auth.uuid
                ).length
                const eveningCount = configs.filter((c) => c.shift === 'evening').length
                const totalPending = houses.reduce(
                    (sum, h) => sum + Number(h.balance?.previousBalance ?? 0),
                    0
                )

                setStats({
                    morningCount,
                    eveningCount,
                    totalPending,
                })
            } catch (error: any) {
                toast.error(error.message)
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [auth])

    const handleLogout = () => {
        clearSessionAuth()
        router.replace('/')
    }

    if (!auth) {
        return <div className="min-h-screen" />
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                        Supplier Panel
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">Welcome, {auth.username}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Manage delivery operations and route progress.</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout} className="self-start sm:self-auto">
                    Log Out
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="relative overflow-hidden rounded-2xl border border-emerald-200/50 bg-linear-to-br from-emerald-500/10 to-emerald-600/5 p-5">
                    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-400/10" />
                    <div className="relative flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Morning Routes</p>
                            {loading ? (
                                <Skeleton className="mt-2 h-8 w-16" />
                            ) : (
                                <p className="mt-2 text-3xl font-bold">{stats.morningCount}</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">Assigned to you</p>
                        </div>
                        <div className="rounded-xl bg-emerald-500/20 p-3">
                            <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    </div>
                </Card>

                <Card className="relative overflow-hidden rounded-2xl border border-blue-200/50 bg-linear-to-br from-blue-500/10 to-blue-600/5 p-5">
                    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-400/10" />
                    <div className="relative flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Evening Routes</p>
                            {loading ? (
                                <Skeleton className="mt-2 h-8 w-16" />
                            ) : (
                                <p className="mt-2 text-3xl font-bold">{stats.eveningCount}</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">Shared sequence</p>
                        </div>
                        <div className="rounded-xl bg-blue-500/20 p-3">
                            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                </Card>

                <Card className="relative overflow-hidden rounded-2xl border border-amber-200/50 bg-linear-to-br from-amber-500/10 to-amber-600/5 p-5">
                    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber-400/10" />
                    <div className="relative flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Pending Balance</p>
                            {loading ? (
                                <Skeleton className="mt-2 h-8 w-24" />
                            ) : (
                                <p className="mt-2 text-3xl font-bold text-amber-600 dark:text-amber-400">
                                    ₹{stats.totalPending.toLocaleString('en-IN')}
                                </p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">Across your delivery houses</p>
                        </div>
                        <div className="rounded-xl bg-amber-500/20 p-3">
                            <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Primary Action</p>
                            <h2 className="mt-2 text-xl font-bold">Start Delivery Run</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Open delivery mode to mark houses and update balances quickly.</p>
                        </div>
                        <div className="rounded-xl bg-emerald-500/15 p-3">
                            <Navigation className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    </div>
                    <Button asChild className="mt-5 w-full justify-between">
                        <Link href="/dashboard/supplier/delivery">
                            Start Delivery
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </Card>

                <Card className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Route Setup</p>
                            <h2 className="mt-2 text-xl font-bold">Manage House Order</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Review assigned houses and tune delivery sequence.</p>
                        </div>
                        <div className="rounded-xl bg-blue-500/15 p-3">
                            <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                    <Button asChild variant="outline" className="mt-5 w-full justify-between">
                        <Link href="/dashboard/supplier/houses">
                            Open Routes
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </Card>
            </div>

            <div className="flex justify-start">
                <Button asChild variant="ghost" className="gap-2">
                    <Link href="/dashboard">
                        <Home className="h-4 w-4" />
                        Main Dashboard
                    </Link>
                </Button>
            </div>
        </div>
    )
}
