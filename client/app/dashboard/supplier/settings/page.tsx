'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calculator } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getSessionAuth, type SessionAuth } from '@/lib/auth'
import { getEvaluateByAmount, setEvaluateByAmount } from '@/lib/supplier-settings'

export default function SupplierSettingsPage() {
    const router = useRouter()
    const [auth] = useState<SessionAuth | null>(() => getSessionAuth())
    const [evaluateByAmount, setEvaluateByAmountState] = useState(false)

    useEffect(() => {
        if (!auth?.token || auth?.role !== 'supplier') {
            router.replace('/')
            return
        }
        setEvaluateByAmountState(getEvaluateByAmount())
    }, [router, auth])

    const handleToggle = (checked: boolean) => {
        setEvaluateByAmountState(checked)
        setEvaluateByAmount(checked)
    }

    if (!auth) {
        return <div className="min-h-screen" />
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Supplier Panel
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
                </div>
            </div>

            <Card className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-xl bg-blue-500/15 p-2.5">
                            <Calculator className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold">Evaluate Delivery Items by Amount</p>
                            <p className="mt-1 max-w-md text-sm text-muted-foreground">
                                When enabled, the delivery entry screen shows an editable Amount field.
                                Entering an amount automatically calculates the quantity from the product
                                rate. When disabled, only quantity and rate are used.
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={evaluateByAmount}
                        onCheckedChange={handleToggle}
                        aria-label="Evaluate delivery items by amount"
                    />
                </div>
            </Card>

            <p className="text-xs text-muted-foreground">
                This preference is saved on this device only.
            </p>
        </div>
    )
}
