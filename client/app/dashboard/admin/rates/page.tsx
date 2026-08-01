'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Edit3, Eye, Plus, Search, Tag, Trash2, X, Settings, ChevronUp, ChevronDown, Save, GripVertical, ArrowLeft, ArrowRight, Package } from 'lucide-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import {
  productRatesApi,
  dairiesApi,
  type ProductRate,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type RateFormState = {
  name: string
  unit: string
  rate: string
  isActive: boolean
}

const emptyForm: RateFormState = {
  name: '',
  unit: 'L',
  rate: '',
  isActive: true,
}

export default function RatesPage() {
  const [rates, setRates] = useState<ProductRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reorderSaving, setReorderSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [editId, setEditId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductRate | null>(null)
  const [form, setForm] = useState<RateFormState>(emptyForm)

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [pdfItems, setPdfItems] = useState<Array<{ id: number; name: string; unit: string; selected: boolean; displayRate: string }>>([])
  const [pdfFontSize, setPdfFontSize] = useState('20')
  const [pdfPreviewDataUrl, setPdfPreviewDataUrl] = useState<string | null>(null)
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false)

  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settings, setSettings] = useState<{
    evaluateByAmount?: boolean
    dedicatedItemNames?: string[]
  }>({ evaluateByAmount: false, dedicatedItemNames: [] })
  const [settingsSaving, setSettingsSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    try {
      const res = await dairiesApi.getSettings()
      setSettings({
        evaluateByAmount: (res.evaluateByAmount as boolean) ?? false,
        dedicatedItemNames: (res.dedicatedItemNames as string[]) ?? [],
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load settings')
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const loadRates = useCallback(async () => {
    try {
      setLoading(true)
      const data = await productRatesApi.list()
      setRates(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load rates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRates()
  }, [loadRates])

  const filteredRates = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rates

    return rates.filter((rate) =>
      rate.name.toLowerCase().includes(keyword) ||
      rate.unit.toLowerCase().includes(keyword),
    )
  }, [rates, search])

  const activeCount = useMemo(
    () => rates.filter((rate) => rate.isActive).length,
    [rates],
  )

  function openCreate() {
    setEditId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(rate: ProductRate) {
    setEditId(rate.id)
    setForm({
      name: rate.name,
      unit: rate.unit,
      rate: rate.rate,
      isActive: rate.isActive,
    })
    setDialogOpen(true)
  }

  function openDelete(rate: ProductRate) {
    setDeleteTarget(rate)
    setDeleteOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Product name is required')
      return
    }

    const parsedRate = Number(form.rate)
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      toast.error('Rate must be greater than 0')
      return
    }

    setSaving(true)
    try {
      if (editId) {
        const updatedRate = await productRatesApi.update(editId, {
          name: form.name.trim(),
          unit: form.unit.trim() || 'L',
          rate: parsedRate,
          isActive: form.isActive,
        })
        setRates((prev) =>
          prev.map((rate) => (rate.id === updatedRate.id ? updatedRate : rate)),
        )
        toast.success('Rate updated successfully')
      } else {
        const createdRate = await productRatesApi.create({
          name: form.name.trim(),
          unit: form.unit.trim() || 'L',
          rate: parsedRate,
          isActive: form.isActive,
        })
        setRates((prev) => [...prev, createdRate])
        toast.success('Rate created successfully')
      }

      setDialogOpen(false)
      setForm(emptyForm)
      setEditId(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save rate')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return

    setDeleting(true)
    try {
      await productRatesApi.delete(deleteTarget.id)
      setRates((prev) => prev.filter((rate) => rate.id !== deleteTarget.id))
      toast.success('Rate deleted successfully')
      setDeleteOpen(false)
      setDeleteTarget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete rate')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaveSettings() {
    setSettingsSaving(true)
    try {
      await dairiesApi.updateSettings(settings)
      toast.success('Settings saved successfully')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  function getAllItemNames(): string[] {
    const rateNames = rates.map(r => r.name).filter(Boolean)
    return Array.from(new Set(rateNames)).sort()
  }

  function getDedicatedItems(): string[] {
    const dedicated = settings.dedicatedItemNames ?? []
    return dedicated.filter(name => getAllItemNames().includes(name))
  }

  function getOtherItems(): string[] {
    const allNames = getAllItemNames()
    const dedicated = new Set(settings.dedicatedItemNames ?? [])
    return allNames.filter(name => !dedicated.has(name))
  }

  function moveToDedicated(itemName: string) {
    setSettings(prev => ({
      ...prev,
      dedicatedItemNames: [...(prev.dedicatedItemNames ?? []), itemName],
    }))
  }

  function moveToOther(itemName: string) {
    setSettings(prev => ({
      ...prev,
      dedicatedItemNames: (prev.dedicatedItemNames ?? []).filter(n => n !== itemName),
    }))
  }

  async function moveRate(rateId: number, direction: -1 | 1) {
    const fromIndex = filteredRates.findIndex((rate) => rate.id === rateId)
    const toIndex = fromIndex + direction
    if (fromIndex < 0 || toIndex < 0 || toIndex >= filteredRates.length) return

    const nextRates = [...rates]
    const sourceIndex = nextRates.findIndex((rate) => rate.id === rateId)
    const targetId = filteredRates[toIndex].id
    const targetIndex = nextRates.findIndex((rate) => rate.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const [moved] = nextRates.splice(sourceIndex, 1)
    nextRates.splice(targetIndex, 0, moved)

    setRates(nextRates)
    setReorderSaving(true)
    try {
      const reordered = await productRatesApi.reorder(nextRates.map((rate) => rate.id))
      setRates(reordered)
      toast.success('Product order updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update product order')
      await loadRates()
    } finally {
      setReorderSaving(false)
    }
  }

  const canReorder = !search.trim()

  function openPdfDialog() {
    setPdfItems(
      rates.filter((r) => r.isActive).map((rate) => ({
        id: rate.id,
        name: rate.name,
        unit: rate.unit,
        selected: true,
        displayRate: rate.rate,
      })),
    )
    setPdfFontSize('20')
    setPdfPreviewDataUrl(null)
    setPdfDialogOpen(true)
  }

  function generatePdfDoc(selectedItems: Array<{ id: number; name: string; unit: string; selected: boolean; displayRate: string }>, fontSize: string) {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const fs = Math.max(8, Math.min(40, Number(fontSize) || 20))

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fs)
    doc.text('Product Rate List', pageWidth / 2, 20, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(Math.max(6, fs * 0.6))
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth / 2, 20 + fs * 0.5, { align: 'center' })

    const rows = selectedItems.filter((r) => r.selected).map((rate) => [
      rate.name,
      '-',
      `${Number(rate.displayRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
    ])

    autoTable(doc, {
      startY: 20 + fs * 0.5 + 6,
      head: [['Product', '', 'Rate']],
      body: rows,
      styles: { fontSize: fs, cellPadding: 4, fontStyle: 'bold' },
      headStyles: { fillColor: false, textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: false },
      columnStyles: {
        0: { cellWidth: 70, halign: 'left' },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 50, halign: 'right' },
      },
      margin: { left: 30, right: 30 },
    })

    return doc
  }

  function updatePdfPreview() {
    setPdfPreviewLoading(true)
    try {
      const doc = generatePdfDoc(pdfItems, pdfFontSize)
      setPdfPreviewDataUrl(doc.output('datauristring'))
    } catch {
      setPdfPreviewDataUrl(null)
    } finally {
      setPdfPreviewLoading(false)
    }
  }

  function handleExportPdf() {
    const doc = generatePdfDoc(pdfItems, pdfFontSize)
    doc.save('product-rates.pdf')
  }

  function togglePdfItem(id: number) {
    setPdfItems((prev) => prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)))
  }

  function updatePdfItemRate(id: number, value: string) {
    setPdfItems((prev) => prev.map((item) => (item.id === id ? { ...item, displayRate: value } : item)))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Administration
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Rate List</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage product rates used across delivery and billing workflows
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="outline" onClick={openPdfDialog} className="gap-2">
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={() => setSettingsDialogOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" /> Settings
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Add Rate
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-to-br from-sky-500/10 to-cyan-500/10 p-5">
        <p className="text-sm font-medium text-muted-foreground">Product Rates Overview</p>
        <p className="mt-2 text-3xl font-bold text-sky-700 dark:text-sky-300">
          {rates.length}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="secondary">{activeCount} active</Badge>
          <Badge variant="secondary">{rates.length - activeCount} inactive</Badge>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by product or unit..."
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Use the arrow buttons to reorder products. Clear search to reorder the full list.
        </p>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(5)].map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredRates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Tag className="mb-3 h-12 w-12 opacity-30" />
              <p className="font-medium">No rates found</p>
              <p className="mt-1 text-sm">Create a new product rate to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Product</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Order</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Unit</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Rate</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.map((rate, idx) => (
                    <tr
                      key={rate.id}
                      className={`border-b border-border/60 transition-colors hover:bg-muted/30 ${
                        idx === filteredRates.length - 1 ? 'border-b-0' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold">{rate.name}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!canReorder || reorderSaving || idx === 0}
                            onClick={() => moveRate(rate.id, -1)}
                            className="h-8 w-8"
                            aria-label="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!canReorder || reorderSaving || idx === filteredRates.length - 1}
                            onClick={() => moveRate(rate.id, 1)}
                            className="h-8 w-8"
                            aria-label="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{rate.unit}</td>
                      <td className="px-4 py-3 font-semibold text-primary">
                        ₹{Number(rate.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={rate.isActive ? 'default' : 'secondary'}>
                          {rate.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(rate)} className="gap-1.5">
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDelete(rate)}
                            className="gap-1.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
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
      </div>

      <Dialog open={pdfDialogOpen} onOpenChange={(open) => { if (!open) { setPdfDialogOpen(false); setPdfPreviewDataUrl(null) } }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export Rate List as PDF</DialogTitle>
            <DialogDescription>
              Select items, adjust rates, and preview before downloading.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Label className="shrink-0 text-sm">Font Size</Label>
              <Select value={pdfFontSize} onValueChange={setPdfFontSize}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="14">14</SelectItem>
                  <SelectItem value="16">16</SelectItem>
                  <SelectItem value="18">18</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="22">22</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="28">28</SelectItem>
                  <SelectItem value="32">32</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="w-10 px-3 py-2 text-left"></th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Item</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Rate (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {pdfItems.map((item) => (
                    <tr key={item.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={item.selected}
                          onChange={() => togglePdfItem(item.id)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{item.name}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.displayRate}
                          onChange={(e) => updatePdfItemRate(item.id, e.target.value)}
                          className="h-8 w-28"
                          disabled={!item.selected}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={updatePdfPreview} className="gap-1.5">
                <Eye className="h-4 w-4" /> {pdfPreviewDataUrl ? 'Refresh Preview' : 'Generate Preview'}
              </Button>
              {pdfPreviewDataUrl && (
                <Button variant="outline" size="sm" onClick={() => setPdfPreviewDataUrl(null)} className="gap-1.5">
                  <X className="h-4 w-4" /> Close Preview
                </Button>
              )}
            </div>

            {pdfPreviewLoading && (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">Generating preview...</p>
              </div>
            )}

            {pdfPreviewDataUrl && !pdfPreviewLoading && (
              <div className="rounded-xl border border-border overflow-hidden bg-white">
                <iframe
                  src={pdfPreviewDataUrl}
                  className="w-full"
                  style={{ height: '420px' }}
                  title="PDF Preview"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPdfDialogOpen(false); setPdfPreviewDataUrl(null) }}>
              Cancel
            </Button>
            <Button onClick={handleExportPdf} className="gap-1.5">
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Rate' : 'Add Rate'}</DialogTitle>
            <DialogDescription>
              {editId
                ? 'Update product rate details for billing and delivery.'
                : 'Create a product rate that suppliers can use in delivery entries.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rate-name">Product Name</Label>
              <Input
                id="rate-name"
                placeholder="e.g. Cow Milk"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rate-unit">Unit</Label>
                <Input
                  id="rate-unit"
                  placeholder="e.g. L"
                  value={form.unit}
                  onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rate-value">Rate (₹)</Label>
                <Input
                  id="rate-value"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 62.5"
                  value={form.rate}
                  onChange={(event) => setForm((prev) => ({ ...prev, rate: event.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                }
              />
              Mark this product as active
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Update Rate' : 'Create Rate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rate?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently remove {deleteTarget?.name ?? 'this product'} from the rate list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bill Item Display Settings</DialogTitle>
            <DialogDescription>
              Choose which items appear as dedicated line items on bills. Items in "Other" will be grouped together.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Dedicated Items Column */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50/50 dark:bg-green-900/20 rounded-lg border border-green-200/50 dark:border-green-800/50">
                  <h3 className="font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                    <Tag className="h-4 w-4" /> Dedicated Items
                  </h3>
                  <span className="text-sm text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                    {getDedicatedItems().length} items
                  </span>
                </div>
                <div className="max-h-[60vh] overflow-y-auto space-y-2 border rounded-lg p-3 bg-muted/20">
                  {getDedicatedItems().length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No dedicated items. Move items from "Other" to show them separately on bills.</p>
                  ) : (
                    getDedicatedItems().map((itemName, index) => (
                      <div key={itemName} className="flex items-center justify-between p-2 bg-background border rounded hover:bg-muted/50 transition-colors">
                        <span className="font-medium truncate">{itemName}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveToOther(itemName)}
                          title="Move to Other"
                          className="text-muted-foreground hover:text-red-500"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Other Items Column */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-amber-50/50 dark:bg-amber-900/20 rounded-lg border border-amber-200/50 dark:border-amber-800/50">
                  <h3 className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <Package className="h-4 w-4" /> Other (Grouped)
                  </h3>
                  <span className="text-sm text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                    {getOtherItems().length} items
                  </span>
                </div>
                <div className="max-h-[60vh] overflow-y-auto space-y-2 border rounded-lg p-3 bg-muted/20">
                  {getOtherItems().length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">All items are dedicated. Move items here to group them under "Other" on bills.</p>
                  ) : (
                    getOtherItems().map((itemName, index) => (
                      <div key={itemName} className="flex items-center justify-between p-2 bg-background border rounded hover:bg-muted/50 transition-colors">
                        <span className="font-medium truncate">{itemName}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveToDedicated(itemName)}
                          title="Move to Dedicated"
                          className="text-muted-foreground hover:text-green-500"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between">
              <div>
                <Label>Evaluate Bills by Amount</Label>
                <p className="text-sm text-muted-foreground">When enabled, bill calculations prioritize amount over quantity.</p>
              </div>
              <Button
                variant="outline"
                onClick={() => setSettings(prev => ({ ...prev, evaluateByAmount: !prev.evaluateByAmount }))}
                className={settings.evaluateByAmount ? 'bg-primary text-primary-foreground' : ''}
              >
                {settings.evaluateByAmount ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSettings} disabled={settingsSaving} className="gap-2">
              <Save className="h-4 w-4" />
              {settingsSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}