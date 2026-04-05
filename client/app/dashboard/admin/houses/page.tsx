'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, Phone, MapPin, Building2,
  Pencil, Trash2, Eye, IndianRupee, ChevronRight
} from 'lucide-react'
import { housesApi, type House } from '@/lib/api'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

type HouseForm = {
  houseNo: string; area: string; phoneNo: string; alternativePhone: string;
  description: string; rate1Type: string; rate1: string; rate2Type: string; rate2: string;
}

const emptyForm: HouseForm = {
  houseNo: '', area: '', phoneNo: '', alternativePhone: '',
  description: '', rate1Type: '', rate1: '', rate2Type: '', rate2: ''
}

export default function HousesPage() {
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<HouseForm>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [viewHouse, setViewHouse] = useState<House | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await housesApi.list()
      setHouses(data)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = houses.filter(h =>
    h.houseNo.toLowerCase().includes(search.toLowerCase()) ||
    h.area?.toLowerCase().includes(search.toLowerCase()) ||
    h.phoneNo.includes(search)
  )

  function openAdd() {
    setForm(emptyForm)
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(h: House) {
    setForm({
      houseNo: h.houseNo, area: h.area ?? '', phoneNo: h.phoneNo,
      alternativePhone: h.alternativePhone ?? '', description: h.description ?? '',
      rate1Type: h.rate1Type ?? '', rate1: h.rate1 ?? '',
      rate2Type: h.rate2Type ?? '', rate2: h.rate2 ?? '',
    })
    setEditingId(h.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.houseNo || !form.phoneNo) {
      toast.error('House No and Phone No are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        houseNo: form.houseNo, area: form.area || undefined,
        phoneNo: form.phoneNo, alternativePhone: form.alternativePhone || undefined,
        description: form.description || undefined,
        rate1Type: form.rate1Type || undefined, rate1: form.rate1 ? form.rate1 : undefined,
        rate2Type: form.rate2Type || undefined, rate2: form.rate2 ? form.rate2 : undefined,
      }
      if (editingId) {
        await housesApi.update(editingId, payload)
        toast.success('House updated')
      } else {
        await housesApi.create(payload)
        toast.success('House added')
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await housesApi.delete(deleteId)
      toast.success('House deleted')
      setDeleteId(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function openView(h: House) {
    try {
      const full = await housesApi.get(h.id)
      setViewHouse(full)
    } catch {
      setViewHouse(h)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Administration
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Houses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage all registered dairy delivery houses
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Add House
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by house no, area or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">{search ? 'No houses match your search' : 'No houses yet'}</p>
            {!search && <p className="text-sm mt-1">Click "Add House" to get started</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">House No</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Area</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Phone</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Rate 1</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Rate 2</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Balance</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h, idx) => (
                  <tr
                    key={h.id}
                    className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${idx === filtered.length - 1 ? 'border-b-0' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">{h.houseNo}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        {h.area && <MapPin className="h-3 w-3 shrink-0" />}
                        {h.area || '—'}
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />
                        {h.phoneNo}
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3">
                      {h.rate1Type ? (
                        <Badge variant="outline" className="gap-1 font-medium">
                          {h.rate1Type} — ₹{h.rate1}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3">
                      {h.rate2Type ? (
                        <Badge variant="outline" className="gap-1 font-medium">
                          {h.rate2Type} — ₹{h.rate2}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {h.balance ? (
                        <span className={`font-semibold ${Number(h.balance.previousBalance) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          ₹{Number(h.balance.previousBalance).toLocaleString('en-IN')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openView(h)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(h)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(h.id)} title="Delete"
                          className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit House' : 'Add New House'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update house details below.' : 'Fill in the house details to add a new delivery location.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="house-houseNo">House No <span className="text-destructive">*</span></Label>
              <Input id="house-houseNo" value={form.houseNo} onChange={e => setForm(f => ({ ...f, houseNo: e.target.value }))} placeholder="e.g. A-101" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-area">Area</Label>
              <Input id="house-area" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="e.g. Sector 4" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-phone">Phone No <span className="text-destructive">*</span></Label>
              <Input id="house-phone" value={form.phoneNo} onChange={e => setForm(f => ({ ...f, phoneNo: e.target.value }))} placeholder="e.g. 9876543210" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-alt-phone">Alternative Phone</Label>
              <Input id="house-alt-phone" value={form.alternativePhone} onChange={e => setForm(f => ({ ...f, alternativePhone: e.target.value }))} placeholder="Optional" />
            </div>
            {/* Rate 1 */}
            <div className="space-y-1.5">
              <Label>Rate 1 Type</Label>
              <Select value={form.rate1Type} onValueChange={v => setForm(f => ({ ...f, rate1Type: v }))}>
                <SelectTrigger id="house-rate1type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buffalo">Buffalo Milk</SelectItem>
                  <SelectItem value="cow">Cow Milk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-rate1">Rate 1 (₹/L)</Label>
              <Input id="house-rate1" type="number" min="0" step="0.5" value={form.rate1} onChange={e => setForm(f => ({ ...f, rate1: e.target.value }))} placeholder="e.g. 60" />
            </div>
            {/* Rate 2 */}
            <div className="space-y-1.5">
              <Label>Rate 2 Type</Label>
              <Select value={form.rate2Type} onValueChange={v => setForm(f => ({ ...f, rate2Type: v }))}>
                <SelectTrigger id="house-rate2type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buffalo">Buffalo Milk</SelectItem>
                  <SelectItem value="cow">Cow Milk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="house-rate2">Rate 2 (₹/L)</Label>
              <Input id="house-rate2" type="number" min="0" step="0.5" value={form.rate2} onChange={e => setForm(f => ({ ...f, rate2: e.target.value }))} placeholder="e.g. 50" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="house-desc">Description / Notes</Label>
              <Textarea id="house-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update House' : 'Add House'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete House?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this house along with all its configs, balances and bills. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View House Sheet */}
      <Dialog open={!!viewHouse} onOpenChange={open => !open && setViewHouse(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewHouse && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  House {viewHouse.houseNo}
                </DialogTitle>
                {viewHouse.area && (
                  <DialogDescription className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {viewHouse.area}
                  </DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Phone" value={viewHouse.phoneNo} />
                  <InfoItem label="Alt. Phone" value={viewHouse.alternativePhone ?? '—'} />
                  <InfoItem label="Rate 1" value={viewHouse.rate1Type ? `${viewHouse.rate1Type} — ₹${viewHouse.rate1}/L` : '—'} />
                  <InfoItem label="Rate 2" value={viewHouse.rate2Type ? `${viewHouse.rate2Type} — ₹${viewHouse.rate2}/L` : '—'} />
                </div>
                {viewHouse.description && (
                  <InfoItem label="Notes" value={viewHouse.description} />
                )}

                {/* Balance */}
                {viewHouse.balance && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Balance</p>
                    <div className="flex gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">Pending</p>
                        <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                          ₹{Number(viewHouse.balance.previousBalance).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Current Month</p>
                        <p className="text-xl font-bold text-primary">
                          ₹{Number(viewHouse.balance.currentBalance).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Bills */}
                {viewHouse.bills && viewHouse.bills.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Recent Bills</p>
                    <div className="rounded-xl border border-border overflow-hidden">
                      {viewHouse.bills.slice(0, 6).map((b: any, i: number) => (
                        <div key={b.id} className={`flex items-center justify-between px-4 py-3 ${i !== 0 ? 'border-t border-border' : ''} hover:bg-muted/30`}>
                          <span className="text-sm font-medium">{MONTH_NAMES[b.month]} {b.year}</span>
                          <span className="font-semibold text-sm">₹{Number(b.totalAmount).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment History */}
                {viewHouse.balance?.payments && viewHouse.balance.payments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Recent Payments</p>
                    <div className="rounded-xl border border-border overflow-hidden">
                      {viewHouse.balance.payments.slice(0, 5).map((p: any, i: number) => (
                        <div key={p.id} className={`flex items-center justify-between px-4 py-3 ${i !== 0 ? 'border-t border-border' : ''}`}>
                          <div>
                            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                            {p.note && <span className="ml-2 text-xs text-muted-foreground">{p.note}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setViewHouse(null); openEdit(viewHouse) }}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button onClick={() => setViewHouse(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  )
}