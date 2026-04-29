'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { toast } from 'sonner'

import { deliveryLogsApi, deliveryPlansApi, type DeliveryLog, type DeliveryPlan } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadDeliveryAnalysisPdf } from './export-utils'

type SupplierSummary = {
  supplierId: string
  supplierName: string
  plannedQuantity: number
  deliveredQuantity: number
}

function toNumber(value: string | number | undefined | null): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCount(value: number): string {
  return value.toLocaleString('en-IN')
}

export default function DeliveryAnalysisPage() {
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<DeliveryPlan[]>([])
  const [logs, setLogs] = useState<DeliveryLog[]>([])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const [planData, logData] = await Promise.all([deliveryPlansApi.list(), deliveryLogsApi.list()])
        if (!active) return
        setPlans(planData)
        setLogs(logData)
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

  const summaryRows = useMemo(() => {
    const rows = new Map<string, SupplierSummary>()

    for (const plan of plans) {
      const supplierId = plan.supplier_id
      const supplierName = plan.users?.username || supplierId
      const existing = rows.get(supplierId) ?? {
        supplierId,
        supplierName,
        plannedQuantity: 0,
        deliveredQuantity: 0,
      }

      existing.supplierName = supplierName
      existing.plannedQuantity += toNumber(plan.total_quantity)
      rows.set(supplierId, existing)
    }

    for (const log of logs) {
      const supplierId = log.supplierId
      const supplierName = log.supplier?.username || supplierId
      const existing = rows.get(supplierId) ?? {
        supplierId,
        supplierName,
        plannedQuantity: 0,
        deliveredQuantity: 0,
      }

      existing.supplierName = supplierName
      existing.deliveredQuantity += (log.items ?? []).reduce((sum, item) => sum + toNumber(item.qty), 0)
      rows.set(supplierId, existing)
    }

    return Array.from(rows.values()).sort((left, right) => right.plannedQuantity - left.plannedQuantity)
  }, [plans, logs])

  function handleExportPdf() {
    if (summaryRows.length === 0) {
      toast.error('No analysis data available to export')
      return
    }

    downloadDeliveryAnalysisPdf(
      summaryRows.map((row) => ({
        supplierName: row.supplierName,
        plannedQuantity: row.plannedQuantity,
        deliveredQuantity: row.deliveredQuantity,
        delta: row.deliveredQuantity - row.plannedQuantity,
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
            <h1 className="text-2xl font-bold tracking-tight">Plans vs delivery logs</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Review how much each supplier has planned versus how much has been recorded in delivery logs.
            </p>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-border bg-card p-0">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-bold">Supplier comparison</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Sorted by planned quantity</p>
          </div>

          <Button
            onClick={handleExportPdf}
            disabled={loading || summaryRows.length === 0}
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
        ) : summaryRows.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No delivery plans or logs found yet.</div>
        ) : (
          <Table className="table-auto text-xs sm:text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="px-3 py-3">Supplier</TableHead>
                <TableHead className="whitespace-nowrap px-3 py-3 text-right">Planned</TableHead>
                <TableHead className="whitespace-nowrap px-3 py-3 text-right">Delivered</TableHead>
                <TableHead className="whitespace-nowrap px-3 py-3 text-right">Leftover</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRows.map((row) => {
                const delta = row.deliveredQuantity - row.plannedQuantity
                return (
                  <TableRow key={row.supplierId}>
                    <TableCell className="whitespace-normal wrap-break-word px-3 py-2 font-medium">{row.supplierName}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right">{formatCount(row.plannedQuantity)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right">{formatCount(row.deliveredQuantity)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right">
                      <span className={delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {delta >= 0 ? '+' : ''}{formatCount(delta)}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}