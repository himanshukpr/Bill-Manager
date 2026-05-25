'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Plus, FileText, Search, Trash2, Eye, CalendarDays, Check } from 'lucide-react'
import { billsApi, housesApi, type Bill, type House, type BillItem, type BillPreview } from '@/lib/api'
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
import { Badge } from '@/components/ui/badge'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMonthStart(value: Date = new Date()): string {
  const date = new Date(value)
  date.setDate(1)
  return formatLocalDate(date)
}

function isValidRange(fromDate: string, toDate: string): boolean {
  if (!fromDate || !toDate) return false

  const from = new Date(fromDate)
  const to = new Date(toDate)
  return !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to
}

function parseDateFieldToString(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''

  // Keep date input values untouched to avoid timezone shifts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized

  // If an ISO datetime is provided, keep only the date portion.
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) return normalized.slice(0, 10)

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  return formatLocalDate(date)
}

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
  const [genHouseSearch, setGenHouseSearch] = useState('')
  const [genFromDate, setGenFromDate] = useState(() => getMonthStart())
  const [genToDate, setGenToDate] = useState(() => formatLocalDate(new Date()))
  const [genNote, setGenNote] = useState('')

  // Preview State
  const [previewData, setPreviewData] = useState<BillPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const hasLoadedOnceRef = useRef(false)

  const generateDisabled =
    saving ||
    previewLoading ||
    !isValidRange(genFromDate, genToDate) ||
    (generateMode === 'single' && !genHouseId) ||
    Boolean(previewData?.isAlreadyClosed || previewData?.isDurationAlreadyCreated)

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
    if (!genHouseId || !isValidRange(genFromDate, genToDate)) {
      setPreviewData(null)
      return
    }
    const fetchPreview = async () => {
      setPreviewLoading(true)
      try {
        const data = await billsApi.preview(parseInt(genHouseId), {
          fromDate: parseDateFieldToString(genFromDate),
          toDate: parseDateFieldToString(genToDate),
        })
        setPreviewData(data)
        setGenNote(data.lastNote ?? '')
      } catch (e: any) {
        setPreviewData(null)
      } finally {
        setPreviewLoading(false)
      }
    }
    fetchPreview()
  }, [genHouseId, genFromDate, genToDate, generateMode])

  const filteredGenHouses = useMemo(() => {
    const q = genHouseSearch.trim().toLowerCase()
    if (!q) return houses.slice().sort((a, b) => a.houseNo.localeCompare(b.houseNo))

    const exactMatches: typeof houses = []
    const partialMatches: typeof houses = []

    houses.forEach((h) => {
      const houseNo = h.houseNo.toLowerCase()
      const area = (h.area || '').toLowerCase()

      if (houseNo === q || area === q) {
        exactMatches.push(h)
      } else if (houseNo.includes(q) || area.includes(q)) {
        partialMatches.push(h)
      }
    })

    exactMatches.sort((a, b) => a.houseNo.localeCompare(b.houseNo))
    partialMatches.sort((a, b) => a.houseNo.localeCompare(b.houseNo))

    return [...exactMatches, ...partialMatches]
  }, [houses, genHouseSearch])

  const selectedGenHouse = useMemo(() => houses.find((h) => String(h.id) === genHouseId), [houses, genHouseId])

  // When a house is selected for generation, default the from date to last bill.generatedDate + 1 day
  useEffect(() => {
    if (!genHouseId) return
    let cancelled = false
    ;(async () => {
      try {
        const houseId = parseInt(genHouseId)
        const billsForHouse = await billsApi.list({ houseId })
        if (cancelled) return
        if (billsForHouse && billsForHouse.length > 0) {
          const latest = billsForHouse
            .map(b => new Date(b.generatedDate))
            .filter(d => !Number.isNaN(d.getTime()))
            .sort((a, b) => b.getTime() - a.getTime())[0]
          if (latest) {
            const next = new Date(latest)
            next.setDate(next.getDate() + 1)
            setGenFromDate(formatLocalDate(next))
            return
          }
        }
        setGenFromDate(getMonthStart())
      } catch {
        setGenFromDate(getMonthStart())
      }
    })()
    return () => { cancelled = true }
  }, [genHouseId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = bills
      .filter(b => !q || b.house?.houseNo.toLowerCase().includes(q) || b.house?.area?.toLowerCase().includes(q))

    if (!q) {
      return filtered.sort((a, b) => {
        // Unpaid bills first (isClosed = false), paid bills at bottom (isClosed = true)
        if (a.isClosed === b.isClosed) return 0
        return a.isClosed ? 1 : -1
      })
    }

    const exactMatches: typeof bills = []
    const partialMatches: typeof bills = []

    filtered.forEach((b) => {
      const houseNo = b.house?.houseNo.toLowerCase() || ''
      const area = (b.house?.area || '').toLowerCase()
      const q_lower = q.toLowerCase()

      if (houseNo === q_lower || area === q_lower) {
        exactMatches.push(b)
      } else if (houseNo.includes(q_lower) || area.includes(q_lower)) {
        partialMatches.push(b)
      }
    })

    const sorted = [...exactMatches, ...partialMatches].sort((a, b) => {
      if (a.isClosed === b.isClosed) return 0
      return a.isClosed ? 1 : -1
    })

    return sorted
  }, [bills, search])

  function openGenerate() {
    setGenerateMode('single')
    setGenHouseId('')
    setGenFromDate(getMonthStart())
    setGenToDate(formatLocalDate(new Date()))
    setGenNote('')
    setPreviewData(null)
    setGenerateOpen(true)
  }

  async function handleGenerate() {
    if (generateMode === 'single') {
      if (!genHouseId) { toast.error('Please select a house'); return }
      if (!isValidRange(genFromDate, genToDate)) { toast.error('Please choose a valid from and upto date range'); return }
    } else if (!isValidRange(genFromDate, genToDate)) {
      toast.error('Please choose a valid from and upto date range')
      return
    }

    if (generateMode === 'single') {
      if (previewData?.isDurationAlreadyCreated) {
        toast.error(
          previewData.durationAlreadyCreatedMessage ??
            'This duration bill is already created. Please create the next duration bill separately.',
        )
        return
      }

      if (previewData?.isAlreadyClosed) {
        toast.error(previewData.alreadyClosedMessage ?? 'This period is already closed.')
        return
      }

      if (!previewData || previewData.totalAmount <= 0) {
        toast.error('No delivery logs found for this period to generate a bill')
        return
      }
    }

    setSaving(true)
    try {
      const fromDate = parseDateFieldToString(genFromDate)
      const toDate = parseDateFieldToString(genToDate)

      if (generateMode === 'all') {
        const result = await billsApi.generateAll({
          date: toDate,
          fromDate,
          toDate,
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
          date: toDate,
          fromDate,
          toDate,
          note: genNote || undefined,
        })
        toast.success('Bill generated successfully')
      }
      setGenerateOpen(false)
      load()
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      toast.error(msg || 'Failed to generate bill')
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
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Outstanding</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Prev. Balance</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-semibold text-muted-foreground">Generated</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, idx) => (
                  <tr key={b.id} className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${idx === filtered.length - 1 ? 'border-b-0' : ''} ${b.isClosed ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold">{b.house?.houseNo}</p>
                        {b.house?.area && <p className="text-xs text-muted-foreground">{b.house.area}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {b.fromDate && b.toDate 
                            ? `${new Date(b.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(b.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : `${MONTH_NAMES[b.month]} ${b.year}`
                          }
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${b.isClosed ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`}>
                          ₹{Number(b.totalAmount).toLocaleString('en-IN')}
                        </span>
                        {b.isClosed && (
                          <Badge className="bg-emerald-600 text-white flex items-center gap-1 h-5 px-2">
                            <Check className="h-3 w-3" /> Paid
                          </Badge>
                        )}
                      </div>
                    </td>
                    {/* Outstanding Amount */}
                    <td className="px-4 py-3">
                      {b.isClosed ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">— Cleared</span>
                      ) : b.outstandingAmount != null ? (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          ₹{Number(b.outstandingAmount).toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
              Choose whether to generate for one house or for all houses within the selected date range.
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
                  onClick={() => {
                    setGenerateMode('all')
                    setGenNote('')
                    setPreviewData(null)
                  }}
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
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by house number or area..."
                      value={genHouseSearch}
                      onChange={(e) => setGenHouseSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {genHouseSearch && filteredGenHouses.length > 0 && (
                    <div className="mt-2 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {filteredGenHouses.map((house) => (
                          <button
                            key={house.id}
                            type="button"
                            onClick={() => {
                              setGenHouseId(String(house.id))
                              setGenHouseSearch('')
                            }}
                            className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-border/50 last:border-b-0 ${genHouseId === String(house.id) ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'}`}
                          >
                            <p className="font-semibold">House {house.houseNo}</p>
                            {house.area && <p className="text-xs text-muted-foreground">{house.area}</p>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {genHouseId && selectedGenHouse && (
                    <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-sm font-medium">House {selectedGenHouse.houseNo}</p>
                      {selectedGenHouse.area && <p className="text-xs text-muted-foreground">{selectedGenHouse.area}</p>}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <Input type="date" value={genFromDate} onChange={e => setGenFromDate(parseDateFieldToString(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Upto Date</Label>
                <Input type="date" value={genToDate} onChange={e => setGenToDate(parseDateFieldToString(e.target.value))} />
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
                      {previewData.isDurationAlreadyCreated && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                          {previewData.durationAlreadyCreatedMessage ?? 'This duration bill is already created. Please create the next duration bill separately.'}
                        </div>
                      )}
                      {previewData.isAlreadyClosed && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                          {previewData.alreadyClosedMessage ?? 'This period is already closed.'}
                        </div>
                      )}
                      {/* no overwrite warning — bills are now appended instead of overwritten */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Period</span>
                        <span className="font-semibold">
                          {new Date(genFromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' '}to{' '}
                          {new Date(genToDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
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
                Bills will be generated for all houses from {new Date(genFromDate).toLocaleDateString('en-IN')} to {new Date(genToDate).toLocaleDateString('en-IN')}.
                Houses with no deliveries in this range will be skipped.
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
                  {viewBill.fromDate && viewBill.toDate 
                    ? `${new Date(viewBill.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(viewBill.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : `${MONTH_NAMES[viewBill.month]} ${viewBill.year}`
                  }
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
                  {viewBill.outstandingAmount != null && (
                    <div className={`flex justify-between text-sm border-t border-border pt-2 mt-1 ${viewBill.isClosed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      <span className="font-medium">{viewBill.isClosed ? 'Status' : 'Outstanding Amount'}</span>
                      <span className="font-bold">
                        {viewBill.isClosed ? '✓ Fully Paid' : `₹${Number(viewBill.outstandingAmount).toLocaleString('en-IN')} remaining`}
                      </span>
                    </div>
                  )}
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