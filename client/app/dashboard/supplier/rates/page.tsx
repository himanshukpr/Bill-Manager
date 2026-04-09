'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeDollarSign, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { productRatesApi, type ProductRate } from '@/lib/api'

export default function SupplierRatesPage() {
    const [rates, setRates] = useState<ProductRate[]>([])
    const [loading, setLoading] = useState(true)

    const loadRates = useCallback(async () => {
        try {
            setLoading(true)
            const data = await productRatesApi.list()
            setRates(data)
        } catch (error: any) {
            toast.error(error.message || 'Failed to load rate list')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadRates()
    }, [loadRates])

    const activeRates = useMemo(
        () => rates.filter((rate) => rate.isActive),
        [rates],
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                        Supplier
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">Rate List</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Available products and base prices used when house-specific rates are not configured.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadRates} className="gap-2 self-start sm:self-auto">
                    <RefreshCcw className="h-4 w-4" /> Refresh
                </Button>
            </div>

            <Card className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2">
                    <BadgeDollarSign className="h-5 w-5 text-emerald-600" />
                    <p className="text-sm text-muted-foreground">Active products</p>
                </div>
                {loading ? (
                    <Skeleton className="mt-3 h-8 w-20" />
                ) : (
                    <p className="mt-2 text-3xl font-bold">{activeRates.length}</p>
                )}
            </Card>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {loading ? (
                    <div className="space-y-3 p-5">
                        {[...Array(5)].map((_, idx) => (
                            <Skeleton key={idx} className="h-12 w-full rounded-xl" />
                        ))}
                    </div>
                ) : rates.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">No rate items found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Item</th>
                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Unit</th>
                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Price</th>
                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rates.map((rate, idx) => (
                                    <tr
                                        key={rate.id}
                                        className={`border-b border-border/60 ${idx === rates.length - 1 ? 'border-b-0' : ''}`}
                                    >
                                        <td className="px-4 py-3 font-medium">{rate.name}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{rate.unit}</td>
                                        <td className="px-4 py-3 font-semibold">
                                            ₹{Number(rate.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant={rate.isActive ? 'default' : 'secondary'}>
                                                {rate.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}