'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
    Plus, Search, X, Phone, MapPin, Building2, Bell, CalendarDays,
    Pencil, Trash2, Eye, Settings2, Save, Rows3
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { balanceApi, billsApi, deliveryLogsApi, houseConfigApi, housesApi, usersApi, type DeliveryLog, type House, type HouseConfig, type User } from '@/lib/api'
import { toast } from 'sonner'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogFooter, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
    parseDailyAlerts,
    createAlertId,
    ALL_DAYS_ALERT_SCHEDULE,
    type AlertDays,
    type HouseAlert,
} from '@/lib/alerts'

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]

type SummaryCell = {
    qty: number
    amount: number
}

type HouseDeliverySummaryRow = {
    dateKey: string
    dayLabel: string
    productsLabel: string
    hasDelivery: boolean
}

function createSummaryCell(): SummaryCell {
    return { qty: 0, amount: 0 }
}

function getLocalDateKey(date: Date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getLogPeriod(logs: DeliveryLog[]): { year: number; month: number } {
    const latest = logs
        .map((log) => new Date(log.deliveredAt))
        .filter((date) => Number.isFinite(date.getTime()))
        .sort((left, right) => right.getTime() - left.getTime())[0]

    if (!latest) {
        const now = new Date()
        return { year: now.getFullYear(), month: now.getMonth() }
    }

    return {
        year: latest.getFullYear(),
        month: latest.getMonth(),
    }
}

function buildHouseDeliverySummary(logs: DeliveryLog[], year: number, month: number): HouseDeliverySummaryRow[] {
    const byDate = new Map<string, HouseDeliverySummaryRow>()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    for (const log of logs) {
        const deliveredAt = new Date(log.deliveredAt)
        if (deliveredAt.getFullYear() !== year || deliveredAt.getMonth() !== month) continue

        const dateKey = getLocalDateKey(deliveredAt)
        const existing = byDate.get(dateKey) ?? {
            dateKey,
            dayLabel: deliveredAt.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            }),
            productsLabel: '',
            hasDelivery: false,
        }

        existing.hasDelivery = true

        const productParts = (log.items ?? []).map((item) => {
            const qty = Number(item.qty ?? 0)
            if (!qty) return null

            const milkType = item.milkType === 'cow' ? 'cow' : 'buffalo'
            return `${milkType} ${qty.toLocaleString('en-IN')}L`
        }).filter((part): part is string => Boolean(part))

        const productText = productParts.join(', ')

        existing.productsLabel = existing.productsLabel
            ? `${existing.productsLabel}, ${productText}`
            : productText || '-'

        byDate.set(dateKey, existing)
    }

    const rows: HouseDeliverySummaryRow[] = []
    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day)
        const dateKey = getLocalDateKey(date)
        const row = byDate.get(dateKey)

        rows.push(
            row ?? {
                dateKey,
                dayLabel: date.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                }),
                productsLabel: '-',
                hasDelivery: false,
            },
        )
    }

    return rows
}

function parseAlerts(jsonStr: string | null | undefined): HouseAlert[] {
    return parseDailyAlerts(jsonStr)
}

function formatAlertPreview(rawValue: string | null | undefined): string {
    const text = parseAlerts(rawValue)
        .map((alert) => alert.text.trim())
        .filter(Boolean)
        .join(', ')

    if (!text) return ''
    return text.length > 96 ? `${text.slice(0, 93)}...` : text
}

function toAlertStorageValue(input: string): string | undefined {
    const text = input.trim()
    if (!text) return undefined

    const parsed = parseAlerts(text)
    if (parsed.length > 0) {
        return serializeAlerts(parsed)
    }

    return JSON.stringify([
        {
            id: createAlertId('auto'),
            text,
            schedule: ALL_DAYS_ALERT_SCHEDULE,
        },
    ])
}

function toAlertInputValue(rawValue: string | null | undefined): string {
    const parsed = parseAlerts(rawValue)
    return serializeAlerts(parsed) ?? ''
}

function serializeAlerts(alerts: HouseAlert[]): string | undefined {
    const normalized = alerts
        .map((alert) => ({
            id: alert.id || createAlertId(),
            text: alert.text.trim(),
            schedule: alert.schedule,
        }))
        .filter((alert) => alert.text.length > 0)

    if (normalized.length === 0) return undefined

    return JSON.stringify(normalized)
}

type HouseForm = {
    houseNo: string; area: string; phoneNo: string; alternativePhone: string;
    description: string; rate1Type: string; rate1: string; rate2Type: string; rate2: string;
    shift: 'morning' | 'evening'; supplierId: string; position: string; dailyAlerts: string; previousBalance: string;
}

type HouseConfigForm = {
    houseId: string
    shift: 'morning' | 'evening'
    supplierId: string
    position: string
    dailyAlerts: string
}

const emptyForm: HouseForm = {
    houseNo: '', area: '', phoneNo: '', alternativePhone: '',
    description: '', rate1Type: '', rate1: '', rate2Type: '', rate2: '',
    shift: 'evening', supplierId: '', position: '0', dailyAlerts: '', previousBalance: '',
}

const emptyConfigForm: HouseConfigForm = {
    houseId: '',
    shift: 'morning',
    supplierId: '',
    position: '0',
    dailyAlerts: '',
}

type ShiftFilter = 'all' | 'morning' | 'evening' | 'shop'
type PaymentFilter = 'all' | 'clear' | 'pending' | 'advance'

function getHouseShift(house: House): 'morning' | 'evening' {
    return house.configs?.[0]?.shift ?? 'evening'
}

function getHousePaymentStatus(house: House): Exclude<PaymentFilter, 'all'> {
    const balance = Number(house.balance?.previousBalance ?? 0)
    if (balance > 0) return 'pending'
    if (balance < 0) return 'advance'
    return 'clear'
}

function getHouseConfigWithAlerts(configs?: HouseConfig[]): HouseConfig | undefined {
    if (!Array.isArray(configs) || configs.length === 0) return undefined

    return configs.find((config) => parseDailyAlerts(config.dailyAlerts).length > 0) ?? configs[0]
}

export default function HousesPage() {
    const [houses, setHouses] = useState<House[]>([])
    const [suppliers, setSuppliers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('all')
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
    const [form, setForm] = useState<HouseForm>(emptyForm)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [toggleId, setToggleId] = useState<number | null>(null)
    const [toggleAction, setToggleAction] = useState<'deactivate' | 'reactivate' | null>(null)
    const [viewHouse, setViewHouse] = useState<House | null>(null)
    const [saving, setSaving] = useState(false)
    const [formConfigId, setFormConfigId] = useState<number | null>(null)
    const [configDialogOpen, setConfigDialogOpen] = useState(false)
    const [configSaving, setConfigSaving] = useState(false)
    const [configEditingId, setConfigEditingId] = useState<number | null>(null)
    const [configForm, setConfigForm] = useState<HouseConfigForm>(emptyConfigForm)
    const [summaryOpen, setSummaryOpen] = useState(false)
    const [summaryHouse, setSummaryHouse] = useState<House | null>(null)
    const [summaryLogs, setSummaryLogs] = useState<DeliveryLog[]>([])
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryPeriod, setSummaryPeriod] = useState<{ year: number; month: number }>(() => {
        const now = new Date()
        return { year: now.getFullYear(), month: now.getMonth() }
    })
    const [isSearchOpen, setIsSearchOpen] = useState(false)

    const summaryRows = useMemo(() => {
        if (!summaryHouse) return []
        return buildHouseDeliverySummary(summaryLogs, summaryPeriod.year, summaryPeriod.month)
    }, [summaryHouse, summaryLogs, summaryPeriod])

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search)
        }, 200)
        return () => clearTimeout(handler)
    }, [search])

    const handleExportSummaryPdf = useCallback(() => {
        if (!summaryHouse) return

        if (summaryRows.length === 0) {
            toast.error('No summary data available to export')
            return
        }

        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
        const title = `House ${summaryHouse.houseNo} Delivery Summary`
        const periodLabel = `${MONTH_NAMES[summaryPeriod.month + 1]} ${summaryPeriod.year}`

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.text(title, 14, 16)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.text(`Period: ${periodLabel}`, 14, 23)
        if (summaryHouse.area) {
            doc.text(`Area: ${summaryHouse.area}`, 14, 29)
        }

        autoTable(doc, {
            startY: summaryHouse.area ? 34 : 30,
            head: [['Date', 'Products']],
            body: summaryRows.map((row) => [row.dayLabel, row.hasDelivery ? row.productsLabel : '-']),
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 3,
                overflow: 'linebreak',
            },
            headStyles: {
                fillColor: [17, 24, 39],
                textColor: 255,
            },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 'auto' },
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252],
            },
            margin: { top: 30, left: 14, right: 14 },
        })

        doc.save(`house-${summaryHouse.houseNo}-summary-${summaryPeriod.year}-${String(summaryPeriod.month + 1).padStart(2, '0')}.pdf`)
    }, [summaryHouse, summaryPeriod, summaryRows])

    const load = useCallback(async () => {
        try {
            setLoading(true)
            const [data, supplierData] = await Promise.all([
                housesApi.list(),
                usersApi.list('supplier'),
            ])
            setHouses(data)
            setSuppliers(supplierData)
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const filtered = useMemo(() => {
        const query = debouncedSearch.trim().toLowerCase()

        return houses.filter((house) => {
            const shift = getHouseShift(house)
            if (shiftFilter !== 'all' && shift !== shiftFilter) return false

            const paymentStatus = getHousePaymentStatus(house)
            if (paymentFilter !== 'all' && paymentStatus !== paymentFilter) return false

            if (!query) return true

            return (
                house.houseNo.toLowerCase().includes(query) ||
                (house.area || '').toLowerCase().includes(query) ||
                house.phoneNo.includes(query)
            )
        })
    }, [houses, debouncedSearch, shiftFilter, paymentFilter])

    const searchSuggestions = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return []

        return houses
            .filter((house) => {
                const shift = getHouseShift(house)
                if (shiftFilter !== 'all' && shift !== shiftFilter) return false

                const paymentStatus = getHousePaymentStatus(house)
                if (paymentFilter !== 'all' && paymentStatus !== paymentFilter) return false

                return (
                    house.houseNo.toLowerCase().includes(query) ||
                    (house.area || '').toLowerCase().includes(query) ||
                    house.phoneNo.includes(query)
                )
            })
            .slice(0, 6)
    }, [houses, search, shiftFilter, paymentFilter])

    const handleSearchSelect = useCallback((value: string) => {
        setSearch(value)
        setDebouncedSearch(value)
        setIsSearchOpen(false)
    }, [])

    const clearSearch = useCallback(() => {
        setSearch('')
        setDebouncedSearch('')
    }, [])

    const selectedConfigHouse = houses.find(h => h.id === Number.parseInt(configForm.houseId, 10))

    function openAdd() {
        setForm(emptyForm)
        setFormConfigId(null)
        setEditingId(null)
        setDialogOpen(true)
    }

    async function openEdit(h: House) {
        try {
            const fresh = await housesApi.get(h.id)
            const primaryConfig = getHouseConfigWithAlerts(fresh.configs)
            setForm({
                houseNo: fresh.houseNo, area: fresh.area ?? '', phoneNo: fresh.phoneNo,
                alternativePhone: fresh.alternativePhone ?? '', description: fresh.description ?? '',
                rate1Type: fresh.rate1Type ?? '', rate1: fresh.rate1 ?? '',
                rate2Type: fresh.rate2Type ?? '', rate2: fresh.rate2 ?? '',
                shift: primaryConfig?.shift ?? 'evening',
                supplierId: primaryConfig?.supplierId ?? '',
                position: String(primaryConfig?.position ?? 0),
                dailyAlerts: toAlertInputValue(primaryConfig?.dailyAlerts),
                previousBalance: fresh.balance?.previousBalance ? String(fresh.balance.previousBalance) : '',
            })
            setFormConfigId(primaryConfig?.id ?? null)
            setEditingId(fresh.id)
            setDialogOpen(true)
            return
        } catch {
            const primaryConfig = getHouseConfigWithAlerts(h.configs)
            setForm({
                houseNo: h.houseNo, area: h.area ?? '', phoneNo: h.phoneNo,
                alternativePhone: h.alternativePhone ?? '', description: h.description ?? '',
                rate1Type: h.rate1Type ?? '', rate1: h.rate1 ?? '',
                rate2Type: h.rate2Type ?? '', rate2: h.rate2 ?? '',
                shift: primaryConfig?.shift ?? 'evening',
                supplierId: primaryConfig?.supplierId ?? '',
                position: String(primaryConfig?.position ?? 0),
                dailyAlerts: toAlertInputValue(primaryConfig?.dailyAlerts),
                previousBalance: h.balance?.previousBalance ? String(h.balance.previousBalance) : '',
            })
            setFormConfigId(primaryConfig?.id ?? null)
            setEditingId(h.id)
            setDialogOpen(true)
            // Try to fetch nested resources (best-effort) so dialogs show more data
            try {
                const [configsForHouse, balance] = await Promise.all([
                    houseConfigApi.listForHouse(h.id),
                    balanceApi.get(h.id).catch(() => null),
                ])
                const primary = getHouseConfigWithAlerts(configsForHouse.length ? configsForHouse : h.configs)
                if (primary) {
                    setForm(f => ({ ...f, shift: primary.shift, supplierId: primary.supplierId ?? '', position: String(primary.position ?? 0), dailyAlerts: toAlertInputValue(primary.dailyAlerts) }))
                    setFormConfigId(primary.id ?? null)
                }
                if (balance && (balance as any).previousBalance !== undefined) {
                    setForm(f => ({ ...f, previousBalance: String((balance as any).previousBalance ?? '') }))
                }
            } catch {
                /* best-effort only */
            }
        }
    }

    async function handleSave() {
        if (!form.houseNo || !form.phoneNo) {
            toast.error('House No and Phone No are required')
            return
        }
        if (form.shift === 'morning' && !form.supplierId) {
            toast.error('Select a supplier for morning shift')
            return
        }

        setSaving(true)
        try {
            const payload = {
                houseNo: form.houseNo,
                area: form.area || undefined,
                phoneNo: form.phoneNo,
                alternativePhone: form.alternativePhone || undefined,
                description: form.description || undefined,
                rate1Type: form.rate1Type || undefined,
                rate1: form.rate1 ? form.rate1 : undefined,
                rate2Type: form.rate2Type || undefined,
                rate2: form.rate2 ? form.rate2 : undefined,
            }

            const savedHouse = editingId
                ? await housesApi.update(editingId, payload)
                : await housesApi.create(payload)

            const houseId = editingId ?? savedHouse?.id
            if (!houseId) {
                throw new Error('Unable to resolve house id')
            }

            const configPayload = {
                houseId,
                shift: form.shift,
                supplierId: form.shift === 'morning' ? form.supplierId : undefined,
                position: Number.isFinite(Number.parseInt(form.position, 10)) ? Number.parseInt(form.position, 10) : 0,
                dailyAlerts: toAlertStorageValue(form.dailyAlerts),
            }

            if (formConfigId) {
                await houseConfigApi.update(formConfigId, configPayload)
            } else {
                await houseConfigApi.create(configPayload)
            }

            if (form.previousBalance.trim() !== '') {
                const parsedPreviousBalance = Number(form.previousBalance)
                if (!Number.isFinite(parsedPreviousBalance)) {
                    throw new Error('Previous balance must be a valid number')
                }
                await balanceApi.updatePrevious(houseId, parsedPreviousBalance)
            }

            toast.success(editingId ? 'House updated' : 'House added')
            setDialogOpen(false)
            load()
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleToggleActive() {
        if (!toggleId || !toggleAction) return
        try {
            if (toggleAction === 'deactivate') {
                await housesApi.deactivate(toggleId)
                toast.success('House deactivated')
            } else {
                await housesApi.reactivate(toggleId)
                toast.success('House reactivated')
            }
            setToggleId(null)
            setToggleAction(null)
            load()
        } catch (e: any) {
            toast.error(e.message)
        }
    }

    async function openSummary(house: House) {
        setSummaryHouse(house)
        setSummaryLogs([])
        setSummaryOpen(true)
        setSummaryLoading(true)

        try {
            const logs = await deliveryLogsApi.list({ houseId: house.id })
            setSummaryLogs(logs)
            setSummaryPeriod(getLogPeriod(logs))
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setSummaryLoading(false)
        }
    }

    async function openView(h: House) {
        try {
            const full = await housesApi.get(h.id)
            setViewHouse(full)
        } catch {
            setViewHouse(h)
                // best-effort hydration of nested data when full GET fails
                (async () => {
                    try {
                        const [balance, bills, configsForHouse] = await Promise.all([
                            balanceApi.get(h.id).catch(() => null),
                            billsApi.list({ houseId: h.id }).catch(() => []),
                            houseConfigApi.listForHouse(h.id).catch(() => []),
                        ])

                        setViewHouse(prev => {
                            if (!prev) return prev
                            return {
                                ...prev,
                                balance: (balance as any) ?? prev.balance,
                                bills: (bills as any) ?? prev.bills,
                                configs: configsForHouse.length ? configsForHouse : prev.configs,
                            }
                        })
                    } catch {
                        // ignore
                    }
                })()
        }
    }

    function openConfigDialog(house: House, config?: HouseConfig) {
        const houseConfig = config ?? getHouseConfigWithAlerts(house.configs)
        setConfigEditingId(houseConfig?.id ?? null)
        setConfigForm({
            houseId: String(house.id),
            shift: houseConfig?.shift ?? 'morning',
            supplierId: houseConfig?.supplierId ?? '',
            position: String(houseConfig?.position ?? 0),
            dailyAlerts: toAlertInputValue(houseConfig?.dailyAlerts),
        })
        setConfigDialogOpen(true)
    }

    async function handleConfigSave() {
        if (!configForm.houseId) {
            toast.error('Select a house')
            return
        }
        if (configForm.shift === 'morning' && !configForm.supplierId) {
            toast.error('Select a supplier for morning shift')
            return
        }

        setConfigSaving(true)
        try {
            const positionValue = Number.parseInt(configForm.position, 10)
            const payload = {
                houseId: parseInt(configForm.houseId),
                shift: configForm.shift,
                supplierId: configForm.shift === 'morning' ? configForm.supplierId : undefined,
                position: Number.isFinite(positionValue) ? positionValue : 0,
                dailyAlerts: toAlertStorageValue(configForm.dailyAlerts),
            }

            const selectedHouseId = parseInt(configForm.houseId)
            const selectedHouse = houses.find(house => house.id === selectedHouseId)
            const existingConfigId = configEditingId ?? selectedHouse?.configs?.[0]?.id ?? null

            if (existingConfigId) {
                await houseConfigApi.update(existingConfigId, payload)
                toast.success('House config updated')
            } else {
                await houseConfigApi.create(payload)
                toast.success('House config created')
            }

            setConfigDialogOpen(false)
            setConfigEditingId(null)
            setConfigForm(emptyConfigForm)
            await load()
            if (viewHouse?.id === selectedHouseId) {
                const refreshed = await housesApi.get(selectedHouseId)
                setViewHouse(refreshed)
            }
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setConfigSaving(false)
        }
    }

    const handleExportHousesPdf = () => {
        if (filtered.length === 0) {
            toast.error('No houses to export')
            return
        }

        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
        const title = 'Houses List'

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.text(title, 14, 16)

        autoTable(doc, {
            startY: 24,
            head: [['House No', 'Address', 'Phone No', 'Balance']],
            body: filtered.map((house) => [
                String(house.houseNo),
                house.area || '-',
                house.phoneNo || '-',
                house.balance?.previousBalance ? `₹${Number(house.balance.previousBalance).toLocaleString('en-IN')}` : '-',
            ]),
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 3,
                overflow: 'linebreak',
            },
            headStyles: {
                fillColor: [17, 24, 39],
                textColor: 255,
            },
            columnStyles: {
                0: { cellWidth: 30 },
                1: { cellWidth: 50 },
                2: { cellWidth: 40 },
                3: { cellWidth: 35 },
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252],
            },
            margin: { top: 30, left: 14, right: 14 },
        })

        doc.save(`houses-list-${new Date().toISOString().split('T')[0]}.pdf`)
        toast.success('Houses exported successfully')
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                    Administration
                </p>
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold tracking-tight">Houses</h1>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsSearchOpen(true)}
                            className="h-9 w-9 rounded-lg"
                            aria-label="Search houses"
                            title="Search houses"
                        >
                            <Search className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleExportHousesPdf}
                            disabled={filtered.length === 0}
                            className="h-9 w-9 rounded-lg sm:w-auto sm:size-auto sm:gap-2"
                            title="Export to PDF"
                        >
                            <Building2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Export PDF</span>
                        </Button>
                        <Button onClick={openAdd} className="gap-2 sm:gap-2">
                            <Plus className="h-4 w-4" /> Add House
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Select value={shiftFilter} onValueChange={(value) => setShiftFilter(value as ShiftFilter)}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Houses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Houses</SelectItem>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="evening">Evening</SelectItem>
                        <SelectItem value="shop">Shop</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as PaymentFilter)}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Payments" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Payments</SelectItem>
                        <SelectItem value="clear">Clear</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="advance">Advance</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Search Houses</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search by house no, area, or phone..."
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                className="pl-9 pr-10"
                                autoFocus
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={clearSearch}
                                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    aria-label="Clear search"
                                    title="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {search.trim() ? (
                            <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-background">
                                {searchSuggestions.length > 0 ? (
                                    <div className="divide-y divide-border">
                                        {searchSuggestions.map((house) => (
                                            <button
                                                key={house.id}
                                                type="button"
                                                onClick={() => handleSearchSelect(house.houseNo)}
                                                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-foreground">{house.houseNo}</p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {house.area || 'Area not set'} • {house.phoneNo}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                    {getHousePaymentStatus(house)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-3 py-4 text-sm text-muted-foreground">
                                        No matching houses found.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                                Type to search houses.
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

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
                        <table className="w-full min-w-full table-auto text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th className="whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">House No</th>
                                    <th className="whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Area</th>
                                    <th className="hidden md:table-cell whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Phone</th>
                                    <th className="hidden lg:table-cell whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Rate 1</th>
                                    <th className="hidden lg:table-cell whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Rate 2</th>
                                    <th className="whitespace-nowrap px-2 py-2 text-left font-semibold text-muted-foreground sm:px-3">Balance</th>
                                    <th className="whitespace-nowrap px-2 py-2 text-right font-semibold text-muted-foreground sm:px-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((h, idx) => (
                                    <tr
                                        key={h.id}
                                        className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${idx === filtered.length - 1 ? 'border-b-0' : ''}`}
                                    >
                                        <td className="px-2 py-2 sm:px-3">
                                            <span className="font-semibold text-foreground">{h.houseNo}</span>
                                        </td>
                                        <td className="px-2 py-2 text-muted-foreground sm:px-3">
                                            <div className="flex items-center gap-1">
                                                {h.area && <MapPin className="h-3 w-3 shrink-0" />}
                                                {h.area || '—'}
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell px-2 py-2 text-muted-foreground sm:px-3">
                                            <div className="flex items-center gap-1">
                                                <Phone className="h-3 w-3 shrink-0" />
                                                {h.phoneNo}
                                            </div>
                                        </td>
                                        <td className="hidden lg:table-cell px-2 py-2 sm:px-3">
                                            {h.rate1Type ? (
                                                <Badge variant="outline" className="gap-1 font-medium">
                                                    {h.rate1Type} — ₹{h.rate1}
                                                </Badge>
                                            ) : '—'}
                                        </td>
                                        <td className="hidden lg:table-cell px-2 py-2 sm:px-3">
                                            {h.rate2Type ? (
                                                <Badge variant="outline" className="gap-1 font-medium">
                                                    {h.rate2Type} — ₹{h.rate2}
                                                </Badge>
                                            ) : '—'}
                                        </td>
                                        <td className="px-2 py-2 sm:px-3">
                                            {h.balance ? (
                                                <span className={`font-semibold ${Number(h.balance.previousBalance) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                    ₹{Number(h.balance.previousBalance).toLocaleString('en-IN')}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-2 py-2 sm:px-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => openView(h)} title="View">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => openSummary(h)} title="Summary">
                                                    <Rows3 className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => openEdit(h)} title="Edit">
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                {h.active ? (
                                                    <Button variant="ghost" size="icon" onClick={() => { setToggleId(h.id); setToggleAction('deactivate') }} title="Deactivate" className="text-destructive hover:text-destructive">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                ) : (
                                                    <Button variant="ghost" size="icon" onClick={() => { setToggleId(h.id); setToggleAction('reactivate') }} title="Reactivate" className="text-green-600 hover:text-green-700">
                                                        <Save className="h-4 w-4" />
                                                    </Button>
                                                )}
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
                <DialogContent
                    className="max-w-5xl max-h-[94dvh] overflow-y-auto **:data-[slot=input]:h-10 **:data-[slot=select-trigger]:h-10 **:data-[slot=input]:placeholder:text-[11px] sm:**:data-[slot=input]:placeholder:text-xs **:data-[slot=input]:placeholder:text-muted-foreground/70 sm:**:data-[slot=input]:h-9 sm:**:data-[slot=select-trigger]:h-9"
                    onOpenAutoFocus={(event) => {
                        event.preventDefault()
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Edit House' : 'Add New House'}</DialogTitle>
                        <DialogDescription>
                            {editingId ? 'Update house details below.' : 'Fill in the house details to add a new delivery location.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 py-1.5 sm:gap-4 sm:py-2 lg:grid-cols-3">
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
                            <Select
                                value={form.rate1Type || '__none__'}
                                onValueChange={v => setForm(f => ({
                                    ...f,
                                    rate1Type: v === '__none__' ? '' : v,
                                    rate1: v === '__none__' ? '' : f.rate1,
                                }))}
                            >
                                <SelectTrigger id="house-rate1type"><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">None</SelectItem>
                                    <SelectItem value="buffalo">Buffalo Milk</SelectItem>
                                    <SelectItem value="cow">Cow Milk</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="house-rate1">Rate 1 (₹/L)</Label>
                            <Input
                                id="house-rate1"
                                type="number"
                                min="0"
                                step="0.5"
                                value={form.rate1}
                                onChange={e => setForm(f => ({ ...f, rate1: e.target.value }))}
                                placeholder={form.rate1Type ? 'e.g. 60' : 'Select a type first'}
                                disabled={!form.rate1Type}
                            />
                        </div>
                        {/* Rate 2 */}
                        <div className="space-y-1.5">
                            <Label>Rate 2 Type</Label>
                            <Select
                                value={form.rate2Type || '__none__'}
                                onValueChange={v => setForm(f => ({
                                    ...f,
                                    rate2Type: v === '__none__' ? '' : v,
                                    rate2: v === '__none__' ? '' : f.rate2,
                                }))}
                            >
                                <SelectTrigger id="house-rate2type"><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">None</SelectItem>
                                    <SelectItem value="buffalo">Buffalo Milk</SelectItem>
                                    <SelectItem value="cow">Cow Milk</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="house-rate2">Rate 2 (₹/L)</Label>
                            <Input
                                id="house-rate2"
                                type="number"
                                min="0"
                                step="0.5"
                                value={form.rate2}
                                onChange={e => setForm(f => ({ ...f, rate2: e.target.value }))}
                                placeholder={form.rate2Type ? 'e.g. 50' : 'Select a type first'}
                                disabled={!form.rate2Type}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="house-previous-balance">Previous Balance (₹)</Label>
                            <Input
                                id="house-previous-balance"
                                type="number"
                                step="0.01"
                                value={form.previousBalance}
                                onChange={e => setForm(f => ({ ...f, previousBalance: e.target.value }))}
                                placeholder="e.g. 1200"
                            />
                        </div>
                        <div className="col-span-2 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4 lg:col-span-3">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Delivery Allocation</p>

                                </div>
                                <Badge variant="outline" className="uppercase tracking-wide">Config</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:gap-4">
                                <div className="space-y-1.5">
                                    <Label>Shift</Label>
                                    <Select value={form.shift} onValueChange={v => setForm(f => ({ ...f, shift: v as 'morning' | 'evening', supplierId: v === 'evening' ? '' : f.supplierId }))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select shift" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="morning">Morning</SelectItem>
                                            <SelectItem value="evening">Evening</SelectItem>
                                            <SelectItem value="shop">Shop</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="min-w-0 space-y-1.5">
                                    <Label>Supplier</Label>
                                    <Select
                                        value={form.supplierId || '__none__'}
                                        onValueChange={v => setForm(f => ({ ...f, supplierId: v === '__none__' ? '' : v }))}
                                        disabled={form.shift === 'evening'}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={form.shift === 'morning' ? 'Select supplier' : 'Shared route'} />
                                        </SelectTrigger>
                                        <SelectContent className="max-w-[min(92vw,28rem)]">
                                            <SelectItem value="__none__">Unassigned </SelectItem>
                                            {suppliers.map(supplier => (
                                                <SelectItem key={supplier.uuid} value={supplier.uuid} className="max-w-full">
                                                    {supplier.username} - {supplier.email}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label>Daily Alerts</Label>
                                    <DailyAlertsDialog
                                        value={form.dailyAlerts}
                                        onChange={value => setForm(f => ({ ...f, dailyAlerts: value }))}
                                        placeholder="Open schedule editor"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="col-span-2 sm:col-span-2 lg:col-span-3 space-y-1.5">
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

            {/* Deactivate/Reactivate Alert */}
            <AlertDialog open={!!toggleId} onOpenChange={open => { if (!open) { setToggleId(null); setToggleAction(null) } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{toggleAction === 'deactivate' ? 'Deactivate House?' : 'Reactivate House?'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {toggleAction === 'deactivate'
                                ? 'This will deactivate the house. It will not be available for normal operations until reactivated.'
                                : 'This will reactivate the house and make it available again.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleToggleActive} className={toggleAction === 'deactivate' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-green-600 text-white hover:bg-green-700'}>
                            {toggleAction === 'deactivate' ? 'Deactivate' : 'Reactivate'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* View House Sheet */}
            <Dialog open={!!viewHouse} onOpenChange={open => !open && setViewHouse(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto **:data-[slot=input]:h-11 **:data-[slot=select-trigger]:h-11 sm:**:data-[slot=input]:h-9 sm:**:data-[slot=select-trigger]:h-9">
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
                                <div className="rounded-xl border border-border bg-muted/30 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Balance</p>
                                    </div>
                                    <div className="flex gap-6">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Pending</p>
                                            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                                                ₹{Number(viewHouse.balance?.previousBalance ?? 0).toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Current Month</p>
                                            <p className="text-xl font-bold text-primary">
                                                ₹{Number(viewHouse.balance?.currentBalance ?? 0).toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* House Configs */}
                                <div className="rounded-xl border border-border bg-muted/30 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">House Configs</p>
                                        <Button variant="outline" size="sm" className="gap-2" onClick={() => openConfigDialog(viewHouse)}>
                                            <Settings2 className="h-3.5 w-3.5" /> {viewHouse.configs?.length ? 'Edit Config' : 'Add Config'}
                                        </Button>
                                    </div>
                                    {viewHouse.configs && viewHouse.configs.length > 0 ? (
                                        <div className="space-y-2">
                                            {(() => {
                                                const config = getHouseConfigWithAlerts(viewHouse.configs)
                                                if (!config) return null

                                                return (
                                                    <div key={config.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5">
                                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                                            <Badge variant="secondary" className="uppercase tracking-wide">{config.shift}</Badge>
                                                            <span className="font-medium">
                                                                {config.shift === 'morning' ? (config.supplier?.username ?? 'Unassigned supplier') : 'Shared evening route'}
                                                            </span>
                                                            <span className="text-muted-foreground">Position {config.position + 1}</span>
                                                            {(() => {
                                                                const alertPreview = formatAlertPreview(config.dailyAlerts)
                                                                if (!alertPreview) return null

                                                                return <span className="text-xs text-amber-700 dark:text-amber-400">{alertPreview}</span>
                                                            })()}
                                                        </div>
                                                        <Button variant="ghost" size="sm" className="gap-2" onClick={() => openConfigDialog(viewHouse, config)}>
                                                            <Pencil className="h-3.5 w-3.5" /> Edit
                                                        </Button>
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No delivery config assigned to this house yet.</p>
                                    )}
                                </div>

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

            <Dialog open={summaryOpen} onOpenChange={(open) => {
                setSummaryOpen(open)
                if (!open) {
                    setSummaryHouse(null)
                    setSummaryLogs([])
                }
            }}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                    {summaryHouse && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Rows3 className="h-5 w-5 text-primary" />
                                    House {summaryHouse.houseNo} Delivery Summary
                                </DialogTitle>
                                <DialogDescription>
                                    Daily delivery summary for {MONTH_NAMES[summaryPeriod.month + 1]} {summaryPeriod.year}.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-2">
                                <div className="rounded-xl border border-border bg-muted/30 p-4">
                                    {summaryLoading ? (
                                        <div className="space-y-3">
                                            <Skeleton className="h-10 w-full rounded-lg" />
                                            <Skeleton className="h-10 w-full rounded-lg" />
                                            <Skeleton className="h-10 w-full rounded-lg" />
                                        </div>
                                    ) : summaryRows.length === 0 ? (
                                        <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                                            <Rows3 className="h-10 w-10 opacity-30" />
                                            <p className="font-medium">No delivery summary available</p>
                                            <p className="text-sm">This house has no delivery logs for the selected month.</p>
                                        </div>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="min-w-35">Date</TableHead>
                                                    <TableHead>Products</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {summaryRows.map((row) => {
                                                    return (
                                                        <TableRow key={row.dateKey}>
                                                            <TableCell className="font-medium text-foreground">{row.dayLabel}</TableCell>
                                                            <TableCell className="whitespace-normal text-foreground">
                                                                {row.hasDelivery ? row.productsLabel : <span className="text-muted-foreground">-</span>}
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={handleExportSummaryPdf} disabled={summaryLoading || summaryRows.length === 0}>
                                    Export PDF
                                </Button>
                                <Button onClick={() => setSummaryOpen(false)}>Close</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{configEditingId ? 'Edit House Config' : 'Add House Config'}</DialogTitle>
                        <DialogDescription>
                            Each house supports a single delivery config. Update the existing config details below.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="config-house">House</Label>
                            <Input
                                id="config-house"
                                value={selectedConfigHouse ? `${selectedConfigHouse.houseNo}${selectedConfigHouse.area ? ` - ${selectedConfigHouse.area}` : ''}` : 'Selected house'}
                                disabled
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="config-shift">Shift</Label>
                            <Select value={configForm.shift} onValueChange={value => setConfigForm(form => ({ ...form, shift: value as 'morning' | 'evening', supplierId: value === 'evening' ? '' : form.supplierId }))}>
                                <SelectTrigger id="config-shift">
                                    <SelectValue placeholder="Select shift" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="morning">Morning</SelectItem>
                                    <SelectItem value="evening">Evening</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-1.5 sm:col-span-2">
                            <Label htmlFor="config-supplier">Supplier</Label>
                            <Select
                                value={configForm.supplierId || '__none__'}
                                onValueChange={value => setConfigForm(form => ({ ...form, supplierId: value === '__none__' ? '' : value }))}
                                disabled={configForm.shift === 'evening'}
                            >
                                <SelectTrigger id="config-supplier">
                                    <SelectValue placeholder={configForm.shift === 'morning' ? 'Select supplier' : 'Not required for evening'} />
                                </SelectTrigger>
                                <SelectContent className="max-w-[min(92vw,28rem)]">
                                    <SelectItem value="__none__">Unassigned / shared</SelectItem>
                                    {suppliers.map(supplier => (
                                        <SelectItem key={supplier.uuid} value={supplier.uuid} className="max-w-full">
                                            {supplier.username} - {supplier.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="config-alerts">Daily Alerts</Label>
                            <DailyAlertsDialog
                                value={configForm.dailyAlerts}
                                onChange={value => setConfigForm(form => ({ ...form, dailyAlerts: value }))}
                                placeholder="Open schedule editor"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleConfigSave} disabled={configSaving}>
                            {configSaving ? 'Saving...' : configEditingId ? 'Update Config' : 'Save Config'}
                        </Button>
                    </DialogFooter>
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

const DAYS_KEYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const DAYS_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function DailyAlertsDialog({
    value,
    onChange,
    placeholder,
}: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
}) {
    const [open, setOpen] = useState(false)
    const [alerts, setAlerts] = useState<HouseAlert[]>([])

    useEffect(() => {
        if (open) {
            setAlerts(parseAlerts(value))
        }
    }, [open, value])

    const activeCount = parseAlerts(value).length
    const activePreview = formatAlertPreview(value)

    const addAlert = () => {
        setAlerts(prev => {
            if (prev.length >= 1) return prev

            return [{
                id: createAlertId(),
                text: '',
                schedule: ALL_DAYS_ALERT_SCHEDULE,
            }]
        })
    }

    const updateAlertText = (index: number, text: string) => {
        setAlerts(prev => {
            const next = [...prev]
            next[index] = { ...next[index], text }
            return next
        })
    }

    const toggleDay = (index: number, day: typeof DAYS_KEYS[number]) => {
        setAlerts(prev => {
            const next = [...prev]
            next[index] = {
                ...next[index],
                schedule: {
                    ...next[index].schedule,
                    [day]: !next[index].schedule[day],
                },
            }
            return next
        })
    }

    const removeAlert = (index: number) => {
        setAlerts(prev => prev.filter((_, itemIndex) => itemIndex !== index))
    }

    const handleSave = () => {
        onChange(serializeAlerts(alerts.slice(0, 1)) ?? '')
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    <span className="truncate text-muted-foreground">
                        {activeCount > 0
                            ? activePreview || `${activeCount} alert${activeCount > 1 ? 's' : ''} configured`
                            : placeholder ?? 'Open schedule editor'}
                    </span>
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </DialogTrigger>
            <DialogContent
                className="max-w-2xl bg-card border-border/60"
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                }}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-primary" /> Daily Alerts
                    </DialogTitle>
                </DialogHeader>

                <div className="max-h-[60vh] overflow-y-auto pr-1">
                    {alerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-10 text-muted-foreground">
                            <CalendarDays className="mb-3 h-10 w-10 opacity-30" />
                            <p className="font-medium">No alert configured</p>
                            <p className="mt-1 text-xs">Create one alert schedule for selected days.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {alerts.map((alert, index) => (
                                <div key={alert.id} className="relative rounded-xl border border-border bg-muted/20 p-4">
                                    <div className="mb-4 flex gap-3">
                                        <Input
                                            value={alert.text}
                                            onChange={event => updateAlertText(index, event.target.value)}
                                            placeholder="E.g. Call before arrival"
                                            className="bg-background"
                                        />
                                        <Button variant="destructive" size="icon" onClick={() => removeAlert(index)} className="shrink-0">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Days</p>
                                        <div className="flex flex-wrap gap-2">
                                            {DAYS_KEYS.map((day, dayIndex) => (
                                                <Button
                                                    key={day}
                                                    type="button"
                                                    variant={alert.schedule[day] ? 'default' : 'outline'}
                                                    size="sm"
                                                    className={`h-8 font-medium ${alert.schedule[day] ? 'bg-primary/90' : 'bg-background'}`}
                                                    onClick={() => toggleDay(index, day)}
                                                >
                                                    {DAYS_LABELS[dayIndex]}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <Button
                        onClick={addAlert}
                        variant="secondary"
                        className="mt-4 w-full gap-2 border border-dashed border-border"
                        disabled={alerts.length >= 1}
                    >
                        <Plus className="h-4 w-4" /> {alerts.length >= 1 ? 'Only one alert allowed per house' : 'Create Alert'}
                    </Button>
                </div>

                <DialogFooter className="mt-4 border-t border-border/40 pt-4">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} className="gap-2">
                        <Save className="h-4 w-4" /> Save Schedule
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
