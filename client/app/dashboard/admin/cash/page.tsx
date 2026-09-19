'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  Plus, Search, Pencil, Trash2, Eye, ArrowUp, ArrowDown,
  Wallet, Building2, IndianRupee, History, Receipt, X,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  cashApi,
  queryCashHousesForActiveDairy,
  queryCashLogsForActiveDairy,
  queryCashPaymentsForActiveDairy,
  type CashHouse, type CashLog, type CashPayment,
  type CashStats, type CashSupplier,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const LOG_TYPES = ['note', 'visit', 'balance_update', 'payment', 'position', 'supplier_change', 'created']

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

type HouseForm = {
  houseNo: string
  area: string
  phoneNo: string
  note: string
  supplierId: string
  position: string
  previousBalance: string
  active: boolean
}

const EMPTY_HOUSE_FORM: HouseForm = {
  houseNo: '', area: '', phoneNo: '', note: '', supplierId: '',
  position: '0', previousBalance: '0', active: true,
}

export default function AdminCashPage() {
  // Rendered from IndexedDB (offline-first, like the houses page); network
  // fetches below only refresh the local cache in the background.
  const cachedHouses = useLiveQuery(() => queryCashHousesForActiveDairy())
  const houses = useMemo(() => cachedHouses ?? [], [cachedHouses])
  const cachedRecentPayments = useLiveQuery(() => queryCashPaymentsForActiveDairy())
  const recentPayments = useMemo(() => cachedRecentPayments ?? [], [cachedRecentPayments])
  const [stats, setStats] = useState<CashStats | null>(null)
  const [suppliers, setSuppliers] = useState<CashSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('all')

  const [houseDialogOpen, setHouseDialogOpen] = useState(false)
  const [editingHouse, setEditingHouse] = useState<CashHouse | null>(null)
  const [houseForm, setHouseForm] = useState<HouseForm>(EMPTY_HOUSE_FORM)

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

  const [editingPayment, setEditingPayment] = useState<CashPayment | null>(null)
  const [editPayAmount, setEditPayAmount] = useState('')
  const [editPayDiscount, setEditPayDiscount] = useState('')
  const [editPayNote, setEditPayNote] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'house' | 'log' | 'payment'; id: number; label: string } | null
  >(null)

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [s, sup] = await Promise.all([
        cashApi.stats(),
        cashApi.suppliers(),
        // House/payment lists populate IndexedDB via onData; the live
        // queries above re-render from cache automatically.
        cashApi.houses.list(),
        cashApi.payments.list(),
      ])
      setStats(s)
      setSuppliers(sup)
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
    return houses.filter((h) => {
      if (supplierFilter === 'unassigned' && h.supplierId) return false
      if (supplierFilter !== 'all' && supplierFilter !== 'unassigned' && h.supplierId !== supplierFilter) return false
      if (!q) return true
      return (
        h.houseNo.toLowerCase().includes(q) ||
        (h.area ?? '').toLowerCase().includes(q) ||
        (h.phoneNo ?? '').includes(q) ||
        (h.supplier?.username ?? '').toLowerCase().includes(q)
      )
    })
  }, [houses, search, supplierFilter])

  const supplierName = useCallback((uuid?: string | null) => {
    if (!uuid) return '—'
    return suppliers.find((s) => s.uuid === uuid)?.username ?? '—'
  }, [suppliers])

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

  function openCreate() {
    setEditingHouse(null)
    setHouseForm(EMPTY_HOUSE_FORM)
    setHouseDialogOpen(true)
  }

  function openEdit(house: CashHouse) {
    setEditingHouse(house)
    setHouseForm({
      houseNo: house.houseNo,
      area: house.area ?? '',
      phoneNo: house.phoneNo ?? '',
      note: house.note ?? '',
      supplierId: house.supplierId ?? '',
      position: String(house.position ?? 0),
      previousBalance: String(num(house.previousBalance)),
      active: house.active,
    })
    setHouseDialogOpen(true)
  }

  async function saveHouse() {
    if (!houseForm.houseNo.trim()) { toast.error('House number is required'); return }
    setSaving(true)
    try {
      const payload = {
        houseNo: houseForm.houseNo.trim(),
        area: houseForm.area.trim() || undefined,
        phoneNo: houseForm.phoneNo.trim() || undefined,
        note: houseForm.note.trim() || undefined,
        supplierId: houseForm.supplierId || undefined,
        position: Number(houseForm.position) || 0,
        previousBalance: Number(houseForm.previousBalance) || 0,
        ...(editingHouse ? { active: houseForm.active } : {}),
      }
      if (editingHouse) {
        await cashApi.houses.update(editingHouse.id, payload)
        toast.success('Cash house updated')
      } else {
        await cashApi.houses.create(payload)
        toast.success('Cash house created')
      }
      setHouseDialogOpen(false)
      await loadAll(true)
      if (detailHouseId && editingHouse?.id === detailHouseId) void refreshDetail(detailHouseId, true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save cash house')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      if (deleteTarget.kind === 'house') {
        await cashApi.houses.remove(deleteTarget.id)
        if (detailHouseId === deleteTarget.id) setDetailHouseId(null)
        toast.success('Cash house deleted')
      } else if (deleteTarget.kind === 'log') {
        await cashApi.logs.remove(deleteTarget.id)
        toast.success('Log deleted')
        if (detailHouseId) void refreshDetail(detailHouseId, true)
      } else {
        await cashApi.payments.remove(deleteTarget.id)
        toast.success('Payment deleted and balance restored')
        if (detailHouseId) void refreshDetail(detailHouseId, true)
      }
      setDeleteTarget(null)
      await loadAll(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

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

  async function addLog() {
    if (!detailHouseId) return
    if (!logTitle.trim() && !logDescription.trim()) { toast.error('Enter a title or description'); return }
    const amount = logAmount ? Number(logAmount) : undefined
    if (amount && logBalanceEffect === 'none') {
      toast.error('Select Increase or Decrease for a balance-changing log')
      return
    }
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
      await loadAll(true)
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

  function openEditPayment(p: CashPayment) {
    setEditingPayment(p)
    setEditPayAmount(String(num(p.amount)))
    setEditPayDiscount(String(num(p.discount)))
    setEditPayNote(p.note ?? '')
  }

  async function saveEditedPayment() {
    if (!editingPayment) return
    try {
      await cashApi.payments.update(editingPayment.id, {
        amount: Number(editPayAmount),
        discount: Number(editPayDiscount) || 0,
        note: editPayNote.trim() || undefined,
      })
      toast.success('Payment updated')
      setEditingPayment(null)
      if (detailHouseId) void refreshDetail(detailHouseId, true)
      await loadAll(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update payment')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Cash Section
          </h1>
          <p className="text-sm text-muted-foreground">
            Independent cash houses with their own logs and payment history.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Cash House
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Houses
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
          <TabsTrigger value="houses">Houses</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="houses" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search house no, area, phone, supplier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.uuid} value={s.uuid}>{s.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>House No</TableHead>
                  <TableHead>Supplier</TableHead>
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
                    <TableCell>{h.supplier?.username ?? supplierName(h.supplierId) ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 tabular-nums">{h.position}</span>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Move up" onClick={() => void moveHouse(h.id, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Move down" onClick={() => void moveHouse(h.id, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(h.previousBalance)}</TableCell>
                    <TableCell>
                      {h.active
                        ? <Badge variant="secondary">Active</Badge>
                        : <Badge variant="outline" className="text-destructive">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View logs & payments" onClick={() => openDetail(h)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit" onClick={() => openEdit(h)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => setDeleteTarget({ kind: 'house', id: h.id, label: h.houseNo })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredHouses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No cash houses found. Click “Add Cash House” to create one.'}
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
                  <TableHead>Recorded By</TableHead>
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
                    <TableCell>{p.recordedBy ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {recentPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No payments recorded yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create / Edit house dialog */}
      <Dialog open={houseDialogOpen} onOpenChange={setHouseDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingHouse ? `Edit Cash House ${editingHouse.houseNo}` : 'Add Cash House'}</DialogTitle>
            <DialogDescription>Cash houses are fully independent from dairy billing houses.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ch-no">House No *</Label>
              <Input id="ch-no" value={houseForm.houseNo} onChange={(e) => setHouseForm((f) => ({ ...f, houseNo: e.target.value }))} placeholder="e.g. C-101" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-area">Area</Label>
              <Input id="ch-area" value={houseForm.area} onChange={(e) => setHouseForm((f) => ({ ...f, area: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-phone">Phone</Label>
              <Input id="ch-phone" value={houseForm.phoneNo} onChange={(e) => setHouseForm((f) => ({ ...f, phoneNo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-supplier">Supplier</Label>
              <Select value={houseForm.supplierId || 'none'} onValueChange={(v) => setHouseForm((f) => ({ ...f, supplierId: v === 'none' ? '' : v }))}>
                <SelectTrigger id="ch-supplier"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.uuid} value={s.uuid}>{s.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-pos">Position</Label>
              <Input id="ch-pos" type="number" min={0} value={houseForm.position} onChange={(e) => setHouseForm((f) => ({ ...f, position: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-prev">Previous Balance (₹)</Label>
              <Input id="ch-prev" type="number" min={0} step="0.01" value={houseForm.previousBalance} onChange={(e) => setHouseForm((f) => ({ ...f, previousBalance: e.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ch-note">Note</Label>
              <Textarea id="ch-note" rows={2} value={houseForm.note} onChange={(e) => setHouseForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            {editingHouse && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ch-active">Status</Label>
                <Select value={houseForm.active ? 'active' : 'inactive'} onValueChange={(v) => setHouseForm((f) => ({ ...f, active: v === 'active' }))}>
                  <SelectTrigger id="ch-active"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHouseDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveHouse()} disabled={saving}>{saving ? 'Saving…' : editingHouse ? 'Save Changes' : 'Create House'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* House detail dialog: logs + payments */}
      <Dialog open={detailHouseId !== null} onOpenChange={(o) => { if (!o) setDetailHouseId(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Cash House {detailHouse?.houseNo ?? ''}
            </DialogTitle>
            <DialogDescription>
              {detailHouse && (
                <>Balance: {inr(detailHouse.previousBalance)}
                  {' '}· Supplier: {detailHouse.supplier?.username ?? supplierName(detailHouse.supplierId) ?? '—'}</>
              )}
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
                          <th className="py-2 pr-3 font-semibold">Note</th>
                          <th className="py-2 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailPayments.map((p) => (
                          <tr key={p.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                            <td className="py-2 pr-3 text-right font-semibold text-emerald-600">{inr(p.amount)}</td>
                            <td className="py-2 pr-3 text-right text-red-500">{num(p.discount) > 0 ? inr(p.discount) : '—'}</td>
                            <td className="py-2 pr-3 max-w-40 truncate">{p.note ?? '—'}</td>
                            <td className="py-2 text-right whitespace-nowrap">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => openEditPayment(p)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                title="Delete"
                                onClick={() => setDeleteTarget({ kind: 'payment', id: p.id, label: inr(p.amount) })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold">Add Log Entry</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
                  <div className="space-y-1">
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
                      <div key={l.id} className="flex items-start justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                        <div className="min-w-0">
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
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
                          title="Delete log"
                          onClick={() => setDeleteTarget({ kind: 'log', id: l.id, label: l.title ?? l.type })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
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

      {/* Edit payment dialog */}
      <Dialog open={editingPayment !== null} onOpenChange={(o) => { if (!o) setEditingPayment(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" min={0} step="0.01" value={editPayAmount} onChange={(e) => setEditPayAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Discount (₹)</Label>
              <Input type="number" min={0} step="0.01" value={editPayDiscount} onChange={(e) => setEditPayDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={editPayNote} onChange={(e) => setEditPayNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPayment(null)}>Cancel</Button>
            <Button onClick={() => void saveEditedPayment()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.kind}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'house'
                ? `Cash house “${deleteTarget.label}” and all its logs and payments will be permanently deleted.`
                : deleteTarget?.kind === 'payment'
                  ? `Payment of ${deleteTarget?.label} will be deleted and the house balance will be restored.`
                  : `Log “${deleteTarget?.label}” will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
