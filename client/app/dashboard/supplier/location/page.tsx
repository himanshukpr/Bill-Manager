'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Home, MapPin, Route, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSessionAuth, type SessionAuth } from '@/lib/auth'
import { LocationRouteMap } from '@/components/dashboard/supplier/location-route-map'

type LocationForm = {
  houseNo: string
  area: string
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
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const session = getSessionAuth()
    if (!session?.token || session.role !== 'supplier') {
      router.replace('/')
      return
    }

    setAuth(session)
    setReady(true)
  }, [router])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = {
      houseNo: form.houseNo.trim(),
      area: form.area.trim(),
    }
    setSubmitted(next)
    setSearchQuery(`${next.houseNo}, ${next.area}`)
  }

  function handleReset() {
    setForm({ houseNo: '', area: '' })
    setSubmitted(null)
    setSearchQuery('')
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
              <h2 className="mt-2 text-xl font-bold">Leaflet Route Preview</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Powered by OpenStreetMap and OpenRouteService. Click on map after pinning a house to build route.
              </p>
            </div>
            <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
              <Search className="h-3.5 w-3.5" />
              {submitted ? 'Pinned' : 'Waiting'}
            </Badge>
          </div>

          <div className="mt-5">
            <LocationRouteMap
              searchQuery={searchQuery}
              houseNo={submitted?.houseNo ?? ''}
              area={submitted?.area ?? ''}
            />
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
              <p className="mt-2 text-sm font-semibold">{submitted ? 'Preview ready' : 'Waiting for details'}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/15 p-2.5">
                <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {submitted ? `House ${submitted.houseNo}${submitted.area ? ` · ${submitted.area}` : ''}` : 'No location selected yet'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pin a house first, then click anywhere on the map to generate route details.
                </p>
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