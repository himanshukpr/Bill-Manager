'use client'

import { useEffect, useState, useCallback } from 'react'
import { IndianRupee, Plus, Search, Receipt, History } from 'lucide-react'
import { balanceApi, housesApi, type PaymentHistory, type House } from '@/lib/api'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function ReceiptsPage() {
  const [payments, setPayments] = useState<PaymentHistory[]>([])
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form
  const [formHouseId, setFormHouseId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formNote, setFormNote] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [paymentsData, housesData] = await Promise.all([
        balanceApi.allPayments(),
        housesApi.list(),
      ])
      setPayments(paymentsData)
      setHouses(housesData)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = payments.filter(p => {
    const house = p.balance?.house
    if (!house) return true
    return house.houseNo.toLowerCase().includes(search.toLowerCase()) ||
      house.area?.toLowerCase().includes(search.toLowerCase())
  })

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  async function handleRecord() {
    if (!formHouseId || !formAmount) { toast.error('House and Amount are required'); return }
    setSaving(true)
    try {
      await balanceApi.record({
        houseId: parseInt(formHouseId),
        amount: parseFloat(formAmount),
        note: formNote || undefined,
      })
      toast.success('Payment recorded')
      setDialogOpen(false)
      setFormHouseId('')
      setFormAmount('')
      setFormNote('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Receipts & Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Record and track payments received from houses</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </div>

      {/* Summary Card */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 p-5">
        <p className="text-sm font-medium text-muted-foreground">Total Received (All Time)</p>
        <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
          ₹{totalReceived.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? 's' : ''} recorded</p>
      </div>

      {/* Search + Table */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by house no or area..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Receipt className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">No payments found</p>
              <p className="text-sm mt-1">Click "Record Payment" to log a new receipt</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">House</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Amount</th>
                    <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Note</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => (
                    <tr key={p.id} className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${idx === filtered.length - 1 ? 'border-b-0' : ''}`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold">{p.balance?.house?.houseNo ?? '—'}</p>
                          {p.balance?.house?.area && <p className="text-xs text-muted-foreground">{p.balance.house.area}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          ₹{Number(p.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-muted-foreground text-xs">{p.note ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Log a payment received from a house. This will reduce their pending balance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>House</Label>
              <Select value={formHouseId} onValueChange={setFormHouseId}>
                <SelectTrigger><SelectValue placeholder="Select house" /></SelectTrigger>
                <SelectContent>
                  {houses.map(h => (
                    <SelectItem key={h.id} value={String(h.id)}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{h.houseNo}</span>
                        {h.area && <span className="text-muted-foreground text-xs">— {h.area}</span>}
                        {h.balance && (
                          <span className="ml-auto text-amber-600 dark:text-amber-400 text-xs font-semibold">
                            ₹{Number(h.balance.previousBalance).toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="receipt-amount">Amount (₹) <span className="text-destructive">*</span></Label>
              <Input id="receipt-amount" type="number" min="0.01" step="0.01" placeholder="e.g. 1500" value={formAmount}
                onChange={e => setFormAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="receipt-note">Note (Optional)</Label>
              <Textarea id="receipt-note" placeholder="e.g. Cash received on 1st April" value={formNote}
                onChange={e => setFormNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecord} disabled={saving}>
              {saving ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}