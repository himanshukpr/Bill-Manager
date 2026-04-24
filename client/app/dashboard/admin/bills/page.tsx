'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, FileText, Search, Trash2, Eye, CalendarDays } from 'lucide-react'
import { billsApi, housesApi, type Bill, type House, type BillItem } from '@/lib/api'
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

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState<string>('')
  const [filterYear, setFilterYear] = useState<string>(String(CURRENT_YEAR))
  const [generateOpen, setGenerateOpen] = useState(false)
  const [viewBill, setViewBill] = useState<Bill | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [generateMode, setGenerateMode] = useState<'single' | 'all'>('single')

  // Generate form
  const [genHouseId, setGenHouseId] = useState('')
  const [genDate, setGenDate] = useState(() => new Date().toISOString().split('T')[0])
  const [genNote, setGenNote] = useState('')

  // Preview State
  const [previewData, setPreviewData] = useState<{ totalAmount: number; previousBalance: number; grandTotal: number; logCount: number; existingBillId: number | null } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const hasLoadedOnceRef = useRef(false)

  const generateDisabled =
    saving ||
    previewLoading ||
    !genDate ||
    (generateMode === 'single' && (!genHouseId || !!previewData?.existingBillId))

  const load = useCallback(async () => {
    try {
      if (!hasLoadedOnceRef.current) {
        setLoading(true)
      }
      const [billsData, housesData] = await Promise.all([
        billsApi.list({
          month: filterMonth ? parseInt(filterMonth) : undefined,
          year: filterYear ? parseInt(filterYear) : undefined,
        }),
        housesApi.list(),
      ])
      setBills(billsData)
      setHouses(housesData)
      hasLoadedOnceRef.current = true
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterMonth, filterYear])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (generateMode !== 'single') {
      setPreviewData(null)
      return
    }
    if (!genHouseId || !genDate) {
      setPreviewData(null)
      return
    }
    const fetchPreview = async () => {
      setPreviewLoading(true)
      try {
        const data = await billsApi.preview(parseInt(genHouseId), genDate)
        setPreviewData(data)
      } catch (e: any) {
        setPreviewData(null)
      } finally {
        setPreviewLoading(false)
      }
    }
    fetchPreview()
  }, [genHouseId, genDate, generateMode])

  const filtered = bills.filter(b =>
    b.house?.houseNo.toLowerCase().includes(search.toLowerCase()) ||
    b.house?.area?.toLowerCase().includes(search.toLowerCase())
  )

  function openGenerate() {
    setGenerateMode('single')
    setGenHouseId('')
    setGenDate(new Date().toISOString().split('T')[0])
    setGenNote('')
    setPreviewData(null)
    setGenerateOpen(true)
  }

  async function handleGenerate() {
    if (generateMode === 'single') {
      if (!genHouseId) { toast.error('Please select a house'); return }
      if (previewData?.existingBillId) {
        const selectedDate = new Date(genDate)
        const selectedHouse = houses.find(h => h.id === parseInt(genHouseId))
        toast.error(
          `Bill already exists for ${selectedHouse?.houseNo ?? `house #${genHouseId}`} in ${MONTH_NAMES[selectedDate.getMonth() + 1]} ${selectedDate.getFullYear()}. Delete it first to regenerate.`
        )
        return
      }
      if (!previewData || previewData.totalAmount <= 0) {
        toast.error('No delivery logs found for this period to generate a bill')
        return
      }
    }

    setSaving(true)
    try {
      if (generateMode === 'all') {
        const result = await billsApi.generateAll({
          date: genDate,
          note: genNote || undefined,
        })
        if (result.generatedCount > 0) {
          toast.success(
            `Generated ${result.generatedCount} bill${result.generatedCount > 1 ? 's' : ''}. Skipped ${result.skippedCount}.`
          )
        } else {
          toast.error('No bills were generated. All houses were skipped.')
        }
      } else {
        await billsApi.generate({
          houseId: parseInt(genHouseId),
          date: genDate,
          note: genNote || undefined,
        })
        toast.success('Bill generated successfully')
      }
      setGenerateOpen(false)
      load()
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      if (msg.toLowerCase().includes('already exists')) {
        toast.error('Bill for this house and month already exists. Delete the old bill to generate again.')
      } else {
        toast.error(msg || 'Failed to generate bill')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await billsApi.delete(deleteId)
      toast.success('Bill deleted')
      setDeleteId(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Bills</h1>
          <p className="mt-1 text-sm text-muted-foreground">Generate and manage monthly dairy bills</p>
        </div>
        <Button onClick={openGenerate} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Generate Bill
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by house no or area..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTH_NAMES.slice(1).map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">No bills found</p>
            <p className="text-sm mt-1">Try changing filters or generate a new bill</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">House</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Period</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Total</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Prev. Balance</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Generated</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, idx) => (
                  <tr key={b.id} className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${idx === filtered.length - 1 ? 'border-b-0' : ''}`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold">{b.house?.houseNo}</p>
                        {b.house?.area && <p className="text-xs text-muted-foreground">{b.house.area}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{MONTH_NAMES[b.month]} {b.year}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-primary">₹{Number(b.totalAmount).toLocaleString('en-IN')}</span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-muted-foreground">
                      ₹{Number(b.previousBalance).toLocaleString('en-IN')}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-muted-foreground text-xs">
                      {new Date(b.generatedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewBill(b)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(b.id)}
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

      {/* Generate Bill Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Bill</DialogTitle>
            <DialogDescription>
              Choose whether to generate for one house or for all houses up to the selected date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="text-base font-semibold">Generate For</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={generateMode === 'single' ? 'default' : 'outline'}
                  onClick={() => setGenerateMode('single')}
                  disabled={saving}
                >
                  One House
                </Button>
                <Button
                  type="button"
                  variant={generateMode === 'all' ? 'default' : 'outline'}
                  onClick={() => setGenerateMode('all')}
                  disabled={saving}
                >
                  All Houses
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {generateMode === 'single' && (
                <div className="space-y-1.5">
                  <Label>House</Label>
                  <Select value={genHouseId} onValueChange={setGenHouseId}>
                    <SelectTrigger><SelectValue placeholder="Select house" /></SelectTrigger>
                    <SelectContent>
                      {houses.map(h => (
                        <SelectItem key={h.id} value={String(h.id)}>
                          {h.houseNo}{h.area ? ` — ${h.area}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Generate Bill Up To Date</Label>
                <Input type="date" value={genDate} onChange={e => setGenDate(e.target.value)} />
              </div>
            </div>

            {generateMode === 'single' ? (
              <div>
                <Label className="text-base font-semibold">Bill Basis</Label>
                <div className="mt-4 rounded-xl bg-muted/50 p-4 space-y-3">
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <span className="text-sm text-muted-foreground animate-pulse">Calculating preview...</span>
                    </div>
                  ) : previewData ? (
                    <>
                      {previewData.existingBillId && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                          A bill for this house and month already exists. Please delete the existing bill first if you want to generate again.
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Deliveries Total ({previewData.logCount} logs)</span>
                        <span className="font-semibold">₹{previewData.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Previous Balance</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">₹{previewData.previousBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                        <span className="text-base font-bold text-foreground">Grand Total</span>
                        <span className="text-lg font-bold text-primary">₹{previewData.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <span className="text-sm text-muted-foreground">Select a house to see preview</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Bills will be generated for all houses up to {new Date(genDate).toLocaleDateString('en-IN')}.
                Houses with no deliveries for this month or an existing bill will be skipped.
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Note (Optional)</Label>
              <Textarea value={genNote} onChange={e => setGenNote(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generateDisabled}>
              {previewLoading && generateMode === 'single'
                ? 'Checking...'
                : saving
                  ? (generateMode === 'all' ? 'Generating All...' : 'Generating...')
                  : (generateMode === 'all' ? 'Generate All Bills' : 'Generate Bill')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Bill Dialog */}
      <Dialog open={!!viewBill} onOpenChange={open => !open && setViewBill(null)}>
        <DialogContent className="max-w-lg">
          {viewBill && (
            <>
              <DialogHeader>
                <DialogTitle>Bill — House {viewBill.house?.houseNo}</DialogTitle>
                <DialogDescription>
                  {MONTH_NAMES[viewBill.month]} {viewBill.year}
                  {viewBill.house?.area && ` · ${viewBill.house.area}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border">
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Item</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Qty</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Rate</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewBill.items as BillItem[]).map((it, i) => (
                        <tr key={i} className="border-t border-border/60">
                          <td className="px-4 py-2.5">{it.name}</td>
                          <td className="px-4 py-2.5 text-right">{it.qty}</td>
                          <td className="px-4 py-2.5 text-right">₹{it.rate}</td>
                          <td className="px-4 py-2.5 text-right font-medium">₹{it.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 rounded-xl bg-muted/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">This Month Total</span>
                    <span className="font-semibold">₹{Number(viewBill.totalAmount).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Previous Balance</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">₹{Number(viewBill.previousBalance).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-1">
                    <span>Grand Total</span>
                    <span className="text-primary">₹{(Number(viewBill.totalAmount) + Number(viewBill.previousBalance)).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                {viewBill.note && (
                  <div className="text-sm text-muted-foreground rounded-lg bg-muted/30 p-3">
                    <span className="font-medium">Note: </span>{viewBill.note}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setViewBill(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this bill. The balance will not be automatically reversed. Proceed?
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
    </div>
  )
}