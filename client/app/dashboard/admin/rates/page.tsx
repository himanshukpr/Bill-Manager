'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, Search, Tag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  productRatesApi,
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
  const [deleting, setDeleting] = useState(false)

  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [editId, setEditId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductRate | null>(null)
  const [form, setForm] = useState<RateFormState>(emptyForm)

  const loadRates = useCallback(async () => {
    try {
      setLoading(true)
      const data = await productRatesApi.list()
      setRates(data)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load rates')
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
        setRates((prev) => [createdRate, ...prev])
        toast.success('Rate created successfully')
      }

      setDialogOpen(false)
      setForm(emptyForm)
      setEditId(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to save rate')
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
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete rate')
    } finally {
      setDeleting(false)
    }
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
        <Button onClick={openCreate} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> Add Rate
        </Button>
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
    </div>
  )
}