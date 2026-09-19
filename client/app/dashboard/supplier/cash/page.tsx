'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  Search, Eye, ArrowUp, ArrowDown,
  Wallet, Building2, IndianRupee, History, Receipt,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  cashApi,
  queryCashHousesForActiveDairy,
  queryCashLogsForActiveDairy,
  queryCashPaymentsForActiveDairy,
  type CashHouse, type CashLog, type CashPayment, type CashStats,
} from '@/lib/api'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const LOG_TYPES = ['note', 'visit', 'payment']

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function inr(v: unknown): string {
  return `₹${num(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayInput(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function SupplierCashPage() {
  // Rendered from IndexedDB (offline-first, like the houses page); network
  // fetches below only refresh the local cache in the background.
  const cachedHouses = useLiveQuery(() => queryCashHousesForActiveDairy())
  const houses = useMemo(() => cachedHouses ?? [], [cachedHouses])
  const [stats, setStats] = useState<CashStats | null>(null)
  const cachedRecentPayments = useLiveQuery(() => queryCashPaymentsForActiveDairy())
  const recentPayments = useMemo(() => cachedRecentPayments ?? [], [cachedRecentPayments])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')

  const [detailHouseId, setDetailHouseId] = useState<number | null>(null)
  const cachedDetailLogs = useLiveQuery(
    () => (detailHouseId == null ? Promise.resolve([] as CashLog[]) : queryCashLogsForActiveDairy(detailHouseId)),
    [detailHouseId],
  )
  const detailLogs = useMemo(() => cachedDetailLogs ?? [], [cachedDetailLogs])
  const cachedDetailPayments = useLiveQuery(
    () => (detailHouseId == null ? Promise.resolve([] as CashPayment[]) : queryCashPaymentsForActiveDairy(detailHouseId)),
    [detailHouseId],
  )
  const detailPayments = useMemo(() => cachedDetailPayments ?? [], [cachedDetailPayments])
  const [detailLoading, setDetailLoading] = useState(false)
  const detailCacheEmptyRef = useRef(true)
  useEffect(() => {
    detailCacheEmptyRef.current = detailLogs.length === 0 && detailPayments.length === 0
  })

  const [logType, setLogType] = useState('note')
  const [logTitle, setLogTitle] = useState('')
  const [logDescription, setLogDescription] = useState('')
  const [logAmount, setLogAmount] = useState('')
  const [logBalanceEffect, setLogBalanceEffect] = useState<'none' | 'increase' | 'decrease'>('none')

  const [payAmount, setPayAmount] = useState('')
  const [payDiscount, setPayDiscount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payDate, setPayDate] = useState(todayInput())

  const [positionHouse, setPositionHouse] = useState<CashHouse | null>(null)
  const [positionValue, setPositionValue] = useState('0')

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [s] = await Promise.all([
        cashApi.stats(),
        // House/payment lists populate IndexedDB via onData; the live
        // queries above re-render from cache automatically.
        cashApi.houses.list(),
        cashApi.payments.list(),
      ])
      setStats(s)
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : 'Failed to load cash section')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  const detailHouse = useMemo(
    () => houses.find((h) => h.id === detailHouseId) ?? null,
    [houses, detailHouseId],
  )

  const filteredHouses = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return houses
    return houses.filter((h) =>
      h.houseNo.toLowerCase().includes(q) ||
      (h.area ?? '').toLowerCase().includes(q) ||
      (h.phoneNo ?? '').includes(q),
    )
  }, [houses, search])

  const refreshDetail = useCallback(async (houseId: number, silent = false) => {
    // Skip the spinner when cached rows are already on screen.
    if (!silent && detailCacheEmptyRef.current) setDetailLoading(true)
    try {
      await Promise.all([
        cashApi.logs.list(houseId),
        cashApi.payments.list(houseId),
      ])
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : 'Failed to load house details')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openDetail = useCallback((house: CashHouse) => {
    setDetailHouseId(house.id)
    setLogType('note'); setLogTitle(''); setLogDescription(''); setLogAmount(''); setLogBalanceEffect('none')
    setPayAmount(''); setPayDiscount(''); setPayNote(''); setPayDate(todayInput())
    void refreshDetail(house.id, true)
  }, [refreshDetail])

  async function moveHouse(id: number, dir: -1 | 1) {
    const ordered = [...houses].sort((a, b) => (a.position - b.position) || a.houseNo.localeCompare(b.houseNo))
    const idx = ordered.findIndex((h) => h.id === id)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return
    const next = [...ordered]
    const tmp = next[idx]!
    next[idx] = next[swapIdx]!
    next[swapIdx] = tmp
    try {
      await cashApi.houses.reorder(next.map((h) => h.id))
      toast.success('Route position updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder')
    }
  }

  function openPosition(house: CashHouse) {
    setPositionHouse(house)
    setPositionValue(String(house.position ?? 0))
  }

  async function savePosition() {
    if (!positionHouse) return
    try {
      await cashApi.houses.update(positionHouse.id, { position: Number(positionValue) || 0 })
      toast.success('Position updated')
      setPositionHouse(null)
      await loadAll(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update position')
    }
  }

  async function addLog() {
    if (!detailHouseId) return
    if (!logTitle.trim() && !logDescription.trim()) { toast.error('Enter a title or description'); return }
    const amount = logAmount ? Number(logAmount) : undefined
    if (logBalanceEffect !== 'none' && (!amount || amount <= 0)) {
      toast.error('Enter a valid amount for the balance change')
      return
    }
    const balanceChange =
      amount && logBalanceEffect !== 'none'
        ? logBalanceEffect === 'increase'
          ? amount
          : -amount
        : undefined
    try {
      await cashApi.logs.create({
        houseId: detailHouseId,
        type: logType,
        title: logTitle.trim() || undefined,
        description: logDescription.trim() || undefined,
        amount,
        balanceChange,
      })
      toast.success('Log added')
      setLogTitle(''); setLogDescription(''); setLogAmount(''); setLogBalanceEffect('none')
      await refreshDetail(detailHouseId, true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add log')
    }
  }

  async function addPayment() {
    if (!detailHouseId) return
    if (!payAmount || Number(payAmount) <= 0) { toast.error('Enter a valid amount'); return }
    try {
      await cashApi.payments.create({
        houseId: detailHouseId,
        amount: Number(payAmount),
        discount: payDiscount ? Number(payDiscount) : 0,
        note: payNote.trim() || undefined,
        paidAt: payDate || undefined,
      })
      toast.success('Payment recorded')
      setPayAmount(''); setPayDiscount(''); setPayNote(''); setPayDate(todayInput())
      await refreshDetail(detailHouseId, true)
      await loadAll(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" /> Cash Section
        </h1>
        <p className="text-sm text-muted-foreground">
          Your assigned cash houses — manage route positions, logs and payments.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> My Houses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.totalHouses ?? (loading ? '…' : 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats ? inr(stats.totalPreviousBalance) : '…'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <IndianRupee className="h-3.5 w-3.5" /> Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{stats ? inr(stats.totalReceived) : '…'}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="houses">
        <TabsList>
          <TabsTrigger value="houses">My Houses</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="houses" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search house no, area, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>House No</TableHead>
                  <TableHead className="text-right">Pos</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHouses.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">
                      {h.houseNo}
                      {h.area && <span className="block text-xs text-muted-foreground">{h.area}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        className="mr-1 tabular-nums underline decoration-dotted underline-offset-2"
                        title="Set position"
                        onClick={() => openPosition(h)}
                      >
                        {h.position}
                      </button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Move up" onClick={() => void moveHouse(h.id, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Move down" onClick={() => void moveHouse(h.id, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {inr(h.previousBalance)}
                    </TableCell>
                    <TableCell>
                      {h.active
                        ? <Badge variant="secondary">Active</Badge>
                        : <Badge variant="outline" className="text-destructive">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View logs & payments" onClick={() => openDetail(h)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredHouses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No cash houses assigned to you yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>House</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(p.paidAt)}</TableCell>
                    <TableCell className="font-medium">{p.house?.houseNo ?? `#${p.houseId}`}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">{inr(p.amount)}</TableCell>
                    <TableCell className="text-right text-red-500">{num(p.discount) > 0 ? inr(p.discount) : '—'}</TableCell>
                    <TableCell className="max-w-56 truncate">{p.note ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {recentPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No payments recorded yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* House detail dialog */}
      <Dialog open={detailHouseId !== null} onOpenChange={(o) => { if (!o) setDetailHouseId(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Cash House {detailHouse?.houseNo ?? ''}
            </DialogTitle>
            <DialogDescription>
              {detailHouse && <>Balance: {inr(detailHouse.previousBalance)}</>}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-6 py-2">
              <div className="rounded-xl border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Receipt className="h-4 w-4" /> Record Payment
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Amount (₹) *</Label>
                    <Input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Discount (₹)</Label>
                    <Input type="number" min={0} step="0.01" value={payDiscount} onChange={(e) => setPayDiscount(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Note</Label>
                    <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="h-9" placeholder="Optional" />
                  </div>
                </div>
                <Button size="sm" onClick={() => void addPayment()}>Record Payment</Button>

                {detailPayments.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="py-2 pr-3 font-semibold">Date</th>
                          <th className="py-2 pr-3 font-semibold text-right">Paid</th>
                          <th className="py-2 pr-3 font-semibold text-right">Disc.</th>
                          <th className="py-2 font-semibold">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailPayments.map((p) => (
                          <tr key={p.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                            <td className="py-2 pr-3 text-right font-semibold text-emerald-600">{inr(p.amount)}</td>
                            <td className="py-2 pr-3 text-right text-red-500">{num(p.discount) > 0 ? inr(p.discount) : '—'}</td>
                            <td className="py-2 max-w-40 truncate">{p.note ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold">Add Log Entry</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={logType} onValueChange={setLogType}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOG_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input value={logTitle} onChange={(e) => setLogTitle(e.target.value)} className="h-9" placeholder="Short title" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount (₹)</Label>
                    <Input type="number" min={0} step="0.01" value={logAmount} onChange={(e) => setLogAmount(e.target.value)} className="h-9" placeholder="Optional" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Balance effect</Label>
                    <Select value={logBalanceEffect} onValueChange={(v) => setLogBalanceEffect(v as 'none' | 'increase' | 'decrease')}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No change</SelectItem>
                        <SelectItem value="increase">Increase (+)</SelectItem>
                        <SelectItem value="decrease">Decrease (−)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea rows={2} value={logDescription} onChange={(e) => setLogDescription(e.target.value)} placeholder="Details…" />
                </div>
                <Button size="sm" variant="outline" onClick={() => void addLog()}>Add Log</Button>

                {detailLogs.length > 0 && (
                  <div className="space-y-2">
                    {detailLogs.map((l) => (
                      <div key={l.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[11px]">{l.type}</Badge>
                          {l.title && <span className="font-medium">{l.title}</span>}
                          {l.balanceChange !== null && l.balanceChange !== undefined && (
                            <span className={num(l.balanceChange) >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                              {num(l.balanceChange) >= 0 ? '+' : '−'}{inr(Math.abs(num(l.balanceChange)))}
                            </span>
                          )}
                          {!l.balanceChange && num(l.amount) > 0 && <span className="text-muted-foreground">{inr(l.amount)}</span>}
                        </div>
                        {l.description && <p className="mt-0.5 text-muted-foreground">{l.description}</p>}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {fmtDate(l.createdAt)}{l.createdBy ? ` · by ${l.createdBy}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setDetailHouseId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set position dialog */}
      <Dialog open={positionHouse !== null} onOpenChange={(o) => { if (!o) setPositionHouse(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Route Position</DialogTitle>
            <DialogDescription>House {positionHouse?.houseNo} — lower numbers appear first.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Position</Label>
            <Input type="number" min={0} value={positionValue} onChange={(e) => setPositionValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPositionHouse(null)}>Cancel</Button>
            <Button onClick={() => void savePosition()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
