'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CirclePlus, Package2, Plus, RefreshCw, Search, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { deliveryLogsApi, housesApi, productRatesApi, type DeliveryLog, type DeliveryLogItem, type House, type ProductRate } from '@/lib/api'
import { cn } from '@/lib/utils'

type DeliveryEntryRow = {
  id: string
  milkType: string
  qty: string
  rate: string
}

function makeRowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createRow(rate?: ProductRate): DeliveryEntryRow {
  return {
    id: makeRowId(),
    milkType: rate?.name ?? '',
    qty: '',
    rate: rate ? String(rate.rate) : '',
  }
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: string | number): string {
  const parsed = Number(value)
  return `₹${Number.isFinite(parsed) ? parsed.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'}`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function DeliveryEntryPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [houses, setHouses] = useState<House[]>([])
  const [rates, setRates] = useState<ProductRate[]>([])
  const [logs, setLogs] = useState<DeliveryLog[]>([])

  const [houseId, setHouseId] = useState('')
  const [houseSearch, setHouseSearch] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<DeliveryEntryRow[]>([createRow()])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const [houseData, rateData, logData] = await Promise.all([
          housesApi.list(),
          productRatesApi.list(),
          deliveryLogsApi.list(),
        ])

        if (!active) return
        setHouses(houseData)
        setRates(rateData)
        setLogs(logData)
      } catch (error: any) {
        toast.error(error.message || 'Failed to load direct entry data')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [])

  const activeRates = useMemo(
    () => rates.filter((rate) => rate.isActive),
    [rates],
  )

  const selectedHouse = useMemo(
    () => houses.find((house) => String(house.id) === houseId),
    [houses, houseId],
  )

  const ratesByName = useMemo(() => {
    const map: Record<string, string> = {}
    rates.forEach((rate) => {
      map[rate.name] = String(rate.rate)
    })
    return map
  }, [rates])

  const filteredHouses = useMemo(() => {
    const q = houseSearch.trim().toLowerCase()
    if (!q) return houses.sort((a, b) => a.houseNo.localeCompare(b.houseNo))

    return houses
      .filter((house) =>
        house.houseNo.toLowerCase().includes(q) ||
        (house.area || '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.houseNo.localeCompare(b.houseNo))
  }, [houses, houseSearch])

  const items = useMemo(() => {
    return rows
      .map<DeliveryLogItem | null>((row) => {
        const milkType = row.milkType.trim()
        const qty = toNumber(row.qty)
        const rate = toNumber(row.rate)

        if (!milkType || qty <= 0 || rate <= 0) {
          return null
        }

        return {
          milkType,
          qty,
          rate,
          amount: qty * rate,
        }
      })
      .filter((item): item is DeliveryLogItem => Boolean(item))
  }, [rows])

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.amount, 0),
    [items],
  )

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.qty, 0),
    [items],
  )

  function updateRow(id: string, patch: Partial<DeliveryEntryRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  function addBlankRow() {
    setRows((current) => [...current, createRow()])
  }

  function addTemplateRow(rate: ProductRate) {
    setRows((current) => [...current, createRow(rate)])
  }

  function removeRow(id: string) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current))
  }

  function resetForm() {
    setHouseId('')
    setHouseSearch('')
    setNote('')
    setRows([createRow()])
  }

  async function handleSave() {
    if (!houseId) {
      toast.error('Please select a house')
      return
    }

    if (items.length === 0) {
      toast.error('Add at least one product with quantity and rate')
      return
    }

    setSaving(true)
    try {
      const response = await deliveryLogsApi.create({
        houseId: Number(houseId),
        shift: 'morning',
        items,
        note: note.trim() || undefined,
      })

      setLogs((current) => [response.log, ...current])
      toast.success('Direct entry saved successfully')
      resetForm()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save direct entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">

      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-3xl border border-border bg-card py-0">
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>Direct entry</CardTitle>
            <CardDescription>
              Choose the house, enter the delivered products, and save the entry.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2 px-5 py-1">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="delivery-house" className="font-semibold">Which house?</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      id="delivery-house"
                      placeholder="Search by house number or area..."
                      value={houseSearch}
                      onChange={(e) => setHouseSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {houseSearch && filteredHouses.length > 0 && (
                    <div className="mt-2 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {filteredHouses.map((house) => (
                          <button
                            key={house.id}
                            type="button"
                            onClick={() => {
                              setHouseId(String(house.id))
                              setHouseSearch('')
                            }}
                            className={cn(
                              'w-full text-left px-4 py-3 text-sm transition-colors border-b border-border/50 last:border-b-0',
                              houseId === String(house.id)
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-muted/50',
                            )}
                          >
                            <p className="font-semibold">House {house.houseNo}</p>
                            {house.area && <p className="text-xs text-muted-foreground">{house.area}</p>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {houseId && selectedHouse && (
                    <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-sm font-medium">House {selectedHouse.houseNo}</p>
                      {selectedHouse.area && <p className="text-xs text-muted-foreground">{selectedHouse.area}</p>}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">Quick product add</p>
                      <p className="text-xs text-muted-foreground">
                        Tap a product to add a prefilled line, or add a blank row for custom entries.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addBlankRow} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Add blank row
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeRates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No active product rates found. You can still enter product names manually.
                      </p>
                    ) : (
                      activeRates.map((rate) => (
                        <button
                          key={rate.id}
                          type="button"
                          onClick={() => addTemplateRow(rate)}
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          <CirclePlus className="h-3.5 w-3.5 text-primary" />
                          {rate.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {rows.map((row, index) => {
                    const rowAmount = toNumber(row.qty) * toNumber(row.rate)

                    return (
                      <div key={row.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Item {index + 1}</Badge>
                            {rowAmount > 0 ? <Badge variant="secondary">{formatMoney(rowAmount)}</Badge> : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-muted-foreground"
                            onClick={() => removeRow(row.id)}
                            disabled={rows.length === 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_0.7fr_0.7fr_0.7fr]">
                          <div className="space-y-1.5">
                            <Label htmlFor={`milkType-${row.id}`}>Product</Label>
                            <Input
                              id={`milkType-${row.id}`}
                              list="delivery-products"
                              placeholder="e.g. Cow Milk"
                              value={row.milkType}
                              onChange={(event) => {
                                const newMilkType = event.target.value
                                const matchingRate = ratesByName[newMilkType]
                                updateRow(row.id, {
                                  milkType: newMilkType,
                                  ...(matchingRate && { rate: matchingRate }),
                                })
                              }}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor={`qty-${row.id}`}>Qty</Label>
                            <Input
                              id={`qty-${row.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0"
                              value={row.qty}
                              onChange={(event) => updateRow(row.id, { qty: event.target.value })}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Rate</Label>
                            <div className="text-sm font-semibold text-foreground">
                              {row.rate ? formatMoney(row.rate) : '—'}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-sm font-medium text-muted-foreground">Amount</div>
                            <div className="text-sm font-semibold text-foreground">
                              {formatMoney(rowAmount)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="delivery-note">Note</Label>
                  <Textarea
                    id="delivery-note"
                    placeholder="Optional note for this direct entry"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Ready to save</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedHouse ? `House ${selectedHouse.houseNo}${selectedHouse.area ? ` · ${selectedHouse.area}` : ''}` : 'Select a house to continue'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Entry total</p>
                      <p className="text-2xl font-bold text-foreground">{formatMoney(totalAmount)}</p>
                    </div>
                    <Button type="button" onClick={handleSave} disabled={saving} className="gap-2">
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                      {saving ? 'Saving...' : 'Save entry'}
                    </Button>
                  </div>
                </div>

                <datalist id="delivery-products">
                  {rates.map((rate) => (
                    <option key={rate.id} value={rate.name} />
                  ))}
                </datalist>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border bg-card py-0">
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>Recent delivery logs</CardTitle>
            <CardDescription>
              Latest entries recorded through the admin or supplier flow.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-0 py-0">
            {loading ? (
              <div className="space-y-3 p-5">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-2xl" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center text-muted-foreground">
                <Package2 className="h-12 w-12 opacity-30" />
                <p className="mt-3 font-medium text-foreground">No delivery logs yet</p>
                <p className="mt-1 text-sm">
                  Use the form on the left to create the first record.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <div className="max-h-176 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">House</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Products</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Shift</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Amount</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log, index) => (
                        <tr
                          key={log.id}
                          className={cn(
                            'border-b border-border/60 transition-colors hover:bg-muted/30',
                            index === logs.length - 1 && 'border-b-0',
                          )}
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-semibold">House {log.house?.houseNo ?? log.houseId}</p>
                              {log.house?.area ? (
                                <p className="text-xs text-muted-foreground">{log.house.area}</p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="font-medium">{(log.items ?? []).length} item{(log.items ?? []).length === 1 ? '' : 's'}</p>
                              <p className="text-xs text-muted-foreground">
                                {Array.isArray(log.items)
                                  ? log.items.slice(0, 2).map((item) => item.milkType).join(', ')
                                  : ''}
                                {Array.isArray(log.items) && log.items.length > 2 ? '...' : ''}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={log.shift === 'morning' ? 'default' : 'secondary'}>
                              {log.shift}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-semibold text-primary">
                            {formatMoney(log.totalAmount)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDateTime(log.deliveredAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/dashboard/admin/delivery-analysis"
          className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-background px-4 font-medium text-foreground transition-colors hover:bg-muted"
        >
          Open delivery analysis
        </Link>
        <Link
          href="/dashboard/admin/bills"
          className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-background px-4 font-medium text-foreground transition-colors hover:bg-muted"
        >
          View bills
        </Link>
      </div>
    </div>
  )
}
