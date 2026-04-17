'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Navigation,
    Settings,
    Home,
    ArrowRight,
} from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getSessionAuth, type SessionAuth } from '@/lib/auth'

export default function SupplierPage() {
    const router = useRouter()
    const [auth, setAuth] = useState<SessionAuth | null>(null)

    useEffect(() => {
        const session = getSessionAuth()
        if (!session?.token || session.role !== 'supplier') {
            router.replace('/')
            return
        }
        setAuth(session)
    }, [router])

    if (!auth) {
        return <div className="min-h-screen" />
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <div>
                <div>
                    <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                        Supplier Panel
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">Welcome, {auth.username}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Manage delivery operations and route progress.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
