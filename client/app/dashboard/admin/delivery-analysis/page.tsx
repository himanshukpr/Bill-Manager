'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { toast } from 'sonner'

import { deliveryLogsApi, deliveryPlansApi, type DeliveryLog, type DeliveryPlan } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadDeliveryAnalysisPdf } from './export-utils'

type DeliveryAnalysisRow = {
  id: number
  supplierId: string
  deliveredAt: string
  dateLabel: string
  supplierName: string
  itemsLabel: string
  quantity: number
}

function toNumber(value: string | number | undefined | null): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCount(value: number): string {
  return value.toLocaleString('en-IN')
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function formatItems(items: DeliveryLog['items']): string {
  const parts = (items ?? [])
    .map((item) => {
      const quantity = toNumber(item.qty)
      if (!quantity) return null

      const label = String(item.milkType ?? '').trim() || 'Item'
      return `${label} ${quantity.toLocaleString('en-IN')}`
    })
    .filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(', ') : '-'
}

function normalizeProductName(value: string): string {
  return value.trim().toLowerCase()
}

export default function DeliveryAnalysisPage() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<DeliveryLog[]>([])
  const [plans, setPlans] = useState<DeliveryPlan[]>([])
  const [selectedRow, setSelectedRow] = useState<DeliveryAnalysisRow | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const [logData, planData] = await Promise.all([deliveryLogsApi.list(), deliveryPlansApi.list()])
        if (!active) return
        setLogs(logData)
        setPlans(planData)
      } catch (error: any) {
        toast.error(error.message || 'Failed to load delivery analysis')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [])

  const analysisRows = useMemo(() => {
    return logs
      .map((log) => {
        const supplierName = log.supplier?.username || log.supplierId
        const quantity = (log.items ?? []).reduce((sum, item) => sum + toNumber(item.qty), 0)

        return {
          id: log.id,
          supplierId: log.supplierId,
          dateLabel: formatDate(log.deliveredAt),
          supplierName,
          itemsLabel: formatItems(log.items),
          quantity,
          deliveredAt: log.deliveredAt,
        }
      })
      .sort((left, right) => {
        const leftTime = new Date(left.deliveredAt).getTime()
        const rightTime = new Date(right.deliveredAt).getTime()
        return rightTime - leftTime
      })
  }, [logs])

  const selectedSupplierPlans = useMemo(() => {
      if (!selectedRow) return []

    return plans
        .filter((plan) => plan.supplier_id === selectedRow.supplierId)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    }, [plans, selectedRow])

    const selectedSupplierHouseLogs = useMemo(() => {
      if (!selectedRow) return []

      const selectedDate = new Date(selectedRow.deliveredAt)

      return logs
        .filter((log) => log.supplierId === selectedRow.supplierId && isSameLocalDate(new Date(log.deliveredAt), selectedDate))
        .map((log) => ({
          id: log.id,
          deliveredAt: log.deliveredAt,
          houseNo: log.house?.houseNo || `House ${log.houseId}`,
          area: log.house?.area || '-',
          shift: log.shift,
          itemsLabel: formatItems(log.items),
          quantity: (log.items ?? []).reduce((sum, item) => sum + toNumber(item.qty), 0),
        }))
        .sort((left, right) => new Date(left.deliveredAt).getTime() - new Date(right.deliveredAt).getTime())
    }, [logs, selectedRow])

    const selectedSupplierLeftovers = useMemo(() => {
      if (!selectedRow) return []

      const plannedByProduct = new Map<string, number>()
      for (const plan of selectedSupplierPlans) {
        const productName = normalizeProductName(plan.product_name)
        if (!productName) continue

        plannedByProduct.set(productName, (plannedByProduct.get(productName) ?? 0) + toNumber(plan.total_quantity))
      }

      const deliveredByProduct = new Map<string, number>()
      for (const log of selectedSupplierHouseLogs) {
        const matchedLog = logs.find((entry) => entry.id === log.id)
        if (!matchedLog) continue

        for (const item of matchedLog.items ?? []) {
          const productName = normalizeProductName(String(item.milkType ?? ''))
          if (!productName) continue

          deliveredByProduct.set(productName, (deliveredByProduct.get(productName) ?? 0) + toNumber(item.qty))
        }
      }

      return Array.from(plannedByProduct.entries())
        .map(([productName, plannedQuantity]) => {
          const deliveredQuantity = deliveredByProduct.get(productName) ?? 0
          const leftoverQuantity = Math.max(plannedQuantity - deliveredQuantity, 0)

          return {
            productName,
            leftoverQuantity,
          }
        })
        .filter((entry) => entry.leftoverQuantity > 0)
        .sort((left, right) => right.leftoverQuantity - left.leftoverQuantity)
    }, [logs, selectedRow, selectedSupplierHouseLogs, selectedSupplierPlans])

    const selectedSupplierName = useMemo(() => {
      if (!selectedRow) return ''

      return selectedRow.supplierName
    }, [selectedRow])

  function handleExportPdf() {
    if (analysisRows.length === 0) {
      toast.error('No analysis data available to export')
      return
    }

    downloadDeliveryAnalysisPdf(
      analysisRows.map((row) => ({
        dateLabel: row.dateLabel,
        supplierName: row.supplierName,
        itemsLabel: row.itemsLabel,
        quantity: row.quantity,
      })),
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="space-y-2">
          <Badge variant="outline" className="w-fit gap-1.5 px-3 py-1">
            <BarChart3 className="h-3.5 w-3.5" />
            Delivery Analysis
          </Badge>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delivery log analytics</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Review delivery entries by date, supplier, items, and total quantity.
            </p>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-border bg-card p-0">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-bold">Delivery entries</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Sorted by most recent delivery</p>
          </div>

          <Button
            onClick={handleExportPdf}
            disabled={loading || analysisRows.length === 0}
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1.5 rounded-full px-3 text-[11px] font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
        </div>

        {loading ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">Loading analysis...</div>
        ) : analysisRows.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No delivery logs found yet.</div>
        ) : (
          <Table className="table-auto text-xs sm:text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap px-3 py-3">Date</TableHead>
                <TableHead className="px-3 py-3">Supplier</TableHead>
                <TableHead className="px-3 py-3">Items</TableHead>
                <TableHead className="whitespace-nowrap px-3 py-3 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysisRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap px-3 py-2 font-medium">{row.dateLabel}</TableCell>
                  <TableCell className="whitespace-normal wrap-break-word px-3 py-2">{row.supplierName}</TableCell>
                  <TableCell className="whitespace-normal wrap-break-word px-3 py-2">{row.itemsLabel}</TableCell>
                  <TableCell className="whitespace-nowrap px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-[11px] font-medium"
                      onClick={() => setSelectedRow(row)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0">
          <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-xl font-bold tracking-tight">
                Delivery details for {selectedSupplierName}
              </DialogTitle>

              {selectedRow ? (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border bg-background px-3 py-1 font-medium text-foreground">
                    {selectedRow.dateLabel}
                  </span>
                  <span className="rounded-full border border-border bg-background px-3 py-1">
                    {selectedRow.itemsLabel}
                  </span>
                </div>
              ) : null}
            </DialogHeader>
          </div>

          <div className="grid gap-0 lg:grid-cols-2">
            <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <h3 className="text-sm font-semibold">House logs for this day</h3>
                <p className="mt-1 text-xs text-muted-foreground">Each row shows the houses delivered for the selected supplier and date.</p>
              </div>
              <div className="max-h-[60vh] overflow-auto px-3 py-3 sm:px-4">
                {selectedSupplierHouseLogs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                    No house logs found for this supplier on the selected day.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap px-3 py-3">House</TableHead>
                        <TableHead className="whitespace-nowrap px-3 py-3">Shift</TableHead>
                        <TableHead className="px-3 py-3">Items</TableHead>
                        <TableHead className="whitespace-nowrap px-3 py-3 text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSupplierHouseLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-normal wrap-break-word px-3 py-2 font-medium">
                            {log.houseNo}
                            {log.area && log.area !== '-' ? (
                              <span className="block text-xs text-muted-foreground">{log.area}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 capitalize">{log.shift}</TableCell>
                          <TableCell className="whitespace-normal wrap-break-word px-3 py-2">{log.itemsLabel}</TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 text-right">{formatCount(log.quantity)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <h3 className="text-sm font-semibold">Delivery plan table</h3>
                <p className="mt-1 text-xs text-muted-foreground">The supplier’s current plan entries are shown here for context.</p>
              </div>
              <div className="max-h-[60vh] overflow-auto px-3 py-3 sm:px-4">
                {selectedSupplierPlans.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                    No delivery plans found for this supplier.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap px-3 py-3">Created At</TableHead>
                        <TableHead className="px-3 py-3">Product</TableHead>
                        <TableHead className="whitespace-nowrap px-3 py-3 text-right">Qty / Go</TableHead>
                        <TableHead className="whitespace-nowrap px-3 py-3 text-right">Goes</TableHead>
                        <TableHead className="whitespace-nowrap px-3 py-3 text-right">Total Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSupplierPlans.map((plan) => (
                        <TableRow key={plan.id}>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-medium">{formatDate(plan.created_at)}</TableCell>
                          <TableCell className="whitespace-normal wrap-break-word px-3 py-2">{plan.product_name}</TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 text-right">{formatCount(plan.quantity_per_go)}</TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 text-right">{formatCount(plan.number_of_goes)}</TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 text-right">{formatCount(plan.total_quantity)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-muted/20 px-5 py-4 sm:px-6">
            <h3 className="text-sm font-semibold">Left over products after delivery</h3>
            {selectedSupplierLeftovers.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No leftover products for this delivery day.</p>
            ) : (
              <p className="mt-1 text-sm text-foreground">
                {selectedSupplierLeftovers
                  .map((item) => `${item.productName} ${formatCount(item.leftoverQuantity)}`)
                  .join(', ')}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}