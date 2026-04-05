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
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
        <div className="min-h-screen bg-linear-to-br from-emerald-50 via-blue-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
            <div className="max-w-2xl mx-auto p-4 space-y-6">
                {/* Header */}
                <div className="pt-4 flex items-start justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
                            Supplier Mode
                        </p>
                        <h1 className="text-3xl font-bold mt-2">Welcome, {auth.username}!</h1>
                        <p className="text-muted-foreground mt-1">Manage and deliver your routes</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleLogout}>
                        Log Out
                    </Button>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Delivery Mode */}
                    <Button
                        asChild
                        size="lg"
                        className="h-32 sm:h-40 flex flex-col items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg hover:shadow-xl"
                    >
                        <Link href="/dashboard/supplier/delivery">
                            <Navigation className="h-8 w-8" />
                            <div className="text-center">
                                <p className="font-bold text-lg">Start Delivery</p>
                                <p className="text-xs opacity-90">On-the-go delivery tracking</p>
                            </div>
                        </Link>
                    </Button>

                    {/* Route Planning */}
                    <Button
                        asChild
                        size="lg"
                        className="h-32 sm:h-40 flex flex-col items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl"
                    >
                        <Link href="/dashboard/supplier/houses">
                            <Settings className="h-8 w-8" />
                            <div className="text-center">
                                <p className="font-bold text-lg">Plan Routes</p>
                                <p className="text-xs opacity-90">Reorder and manage deliveries</p>
                            </div>
                        </Link>
                    </Button>
                </div>

                {/* Stats Section */}
                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-32 w-full rounded-2xl" />
                        <Skeleton className="h-32 w-full rounded-2xl" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Morning Routes */}
                        <Card className="bg-white dark:bg-slate-800 border-0 shadow-md p-6 rounded-2xl">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm uppercase tracking-widest font-semibold text-muted-foreground">
                                        Morning Routes
                                    </p>
                                    <p className="text-4xl font-bold">{stats.morningCount}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Houses assigned to you
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 p-4">
                                    <Package className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                                </div>
                            </div>
                        </Card>

                        {/* Evening Routes */}
                        <Card className="bg-white dark:bg-slate-800 border-0 shadow-md p-6 rounded-2xl">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm uppercase tracking-widest font-semibold text-muted-foreground">
                                        Evening Routes
                                    </p>
                                    <p className="text-4xl font-bold">{stats.eveningCount}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Shared delivery sequence
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-purple-100 dark:bg-purple-900/30 p-4">
                                    <Clock className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                                </div>
                            </div>
                        </Card>

                        {/* Total Pending */}
                        <Card className="bg-white dark:bg-slate-800 border-0 shadow-md p-6 rounded-2xl">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm uppercase tracking-widest font-semibold text-muted-foreground">
                                        Total Pending Balance
                                    </p>
                                    <p className="text-4xl font-bold text-amber-600 dark:text-amber-400">
                                        ₹{stats.totalPending.toLocaleString('en-IN')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Across all your routes
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-amber-100 dark:bg-amber-900/30 p-4">
                                    <TrendingUp className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Features */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 space-y-3">
                    <p className="text-sm font-semibold text-foreground mb-4">Features</p>
                    <div className="space-y-2">
                        {[
                            'Mobile-optimized delivery interface',
                            'Real-time route tracking',
                            'Balance updates on delivery',
                            'Route reordering and planning',
                            'House details at your fingertips',
                        ].map((feature, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-sm text-muted-foreground">{feature}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center pb-4">
                    <Button
                        asChild
                        variant="outline"
                        className="gap-2"
                    >
                        <Link href="/dashboard">
                            <Home className="h-4 w-4" />
                            Go to Main Dashboard
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
