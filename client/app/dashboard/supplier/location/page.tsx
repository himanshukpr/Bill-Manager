'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Home, MapPin, Route, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSessionAuth, type SessionAuth } from '@/lib/auth'

type LocationForm = {
  houseNo: string
  area: string
}

type PreviewPoint = {
  x: number
  y: number
  zone: string
  label: string
  details: string
  empty: boolean
}

function hashText(input: string): number {
  let hash = 2166136261

  for (const char of input) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function resolvePreviewPoint(houseNo: string, area: string): PreviewPoint {
  const trimmedHouseNo = houseNo.trim()
  const trimmedArea = area.trim()

  if (!trimmedHouseNo && !trimmedArea) {
    return {
      x: 50,
      y: 50,
      zone: 'Waiting for input',
      label: 'Enter a house no. and area to pin the location.',
      details: 'The preview map updates after you press Show on Map.',
      empty: true,
    }
  }

  const seed = `${trimmedHouseNo.toLowerCase()}|${trimmedArea.toLowerCase()}`
  const hash = hashText(seed)
  const x = 16 + (hash % 68)
  const y = 18 + ((hash >>> 8) % 58)

  const zones = [
    'North Edge',
    'North East Block',
    'East Side',
    'South East Corner',
    'South Block',
    'South West Lane',
    'West Wing',
    'North West Curve',
  ]

  return {
    x,
    y,
    zone: zones[hash % zones.length],
    label: `House ${trimmedHouseNo}${trimmedArea ? ` · ${trimmedArea}` : ''}`,
    details: 'Approximate preview derived from the entered house and area details.',
    empty: false,
  }
}

export default function SupplierLocationPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [ready, setReady] = useState(false)
  const [form, setForm] = useState<LocationForm>({
    houseNo: '',
    area: '',
  })
  const [submitted, setSubmitted] = useState<LocationForm | null>(null)

  useEffect(() => {
    const session = getSessionAuth()
    if (!session?.token || session.role !== 'supplier') {
      router.replace('/')
      return
    }

    setAuth(session)
    setReady(true)
  }, [router])

  const preview = useMemo(
    () => resolvePreviewPoint(submitted?.houseNo ?? '', submitted?.area ?? ''),
    [submitted],
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted({
      houseNo: form.houseNo.trim(),
      area: form.area.trim(),
    })
  }

  function handleReset() {
    setForm({ houseNo: '', area: '' })
    setSubmitted(null)
  }

  if (!ready || !auth) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Supplier Panel</p>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Location Map</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Add a house number and area, then preview the delivery location on a mobile-friendly map panel.
            </p>
          </div>
        </div>

        <Button asChild variant="ghost" className="w-fit gap-2 self-start">
          <Link href="/dashboard/supplier">
            <Home className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Location details</p>
              <h2 className="mt-2 text-xl font-bold">Create map preview</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the two required fields below. The map preview updates when you press the action button.
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-500/15 p-3">
              <Search className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-house-no">House No.</Label>
              <Input
                id="supplier-house-no"
                value={form.houseNo}
                onChange={(event) => setForm((prev) => ({ ...prev, houseNo: event.target.value }))}
                placeholder="e.g. A-24"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-area">Area</Label>
              <Input
                id="supplier-area"
                value={form.area}
                onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))}
                placeholder="e.g. Green Park"
                required
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit" className="gap-2 sm:flex-1">
                <Route className="h-4 w-4" />
                Show on Map
              </Button>
              <Button type="button" variant="outline" className="gap-2 sm:flex-1" onClick={handleReset}>
                Reset Fields
              </Button>
            </div>
          </form>

          <div className="mt-6 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Live preview
              </Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              This UI is ready for mobile use and keeps the location preview aligned with the house number and area you enter.
            </p>
          </div>
        </Card>

        <Card className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Map preview</p>
              <h2 className="mt-2 text-xl font-bold">Approximate delivery pin</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The pin is placed from the submitted house no. and area so the preview always stays in sync.
              </p>
            </div>
            <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
              <Search className="h-3.5 w-3.5" />
              {preview.empty ? 'Waiting' : 'Pinned'}
            </Badge>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:44px_44px] p-4 sm:p-5">
            <div className="relative min-h-[320px] overflow-hidden rounded-[1.5rem] border border-border/60 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.15),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.78),rgba(244,244,245,0.96))]">
              <div className="absolute left-[8%] top-[18%] h-px w-[84%] bg-emerald-950/10" />
              <div className="absolute left-[18%] top-[62%] h-px w-[68%] bg-emerald-950/10" />
              <div className="absolute left-[22%] top-[10%] h-[78%] w-px bg-emerald-950/10" />
              <div className="absolute left-[72%] top-[16%] h-[72%] w-px bg-emerald-950/10" />

              <div className="absolute left-4 top-4 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                Main road
              </div>
              <div className="absolute bottom-4 left-4 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                Residential lane
              </div>
              <div className="absolute right-4 top-4 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                Market side
              </div>

              <div
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${preview.x}%`, top: `${preview.y}%` }}
              >
                <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/15 blur-xl" />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/20 bg-background/95 shadow-lg shadow-emerald-500/15">
                  <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              <div className="absolute bottom-4 right-4 max-w-[12rem] rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Selected point</p>
                <p className="mt-1 text-sm font-semibold">{preview.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{preview.zone}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">House No.</p>
              <p className="mt-2 text-sm font-semibold">{submitted?.houseNo || 'Not set yet'}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Area</p>
              <p className="mt-2 text-sm font-semibold">{submitted?.area || 'Not set yet'}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
              <p className="mt-2 text-sm font-semibold">{preview.empty ? 'Waiting for details' : 'Preview ready'}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/15 p-2.5">
                <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{preview.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{preview.details}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-start">
        <Button asChild variant="ghost" className="gap-2">
          <Link href="/dashboard/supplier">
            <ArrowRight className="h-4 w-4 rotate-180" />
            Return to dashboard
          </Link>
        </Button>
      </div>
    </div>
  )
}