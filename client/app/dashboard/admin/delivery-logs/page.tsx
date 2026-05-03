'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, Truck, Package, Edit2, Trash2, Save, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { deliveryLogsApi, type DeliveryLog, type DeliveryLogItem, housesApi, productRatesApi, type House, type ProductRate } from '@/lib/api'

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function getLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type EditingLog = {
  log: DeliveryLog
  items: Array<{ milkType: string; qty: string; rate: string }>
}

export default function DeliveryLogsPage() {
  const [logs, setLogs] = useState<DeliveryLog[]>([])
  const [houses, setHouses] = useState<Map<number, House>>(new Map())
  const [productRates, setProductRates] = useState<ProductRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [editingLog, setEditingLog] = useState<EditingLog | null>(null)
  const [deletingLog, setDeletingLog] = useState<DeliveryLog | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [logsData, housesData, ratesData] = await Promise.all([
          deliveryLogsApi.list(),
          housesApi.list(),
          productRatesApi.list(),
        ])
        setLogs(logsData)
        const houseMap = new Map<number, House>()
        for (const house of housesData) {
          houseMap.set(house.id, house)
        }
        setHouses(houseMap)
        setProductRates(ratesData)
      } catch { /* silently fail */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const ratesMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const rate of productRates) {
      const name = (rate.name || '').trim()
      if (name) {
        map[name] = String(rate.rate)
      }
    }
    return map
  }, [productRates])

  const activeRates = useMemo(
    () => productRates
      .filter((rate) => rate.isActive && Number(rate.rate) > 0)
      .map((rate) => ({ ...rate, name: (rate.name || '').trim() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [productRates],
  )

  const groupedLogs = useMemo(() => {
    const groups: Record<string, DeliveryLog[]> = {}
    for (const log of logs) {
      const date = new Date(log.createdAt || log.deliveredAt)
      const key = getLocalDateKey(date)
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(log)
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [logs])

  const todayKey = getLocalDateKey(new Date())

  async function handleSaveEdit() {
    if (!editingLog) return

    const items: DeliveryLogItem[] = (editingLog.items || [])
      .map((item) => {
        const qty = Number(item.qty)
        const rate = Number(item.rate)
        if (!item.milkType.trim() || qty <= 0 || rate <= 0) return null
        return {
          milkType: item.milkType.trim(),
          qty,
          rate,
          amount: qty * rate,
        }
      })
      .filter((item): item is DeliveryLogItem => item !== null)

    if (items.length === 0) {
      toast.error('Add at least one item with valid quantity and rate')
      return
    }

    setSaving(true)
    try {
      const updated = await deliveryLogsApi.update(editingLog.log.id, { items })
      setLogs((prev) => prev.map((l) => (l.id === editingLog.log.id ? updated : l)))
      toast.success('Delivery log updated successfully')
      setEditingLog(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to update delivery log')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingLog) return

    setSaving(true)
    try {
      await deliveryLogsApi.delete(deletingLog.id)
      setLogs((prev) => prev.filter((l) => l.id !== deletingLog.id))
      toast.success('Delivery log deleted successfully')
      setDeletingLog(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete delivery log')
    } finally {
      setSaving(false)
    }
  }

  const [refreshKey, setRefreshKey] = useState(0)

  function startEdit(log: DeliveryLog) {
    const items = (log.items || []).map((item) => ({
      milkType: (item.milkType || '').trim(),
      qty: String(item.qty),
      rate: String(item.rate),
    }))
    if (items.length === 0) {
      items.push({ milkType: '', qty: '', rate: '' })
    }
    setEditingLog({ log, items })
    setRefreshKey(k => k + 1)
  }

  function updateEditItem(index: number, field: 'milkType' | 'qty' | 'rate', value: string, rateValue?: string) {
    if (!editingLog) return
    const currentItems = editingLog.items || []
    const newItems = [...currentItems]
    const newValue = field === 'milkType' ? value.trim() : value
    newItems[index] = { ...newItems[index], [field]: newValue }
    if (rateValue) {
      newItems[index].rate = rateValue
    }
    setEditingLog({ ...editingLog, items: newItems })
    setRefreshKey(k => k + 1)
  }

  function addEditItem() {
    if (!editingLog) return
    const currentItems = editingLog.items || []
    setEditingLog({
      ...editingLog,
      items: [...currentItems, { milkType: '', qty: '', rate: '' }],
    })
  }

  function removeEditItem(index: number) {
    if (!editingLog) return
    const currentItems = editingLog.items || []
    if (currentItems.length <= 1) return
    const newItems = currentItems.filter((_, i) => i !== index)
    setEditingLog({ ...editingLog, items: newItems })
  }

  const editTotal = useMemo(() => {
    if (!editingLog) return 0
    return editingLog.items.reduce((sum, item) => {
      const qty = Number(item.qty) || 0
      const rate = Number(item.rate) || 0
      return sum + qty * rate
    }, 0)
  }, [editingLog?.items])

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/admin">
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Delivery Logs</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            All delivery records grouped by date
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Truck className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">No delivery logs found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedLogs.map(([dateKey, dateLogs]) => {
            const date = new Date(dateKey)
            const isToday = dateKey === todayKey
            const totalForDay = dateLogs.reduce((sum, log) => sum + Number(log.totalAmount || 0), 0)

            return (
              <div key={dateKey} className="rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-base font-bold ${isToday ? 'text-primary' : ''}`}>
                      {date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {isToday && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        Today
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {dateLogs.length} delivery · ₹{totalForDay.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th className="px-5 py-3 text-left font-semibold text-muted-foreground">House</th>
                        <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Supplier</th>
                        <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Shift</th>
                        <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Items</th>
                        <th className="hidden sm:table-cell px-5 py-3 text-right font-semibold text-muted-foreground">Total</th>
                        <th className="px-5 py-3 text-center font-semibold text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateLogs.map((log, i) => (
                        <tr key={log.id}
                          className={`border-b border-border/60 hover:bg-muted/20 transition-colors ${i === dateLogs.length - 1 ? 'border-b-0' : ''}`}>
                          <td className="px-5 py-3 font-semibold">{log.house?.houseNo}</td>
                          <td className="px-5 py-3 text-muted-foreground">{log.supplier?.username || '—'}</td>
                          <td className="px-5 py-3 text-muted-foreground capitalize">{log.shift}</td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {log.items?.map((item) => `${item.milkType} ${item.qty}L`).join(', ')}
                          </td>
                          <td className="hidden sm:table-cell px-5 py-3 text-right font-bold text-primary">
                            ₹{Number(log.totalAmount).toLocaleString('en-IN')}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => startEdit(log)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => setDeletingLog(log)}
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
            )
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <AlertDialog open={!!editingLog} onOpenChange={(open) => !open && setEditingLog(null)}>
        <AlertDialogContent className="max-h-[90vh] w-[90vw] max-w-2xl overflow-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Delivery Log</AlertDialogTitle>
            <AlertDialogDescription>
              Update the delivery items for House {editingLog?.log.house?.houseNo}. The balance will be recalculated automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {editingLog && (
            <div className="space-y-4 py-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">House {editingLog.log.house?.houseNo}</p>
                    <p className="text-sm text-muted-foreground">
                      {editingLog.log.shift} · {new Date(editingLog.log.deliveredAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">New Total</p>
                    <p className="text-xl font-bold text-primary">₹{editTotal.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {editingLog.items.map((item, index) => (
                  <div key={index} className="flex flex-wrap gap-2 items-center p-2 rounded border border-border">
                    <span className="text-xs w-12 text-muted-foreground">{index + 1}</span>
                    <Select
                      key={`select-${refreshKey}-${index}`}
                      defaultValue={item.milkType}
                      onValueChange={(value) => {
                        updateEditItem(index, 'milkType', value, ratesMap[value] || '')
                      }}
                    >
                      <SelectTrigger className="h-7 w-28">
                        <SelectValue placeholder="Product" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeRates.map((rate) => (
                          <SelectItem key={rate.id} value={rate.name}>
                            {rate.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => updateEditItem(index, 'qty', e.target.value)}
                      className="h-7 w-16"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={(e) => updateEditItem(index, 'rate', e.target.value)}
                      className="h-7 w-16"
                    />
                    <span className="text-xs w-20 font-semibold">
                      ₹{((Number(item.qty) || 0) * (Number(item.rate) || 0)).toLocaleString('en-IN')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeEditItem(index)}
                      disabled={editingLog.items.length <= 1}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={addEditItem}
                  className="mt-2 w-full"
                >
                  + Add Item
                </Button>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={handleSaveEdit} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingLog} onOpenChange={(open) => !open && setDeletingLog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Delivery Log</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this delivery log for House {deletingLog?.house?.houseNo}?
              This will deduct ₹{deletingLog?.totalAmount ? Number(deletingLog.totalAmount).toLocaleString('en-IN') : '0'} from the house balance.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              <Trash2 className="mr-2 h-4 w-4" />
              {saving ? 'Deleting...' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}