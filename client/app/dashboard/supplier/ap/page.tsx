'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { getSessionAuth, type SessionAuth } from '@/lib/auth'
import {
  deliveryPlansApi,
  productRatesApi,
  type DeliveryPlan,
  type ProductRate,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type ProductLine = {
  product: string
  quantity: string
}

const emptyLine: ProductLine = {
  product: '',
  quantity: '',
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function SupplierDeliveryPlanPage() {
  const router = useRouter()

  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [productLines, setProductLines] = useState<ProductLine[]>([{ ...emptyLine }])
  const [rates, setRates] = useState<ProductRate[]>([])
  const [plans, setPlans] = useState<DeliveryPlan[]>([])

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

    let active = true

    async function load() {
      try {
        setLoading(true)
        const [rateData, planData] = await Promise.all([productRatesApi.list(), deliveryPlansApi.list()])
        if (!active) return
        setRates(rateData)
        setPlans(planData)
      } catch (error: any) {
        toast.error(error.message || 'Failed to load delivery planner')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [auth])

  const activeProducts = useMemo(
    () => rates.filter((rate) => rate.isActive).map((rate) => rate.name.trim()).filter(Boolean),
    [rates],
  )

  const normalizedProducts = useMemo(
    () =>
      productLines
        .map((line) => ({
          product: line.product.trim(),
          quantity: Number(line.quantity),
        }))
        .filter((line) => line.product.length > 0 && Number.isFinite(line.quantity) && line.quantity > 0),
    [productLines],
  )

  function addLine() {
    setProductLines((prev) => [...prev, { ...emptyLine }])
  }

  function removeLine(index: number) {
    setProductLines((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)))
  }

  function updateLine(index: number, patch: Partial<ProductLine>) {
    setProductLines((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)))
  }

  async function startDelivery() {
    if (!auth) return

    if (normalizedProducts.length === 0) {
      toast.error('Add at least one product with quantity')
      return
    }

    setSaving(true)
    try {
      const savedPlans = await Promise.all(
        normalizedProducts.map((line) =>
          deliveryPlansApi.create({
            product_name: line.product,
            quantity_per_go: line.quantity,
            number_of_goes: 1,
            total_quantity: line.quantity,
          }),
        ),
      )

      setPlans((current) => [...savedPlans, ...current])
      setProductLines([{ ...emptyLine }])
      toast.success('Delivery started and saved')
    } catch (error: any) {
      toast.error(error.message || 'Failed to start delivery')
    } finally {
      setSaving(false)
    }
  }

  if (!auth) return <div className="min-h-screen" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Supplier</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Delivery Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Edit the table and tap Start Delivery.</p>
        </div>
        <Button onClick={startDelivery} disabled={saving || loading} className="shrink-0">
          {saving ? 'Starting...' : 'Start Delivery'}
        </Button>
      </div>

      <Card className="rounded-2xl border border-border bg-card p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold">Delivery items</h2>
            <p className="text-xs text-muted-foreground">Only product and quantity are editable here.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-2">
            <Plus className="h-4 w-4" /> Add row
          </Button>
        </div>

        <div className="overflow-x-auto px-2 py-2 sm:px-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Product</TableHead>
                <TableHead className="w-36">Quantity</TableHead>
                <TableHead className="w-16 text-right"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productLines.map((line, index) => (
                <TableRow key={index}>
                  <TableCell className="py-2">
                    <Select value={line.product} onValueChange={(value) => updateLine(index, { product: value })}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder={loading ? 'Loading...' : 'Select product'} />
                      </SelectTrigger>
                      <SelectContent>
                        {activeProducts.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-2">
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      className="h-10"
                    />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(index)}
                      disabled={productLines.length === 1}
                      className="h-9 w-9 text-muted-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="rounded-2xl border border-border bg-card p-0">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">Recent deliveries</h2>
        </div>

        {plans.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No saved deliveries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created At</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>{formatDate(plan.created_at)}</TableCell>
                    <TableCell>{plan.product_name}</TableCell>
                    <TableCell>{plan.unit || '-'}</TableCell>
                    <TableCell className="text-right">{plan.total_quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
