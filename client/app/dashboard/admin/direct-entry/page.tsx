'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CirclePlus, Edit2, Package2, Plus, RefreshCw, Search, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { balanceApi, deliveryLogsApi, housesApi, productRatesApi, type DeliveryLog, type DeliveryLogItem, type House, type ProductRate } from '@/lib/api'
import { cn } from '@/lib/utils'

type DeliveryEntryRow = {
  id: string
  milkType: string
  qty: string
  rate: string
  amount: string
  source: 'qty' | 'amount' | null
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
    amount: '',
    source: null,
  }
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDecimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : ''
}

function calculateAmountFromQty(qty: string, rate: string): string {
  const qtyValue = toNumber(qty)
  const rateValue = toNumber(rate)

  if (!qty.trim() || rateValue <= 0) return ''
  return formatDecimal(qtyValue * rateValue)
}

function calculateQtyFromAmount(amount: string, rate: string): string {
  const amountValue = toNumber(amount)
  const rateValue = toNumber(rate)

  if (!amount.trim() || rateValue <= 0) return ''
  return formatDecimal(amountValue / rateValue)
}

function getRowValues(row: DeliveryEntryRow): { qty: number; rate: number; amount: number } {
  const rate = toNumber(row.rate)

  if (row.source === 'amount') {
    const amount = toNumber(row.amount)
    return {
      qty: rate > 0 ? amount / rate : 0,
      rate,
      amount,
    }
  }

  const qty = toNumber(row.qty)
  return {
    qty,
    rate,
    amount: qty * rate,
  }
}

function formatMoney(value: string | number): string {
  const parsed = Number(value)
  return `₹${Number.isFinite(parsed) ? parsed.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'}`
}

function normalizeName(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizeRateKey(value: string | undefined): string {
  return normalizeName(value).replace(/\bmilk\b/g, '').replace(/\s+/g, ' ').trim()
}

function getGlobalRateByProductName(rates: ProductRate[], productName: string): string {
  const normalizedProductName = normalizeRateKey(productName)
  const match = rates.find((rate) => normalizeRateKey(rate.name) === normalizedProductName)
  return match ? String(match.rate) : ''
}

function getHouseRateByProductName(house: House | undefined, productName: string): string {
  const normalizedProductName = normalizeRateKey(productName)

  if (!house) return ''

  if (normalizeRateKey(house.rate1Type) === normalizedProductName && Number(house.rate1) > 0) {
    return String(house.rate1)
  }

  if (normalizeRateKey(house.rate2Type) === normalizedProductName && Number(house.rate2) > 0) {
    return String(house.rate2)
  }

  return ''
}

function getResolvedRateByProductName(house: House | undefined, rates: ProductRate[], productName: string): string {
  return getHouseRateByProductName(house, productName) || getGlobalRateByProductName(rates, productName)
}

function getTodayDateKey(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDeliveredAtForDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const deliveredAt = new Date(year, month - 1, day)
  const now = new Date()
  deliveredAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0)
  return deliveredAt.toISOString()
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
  const [shift, setShift] = useState<'morning' | 'evening' | 'shop'>('shop')
  const [deliveryDate, setDeliveryDate] = useState(() => getTodayDateKey())
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<DeliveryEntryRow[]>([createRow()])
  const newRowIdRef = useRef<string | null>(null)

  // Edit / Delete state
  const [editingLog, setEditingLog] = useState<DeliveryLog | null>(null)
  const [editForm, setEditForm] = useState<{ items: DeliveryLogItem[]; note: string }>({ items: [], note: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [deletingLog, setDeletingLog] = useState<DeliveryLog | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  useEffect(() => {
    if (newRowIdRef.current) {
      const input = document.getElementById(`milkType-${newRowIdRef.current}`)
      if (input) {
        input.focus()
        input.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      newRowIdRef.current = null
    }
  })

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
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load direct entry data')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [])

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

    const exactMatches: typeof houses = []
    const partialMatches: typeof houses = []

    houses.forEach((house) => {
      const houseNo = house.houseNo.toLowerCase()
      const area = (house.area || '').toLowerCase()

      if (houseNo === q || area === q) {
        exactMatches.push(house)
      } else if (houseNo.includes(q) || area.includes(q)) {
        partialMatches.push(house)
      }
    })

    exactMatches.sort((a, b) => a.houseNo.localeCompare(b.houseNo))
    partialMatches.sort((a, b) => a.houseNo.localeCompare(b.houseNo))

    return [...exactMatches, ...partialMatches]
  }, [houses, houseSearch])

  const items = useMemo(() => {
    return rows
      .map<DeliveryLogItem | null>((row) => {
        const milkType = row.milkType.trim()
        const { qty, rate, amount } = getRowValues(row)

        if (!milkType || qty <= 0 || rate <= 0) {
          return null
        }

        return {
          milkType,
          qty,
          rate,
          amount,
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

  useEffect(() => {
    setRows((current) =>
      current.map((row) => {
        const milkType = row.milkType.trim()
        if (!milkType) return row

        const resolvedRate = getResolvedRateByProductName(selectedHouse, rates, milkType)
        if (row.rate === resolvedRate) return row

        const nextRow: DeliveryEntryRow = { ...row, rate: resolvedRate }

        if (row.source === 'amount') {
          nextRow.qty = calculateQtyFromAmount(row.amount, resolvedRate)
        } else if (row.qty.trim()) {
          nextRow.amount = calculateAmountFromQty(row.qty, resolvedRate)
        }

        return nextRow
      }),
    )
  }, [rates, selectedHouse])

  const shopLogs = useMemo(
    () => [...logs.filter((log) => log.shift === 'shop')].sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime()),
    [logs],
  )

  function updateRowQty(id: string, qty: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row

        return {
          ...row,
          qty,
          amount: calculateAmountFromQty(qty, row.rate),
          source: 'qty',
        }
      }),
    )
  }

  function updateRowAmount(id: string, amount: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row

        return {
          ...row,
          amount,
          qty: calculateQtyFromAmount(amount, row.rate),
          source: 'amount',
        }
      }),
    )
  }

  function updateRowMilkType(id: string, milkType: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row

        const resolvedRate = getResolvedRateByProductName(selectedHouse, rates, milkType)
        const nextRow: DeliveryEntryRow = {
          ...row,
          milkType,
          rate: resolvedRate,
        }

        if (row.source === 'amount') {
          nextRow.qty = calculateQtyFromAmount(row.amount, resolvedRate)
        } else if (row.qty.trim()) {
          nextRow.amount = calculateAmountFromQty(row.qty, resolvedRate)
        }

        return nextRow
      }),
    )
  }

  function addBlankRow() {
    const newRow = createRow()
    newRowIdRef.current = newRow.id
    setRows((current) => [...current, newRow])
  }

  function removeRow(id: string) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current))
  }

  function resetForm() {
    setHouseId('')
    setHouseSearch('')
    setShift('shop')
    setNote('')
    setRows([createRow()])
  }

  function openEdit(log: DeliveryLog) {
    setEditingLog(log)
    setEditForm({
      items: (log.items ?? []).map(item => ({ ...item })),
      note: log.note ?? '',
    })
  }

  async function handleSaveEdit() {
    if (!editingLog) return
    setEditSaving(true)
    try {
      const oldAmount = Number(editingLog.totalAmount) || 0
      const newAmount = editForm.items.reduce((sum, item) => sum + (Number(item.amount) ?? 0), 0)
      const diff = newAmount - oldAmount

      await deliveryLogsApi.update(editingLog.id, {
        items: editForm.items,
        note: editForm.note,
      })

      // Reflect balance change
      if (diff !== 0) {
        try {
          const balance = await balanceApi.get(editingLog.houseId)
          await balanceApi.updateCurrent(
            editingLog.houseId,
            parseFloat(balance.currentBalance) || 0,
          )
        } catch (err) {
          console.warn('Balance update failed:', err)
          toast.warning('Log updated but balance sync failed')
        }
      }

      setLogs(current => current.map(l =>
        l.id === editingLog.id
          ? { ...l, items: editForm.items, note: editForm.note, totalAmount: String(newAmount) }
          : l
      ))
      toast.success('Entry updated successfully')
      setEditingLog(null)
      setEditForm({ items: [], note: '' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update entry')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDeleteLog() {
    if (!deletingLog) return
    setDeleteSaving(true)
    try {
      const amount = Number(deletingLog.totalAmount) || 0

      await deliveryLogsApi.delete(deletingLog.id)

      // Subtract deleted amount from balance
      if (amount > 0) {
        try {
          const balance = await balanceApi.get(deletingLog.houseId)
          await balanceApi.updateCurrent(
            deletingLog.houseId,
            parseFloat(balance.currentBalance) || 0,
          )
        } catch (err) {
          console.warn('Balance update failed:', err)
          toast.warning('Log deleted but balance sync failed')
        }
      }

      setLogs(current => current.filter(l => l.id !== deletingLog.id))
      toast.success('Entry deleted successfully')
      setDeletingLog(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete entry')
    } finally {
      setDeleteSaving(false)
    }
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
        shift: shift,
        items,
        note: note.trim() || undefined,
        deliveredAt: buildDeliveredAtForDate(deliveryDate),
      })

      setLogs((current) => [response.log, ...current])
      toast.success('Direct entry saved successfully')
      resetForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save direct entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">

      <div className=" grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-visible rounded-3xl border border-border bg-card py-0">
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>Direct entry</CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 px-5 py-1 pb-2">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
              </div>
            ) : (
              <>
                <div className="space-y-1">

                  <div className="flex gap-2 items-end">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        id="delivery-house"
                        placeholder="Search by house number or area..."
                        value={houseSearch}
                        onChange={(e) => setHouseSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addBlankRow} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Add blank row
                    </Button>
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



                <div className="space-y-1.5">
                  <Label htmlFor="delivery-date">Date</Label>
                  <Input
                    id="delivery-date"
                    type="date"
                    value={deliveryDate}
                    onChange={(event) => {
                      setDeliveryDate(event.target.value)
                    }}
                  />
                </div>

                <div className="space-y-4">
                  {rows.map((row, index) => {
                    const { amount: rowAmount } = getRowValues(row)

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

                        <div className="grid gap-4 grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`milkType-${row.id}`}>Product</Label>
                            <Input
                              id={`milkType-${row.id}`}
                              list="delivery-products"
                              placeholder="e.g. Cow Milk"
                              value={row.milkType}
                              onChange={(event) => updateRowMilkType(row.id, event.target.value)}
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
                              onChange={(event) => updateRowQty(row.id, event.target.value)}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor={`amount-${row.id}`}>Amount</Label>
                            <Input
                              id={`amount-${row.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0"
                              value={row.amount}
                              onChange={(event) => updateRowAmount(row.id, event.target.value)}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Rate</Label>
                            <div className="text-sm font-semibold text-foreground">
                              {row.rate ? formatMoney(row.rate) : '—'}
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

                <div
                  className={cn(
                    rows.length > 1
                      ? 'sticky bottom-4 z-30 mt-6'
                      : 'mt-6'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-2xl border border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 p-4 shadow-sm',
                      rows.length > 1 && 'border-t'
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Ready to save</p>

                        <p className="text-xs text-muted-foreground">
                          {selectedHouse
                            ? `House ${selectedHouse.houseNo}${selectedHouse.area
                              ? ` · ${selectedHouse.area}`
                              : ''
                            }`
                            : 'Select a house to continue'}
                        </p>

                        {totalQuantity > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Total Qty: {totalQuantity}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            Entry total
                          </p>

                          <p className="text-2xl font-bold text-foreground">
                            {formatMoney(totalAmount)}
                          </p>
                        </div>

                        <Button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className="gap-2"
                        >
                          {saving ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Truck className="h-4 w-4" />
                          )}

                          {saving ? 'Saving...' : 'Save entry'}
                        </Button>
                      </div>
                    </div>
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
            ) : shopLogs.length === 0 ? (
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
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shopLogs.map((log, index) => (
                        <tr
                          key={log.id}
                          className={cn(
                            'border-b border-border/60 transition-colors hover:bg-muted/30',
                            index === shopLogs.length - 1 && 'border-b-0',
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
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                title="Edit entry"
                                onClick={() => openEdit(log)}
                                disabled={Boolean(log.billGenerated)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                title="Delete entry"
                                onClick={() => setDeletingLog(log)}
                                disabled={Boolean(log.billGenerated)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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

      {/* Edit Dialog */}
      <Dialog open={Boolean(editingLog)} onOpenChange={(open) => { if (!open) { setEditingLog(null); setEditForm({ items: [], note: '' }) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>
              {editingLog && `House ${editingLog.house?.houseNo ?? editingLog.houseId} · ${formatDateTime(editingLog.deliveredAt)}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Items */}
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-muted-foreground">
                <div className="col-span-4">Product</div>
                <div className="col-span-3 text-right">Rate</div>
                <div className="col-span-3 text-right">Qty</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>
              {editForm.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="col-span-4">
                    <Select
                      value={item.milkType}
                      onValueChange={val => {
                        const resolvedRate = getResolvedRateByProductName(undefined, rates, val)
                        const newRate = Number(resolvedRate) || Number(item.rate)
                        const updated = [...editForm.items]
                        updated[idx] = { ...updated[idx], milkType: val, rate: newRate, amount: Number(updated[idx].qty) * newRate }
                        setEditForm(f => ({ ...f, items: updated }))
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select product">{item.milkType || 'Select'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {rates.filter(r => r.isActive).map(rate => (
                          <SelectItem key={rate.id} value={rate.name}>
                            {rate.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 text-right">
                    <span className="text-sm text-muted-foreground">₹{Number(item.rate).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={item.qty}
                      onChange={e => {
                        const newQty = Number(e.target.value)
                        const updated = [...editForm.items]
                        updated[idx] = { ...updated[idx], qty: newQty, amount: newQty * Number(item.rate) }
                        setEditForm(f => ({ ...f, items: updated }))
                      }}
                      className="h-8 text-sm text-right"
                    />
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium">
                    ₹{Number(item.amount).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <p className="text-sm font-semibold">
                  Total: ₹{editForm.items.reduce((s, i) => s + Number(i.amount), 0).toLocaleString('en-IN')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditForm(f => ({ ...f, items: [...f.items, { milkType: '', qty: 0, rate: 0, amount: 0 }] }))}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add item
                </Button>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea
                value={editForm.note}
                onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Optional note"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingLog(null); setEditForm({ items: [], note: '' }) }}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={Boolean(deletingLog)} onOpenChange={(open) => { if (!open) setDeletingLog(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingLog && `This will permanently delete the delivery entry for House ${deletingLog.house?.houseNo ?? deletingLog.houseId} (${formatMoney(deletingLog.totalAmount)}) and adjust the house balance accordingly. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLog}
              disabled={deleteSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSaving ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
