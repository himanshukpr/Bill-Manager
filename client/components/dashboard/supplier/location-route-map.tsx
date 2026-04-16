'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MapPin, Route } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

type LatLng = [number, number]

type RouteSummary = {
  distanceMeters: number
  durationSeconds: number
}

type LocationRouteMapProps = {
  searchQuery: string
  houseNo: string
  area: string
}

const DEFAULT_CENTER: LatLng = [28.6139, 77.209]

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`
  return `${(distanceMeters / 1000).toFixed(2)} km`
}

function formatDuration(durationSeconds: number): string {
  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) return `${minutes} min`
  return `${hours}h ${minutes}m`
}

export function LocationRouteMap({ searchQuery, houseNo, area }: LocationRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const originRef = useRef<LatLng | null>(null)
  const originMarkerRef = useRef<import('leaflet').CircleMarker | null>(null)
  const destinationMarkerRef = useRef<import('leaflet').CircleMarker | null>(null)
  const routeLineRef = useRef<import('leaflet').Polyline | null>(null)

  const [mapReady, setMapReady] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [routing, setRouting] = useState(false)
  const [status, setStatus] = useState('Enter house details and click Show on Map.')
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null)

  const orsKey = process.env.NEXT_PUBLIC_ORS_API_KEY?.trim() ?? ''

  const clearRouteVisuals = useCallback(() => {
    if (routeLineRef.current) {
      routeLineRef.current.remove()
      routeLineRef.current = null
    }

    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove()
      destinationMarkerRef.current = null
    }

    setRouteSummary(null)
  }, [])

  const buildRoute = useCallback(
    async (destination: LatLng) => {
      const map = mapRef.current
      const L = leafletRef.current
      const origin = originRef.current

      if (!map || !L) return

      clearRouteVisuals()

      destinationMarkerRef.current = L.circleMarker(destination, {
        radius: 7,
        weight: 2,
        color: '#f97316',
        fillColor: '#fb923c',
        fillOpacity: 0.9,
      }).addTo(map)

      if (!origin) {
        setStatus('Pin a house location first, then click the map to route.')
        return
      }

      if (!orsKey || orsKey === 'your_openrouteservice_key_here') {
        setStatus('Route key missing. Add NEXT_PUBLIC_ORS_API_KEY in .env to enable click-to-route.')
        return
      }

      setRouting(true)
      setStatus('Building route...')

      try {
        const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
          method: 'POST',
          headers: {
            Authorization: orsKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            coordinates: [
              [origin[1], origin[0]],
              [destination[1], destination[0]],
            ],
          }),
        })

        if (!response.ok) {
          throw new Error('OpenRouteService request failed')
        }

        const data = await response.json()
        const feature = data?.features?.[0]
        const coordinates: number[][] = feature?.geometry?.coordinates

        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          throw new Error('No route geometry returned')
        }

        const routeLatLngs = coordinates.map((coordinate) => [coordinate[1], coordinate[0]] as LatLng)

        routeLineRef.current = L.polyline(routeLatLngs, {
          weight: 5,
          opacity: 0.9,
          color: '#2563eb',
        }).addTo(map)

        map.fitBounds(routeLineRef.current.getBounds(), { padding: [24, 24] })

        const summary = feature?.properties?.summary
        const distance = Number(summary?.distance ?? 0)
        const duration = Number(summary?.duration ?? 0)

        if (distance > 0 && duration > 0) {
          setRouteSummary({ distanceMeters: distance, durationSeconds: duration })
        }

        setStatus('Route ready. Click another point to update.')
      } catch {
        setStatus('Could not build route. Check ORS key and network.')
      } finally {
        setRouting(false)
      }
    },
    [clearRouteVisuals, orsKey],
  )

  useEffect(() => {
    let mounted = true

    const initializeMap = async () => {
      if (!containerRef.current || mapRef.current) return

      const L = await import('leaflet')
      if (!mounted || !containerRef.current) return

      leafletRef.current = L

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 12,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      map.on('click', (event: import('leaflet').LeafletMouseEvent) => {
        void buildRoute([event.latlng.lat, event.latlng.lng])
      })

      mapRef.current = map
      setMapReady(true)
    }

    void initializeMap()

    return () => {
      mounted = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [buildRoute])

  useEffect(() => {
    if (!mapReady || !searchQuery.trim()) return

    let active = true

    const locateAddress = async () => {
      const map = mapRef.current
      const L = leafletRef.current

      if (!map || !L) return

      setGeocoding(true)
      setStatus('Locating house...')

      try {
        const query = encodeURIComponent(searchQuery)
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`, {
          headers: {
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error('Nominatim request failed')
        }

        const result = (await response.json()) as Array<{ lat: string; lon: string }>
        if (!active || result.length === 0) {
          throw new Error('No location found')
        }

        const lat = Number(result[0].lat)
        const lon = Number(result[0].lon)

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          throw new Error('Invalid coordinates')
        }

        originRef.current = [lat, lon]

        if (originMarkerRef.current) {
          originMarkerRef.current.remove()
          originMarkerRef.current = null
        }

        clearRouteVisuals()

        originMarkerRef.current = L.circleMarker([lat, lon], {
          radius: 7,
          weight: 2,
          color: '#059669',
          fillColor: '#10b981',
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindTooltip(`House ${houseNo}${area ? ` - ${area}` : ''}`, { direction: 'top' })

        map.setView([lat, lon], 15)
        setStatus('House pinned. Click anywhere on map to build route.')
      } catch {
        if (!active) return
        originRef.current = null
        clearRouteVisuals()
        setStatus('Could not locate this house/area. Try a more specific area name.')
      } finally {
        if (active) {
          setGeocoding(false)
        }
      }
    }

    void locateAddress()

    return () => {
      active = false
    }
  }, [area, clearRouteVisuals, houseNo, mapReady, searchQuery])

  const stateText = useMemo(() => {
    if (geocoding) return 'Locating'
    if (routing) return 'Routing'
    return 'Ready'
  }, [geocoding, routing])

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div ref={containerRef} className="h-[360px] w-full" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5">
          {geocoding || routing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          {stateText}
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <Route className="h-3.5 w-3.5" />
          Click map to route
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">{status}</p>

      {routeSummary ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Distance</p>
            <p className="mt-1 text-sm font-semibold">{formatDistance(routeSummary.distanceMeters)}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Est. Duration</p>
            <p className="mt-1 text-sm font-semibold">{formatDuration(routeSummary.durationSeconds)}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
