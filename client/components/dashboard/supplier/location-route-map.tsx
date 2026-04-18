'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import Map, { Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre'
import { Loader2, MapPin, Navigation, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { housesApi } from '@/lib/api'
import { clearSessionAuth } from '@/lib/auth'

type LatLng = [number, number]

type LocationRouteMapProps = {
  searchQuery: string
  houseNo: string
  area: string
  houseId?: number
  storedLocation?: string
  onLocationSaved?: (coords: { latitude: number; longitude: number }) => void
}

type ViewState = {
  latitude: number
  longitude: number
  zoom: number
}

type LocationErrorLike = {
  code?: number
}

const DEFAULT_VIEW: ViewState = {
  latitude: 28.6139,
  longitude: 77.209,
  zoom: 12,
}

const TARGET_ACCURACY_METERS = 20
const MAX_ACCEPTABLE_ACCURACY_METERS = 45

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: 'Map data © OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
} as any

function parseCoordinateQuery(query: string): LatLng | null {
  const match = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)

  if (!match) return null

  const latitude = Number(match[1])
  const longitude = Number(match[2])

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null

  return [latitude, longitude]
}

async function getBestCurrentPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported on this device.')
  }

  return new Promise<GeolocationPosition>((resolve, reject) => {
    let best: GeolocationPosition | null = null
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }

    const startedAt = Date.now()

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextAccuracy = position.coords.accuracy ?? Number.POSITIVE_INFINITY
        const bestAccuracy = best?.coords.accuracy ?? Number.POSITIVE_INFINITY

        if (!best || nextAccuracy < bestAccuracy) {
          best = position
        }

        // Resolve early if we got a strong GPS fix.
        if (nextAccuracy <= TARGET_ACCURACY_METERS) {
          navigator.geolocation.clearWatch(watchId)
          finish(() => resolve(position))
          return
        }

        // If we already waited long enough, settle on the best known point.
        const waitedMs = Date.now() - startedAt
        if (waitedMs >= 15000 && best) {
          navigator.geolocation.clearWatch(watchId)
          finish(() => resolve(best as GeolocationPosition))
        }
      },
      (error) => {
        navigator.geolocation.clearWatch(watchId)
        finish(() => reject(error))
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    )

    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId)
      if (best) {
        finish(() => resolve(best as GeolocationPosition))
        return
      }

      finish(() => reject(new Error('Timed out while fetching current location.')))
    }, 20000)
  })
}

export function LocationRouteMap({
  searchQuery,
  houseNo,
  area: _area,
  houseId,
  storedLocation,
  onLocationSaved,
}: LocationRouteMapProps) {
  const router = useRouter()
  const mapRef = useRef<MapRef | null>(null)
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW)
  const [targetLocation, setTargetLocation] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openingDirections, setOpeningDirections] = useState(false)
  const [status, setStatus] = useState('')

  const saveCurrentLocation = useCallback(async () => {
    if (!houseId) {
      setStatus('Cannot save: house ID is missing.')
      return
    }

    if (!navigator.geolocation) {
      setStatus('Geolocation is not supported on this device.')
      return
    }

    setSaving(true)

    try {
      const position = await getBestCurrentPosition()

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }

      const accuracy = Math.round(position.coords.accuracy ?? 0)
      if (accuracy > 0 && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
        setStatus(`Location not precise enough (${accuracy}m). Move to open sky and try again.`)
        return
      }

      await housesApi.updateLocation(houseId, coords)

      setTargetLocation([coords.latitude, coords.longitude])
      setViewState((prev) => ({
        ...prev,
        latitude: coords.latitude,
        longitude: coords.longitude,
        zoom: 16,
      }))

      setStatus(`✓ Location saved for House ${houseNo}${accuracy > 0 ? ` (${accuracy}m accuracy)` : ''}`)
      onLocationSaved?.(coords)
    } catch (error) {
      if (error instanceof Error && /unauthorized|forbidden|jwt|token/i.test(error.message)) {
        clearSessionAuth()
        setStatus('Session expired. Please login again.')
        router.replace('/')
        return
      }

      const code = (error as LocationErrorLike)?.code

      if (code === 1) {
        setStatus('Location permission denied. Please allow access and try again.')
      } else if (code === 2) {
        setStatus('Location unavailable. Turn on GPS and try again.')
      } else if (code === 3) {
        setStatus('Location request timed out. Please retry in open sky.')
      } else {
        setStatus('Could not fetch accurate location. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }, [houseId, houseNo, onLocationSaved])

  const openDirections = useCallback(() => {
    if (!targetLocation) {
      setStatus('No saved location found for this house.')
      return
    }

    setOpeningDirections(true)

    try {
      const [lat, lng] = targetLocation
      const destination = `${lat},${lng}`
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`
      window.open(mapsUrl, '_blank', 'noopener,noreferrer')
      setStatus('Opening Google Maps directions...')
    } finally {
      setOpeningDirections(false)
    }
  }, [targetLocation])

  useEffect(() => {
    const query = searchQuery.trim()
    const savedCoordinates = parseCoordinateQuery(storedLocation ?? '')

    if (savedCoordinates) {
      setTargetLocation(savedCoordinates)
      setViewState((prev) => ({
        ...prev,
        latitude: savedCoordinates[0],
        longitude: savedCoordinates[1],
        zoom: 16,
      }))
      setStatus('Saved house location loaded.')
      return
    }

    if (!query) {
      setTargetLocation(null)
      setStatus('No saved house location found.')
      return
    }

    const directCoords = parseCoordinateQuery(query)
    if (directCoords) {
      setTargetLocation(directCoords)
      setViewState((prev) => ({
        ...prev,
        latitude: directCoords[0],
        longitude: directCoords[1],
        zoom: 16,
      }))
      setStatus('House location loaded.')
      return
    }

    let active = true

    const locateAddress = async () => {
      setLocating(true)
      setStatus('Locating house...')

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        )

        if (!response.ok) {
          throw new Error('Nominatim request failed')
        }

        const result = (await response.json()) as Array<{ lat: string; lon: string }>
        if (!active || result.length === 0) {
          throw new Error('No location found')
        }

        const latitude = Number(result[0].lat)
        const longitude = Number(result[0].lon)

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error('Invalid coordinates')
        }

        const resolvedTarget: LatLng = [latitude, longitude]
        setTargetLocation(resolvedTarget)
        setViewState((prev) => ({
          ...prev,
          latitude,
          longitude,
          zoom: 15,
        }))
        setStatus('House location loaded.')
      } catch {
        if (!active) return
        setTargetLocation(null)
        setStatus('Could not locate this house. Save location from current position.')
      } finally {
        if (active) {
          setLocating(false)
        }
      }
    }

    void locateAddress()

    return () => {
      active = false
    }
  }, [searchQuery, storedLocation])

  const isBusy = useMemo(() => saving || locating || openingDirections, [saving, locating, openingDirections])

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="h-[68vh] min-h-[420px] max-h-[700px] w-full">
          <Map
            ref={mapRef}
            mapLib={maplibregl}
            mapStyle={MAP_STYLE}
            {...viewState}
            onMove={(event) => setViewState(event.viewState)}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />

            {targetLocation ? (
              <Marker longitude={targetLocation[1]} latitude={targetLocation[0]} anchor="bottom">
                <div className="rounded-full border border-emerald-600/40 bg-emerald-500 p-2 shadow-lg shadow-emerald-500/25">
                  <MapPin className="h-4 w-4 text-white" />
                </div>
              </Marker>
            ) : null}
          </Map>

          {locating ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/25">
              <div className="flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Locating...
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={saveCurrentLocation} disabled={isBusy || !houseId} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Location'}
        </Button>
        <Button variant="outline" onClick={openDirections} disabled={isBusy || !targetLocation} className="gap-2">
          {openingDirections ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          Directions
        </Button>
      </div>

      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </div>
  )
}
