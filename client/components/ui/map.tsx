'use client'

import MapLibreGL, {
  type MapOptions,
  type MarkerOptions,
  type PopupOptions,
  type StyleSpecification,
} from 'maplibre-gl'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Locate, Maximize, Minus, Plus, X } from 'lucide-react'

import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark'

const defaultStyles = {
  dark: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['/api/tiles/{z}/{x}/{y}'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm-tiles',
        type: 'raster',
        source: 'osm',
      },
    ],
  } as StyleSpecification,
  light: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['/api/tiles/{z}/{x}/{y}'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm-tiles',
        type: 'raster',
        source: 'osm',
      },
    ],
  } as StyleSpecification,
}
const fallbackStyle = defaultStyles.light

type MapStyleOption = string | StyleSpecification

type MapViewport = {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

type MapContextValue = {
  map: MapLibreGL.Map | null
  isLoaded: boolean
}

type MapProps = {
  children?: ReactNode
  className?: string
  theme?: Theme
  styles?: {
    light?: MapStyleOption
    dark?: MapStyleOption
  }
  viewport?: Partial<MapViewport>
  onViewportChange?: (viewport: MapViewport) => void
  loading?: boolean
} & Omit<MapOptions, 'container' | 'style'>

type MapRef = MapLibreGL.Map

type MapMarkerProps = {
  longitude: number
  latitude: number
  children: ReactNode
  onClick?: (e: MouseEvent) => void
  onMouseEnter?: (e: MouseEvent) => void
  onMouseLeave?: (e: MouseEvent) => void
  onDragStart?: (lngLat: { lng: number; lat: number }) => void
  onDrag?: (lngLat: { lng: number; lat: number }) => void
  onDragEnd?: (lngLat: { lng: number; lat: number }) => void
} & Omit<MarkerOptions, 'element'>

type MarkerContentProps = {
  children?: ReactNode
  className?: string
}

type MarkerTooltipProps = {
  children: ReactNode
  className?: string
} & Omit<PopupOptions, 'className' | 'closeButton' | 'closeOnClick'>

type MarkerLabelProps = {
  children: ReactNode
  className?: string
  position?: 'top' | 'bottom'
}

type MarkerPopupProps = {
  children: ReactNode
  className?: string
  closeButton?: boolean
} & Omit<PopupOptions, 'className' | 'closeButton'>

type MapPopupProps = {
  longitude: number
  latitude: number
  onClose?: () => void
  children: ReactNode
  className?: string
  closeButton?: boolean
} & Omit<PopupOptions, 'className' | 'closeButton'>

type MapControlsProps = {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  showZoom?: boolean
  showCompass?: boolean
  showLocate?: boolean
  showFullscreen?: boolean
  className?: string
  onLocate?: (coords: { longitude: number; latitude: number }) => void
}

const MapContext = createContext<MapContextValue | null>(null)
const MarkerContext = createContext<{ marker: MapLibreGL.Marker; map: MapLibreGL.Map | null } | null>(null)

function useMap() {
  const value = useContext(MapContext)
  if (!value) {
    throw new Error('useMap must be used within a Map component.')
  }

  return value
}

function useMarkerContext() {
  const value = useContext(MarkerContext)
  if (!value) {
    throw new Error('Marker components must be used within MapMarker.')
  }

  return value
}

function getDocumentTheme(): Theme | null {
  if (typeof document === 'undefined') return null

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function useResolvedTheme(themeProp?: Theme): Theme {
  const [internalTheme, setInternalTheme] = useState<Theme>(() => getDocumentTheme() ?? getSystemTheme())
  const resolvedTheme = themeProp ?? internalTheme

  useEffect(() => {
    if (themeProp) return

    const updateTheme = () => setInternalTheme(getDocumentTheme() ?? getSystemTheme())

    const observer = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(updateTheme)

    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener?.('change', updateTheme)

    return () => {
      observer?.disconnect()
      media.removeEventListener?.('change', updateTheme)
    }
  }, [themeProp])

  return resolvedTheme
}

function getViewport(map: MapLibreGL.Map): MapViewport {
  const center = map.getCenter()

  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }
}

function isValidCenter(center: unknown): center is [number, number] {
  if (!Array.isArray(center) || center.length !== 2) return false

  const [lng, lat] = center
  return Number.isFinite(lng) && Number.isFinite(lat)
}

function resolveStyle(theme: Theme, styles?: MapProps['styles']): MapStyleOption {
  const fallback = theme === 'dark' ? defaultStyles.dark : defaultStyles.light
  return theme === 'dark' ? styles?.dark ?? fallback : styles?.light ?? fallback
}

const Map = forwardRef<MapRef, MapProps>(function Map(
  {
    children,
    className,
    theme: themeProp,
    styles,
    viewport,
    onViewportChange,
    loading = false,
    ...props
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mapInstance, setMapInstance] = useState<MapLibreGL.Map | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isStyleLoaded, setIsStyleLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const currentStyleRef = useRef<MapStyleOption | null>(null)
  const usedFallbackStyleRef = useRef(false)
  const onViewportChangeRef = useRef(onViewportChange)
  onViewportChangeRef.current = onViewportChange
  const resolvedTheme = useResolvedTheme(themeProp)

  const mapStyles = useMemo(
    () => ({
      dark: styles?.dark ?? defaultStyles.dark,
      light: styles?.light ?? defaultStyles.light,
    }),
    [styles],
  )

  useImperativeHandle(ref, () => mapInstance as MapLibreGL.Map, [mapInstance])

  useEffect(() => {
    if (!containerRef.current || mapInstance) return

    const style = resolveStyle(resolvedTheme, mapStyles)
    currentStyleRef.current = style
    usedFallbackStyleRef.current = false
    setLoadError(null)

    const map = new MapLibreGL.Map({
      container: containerRef.current,
      style,
      renderWorldCopies: false,
      attributionControl: {
        compact: true,
      },
      ...props,
      ...(viewport ?? {}),
    })

    const handleLoad = () => {
      setIsLoaded(true)
      setIsStyleLoaded(true)
      setLoadError(null)
    }

    const handleStyleData = () => setIsStyleLoaded(true)

    const handleError = () => {
      if (!usedFallbackStyleRef.current) {
        usedFallbackStyleRef.current = true
        currentStyleRef.current = fallbackStyle
        setIsStyleLoaded(false)
        setLoadError('Primary map style failed, switched to fallback style.')
        map.setStyle(fallbackStyle)
        return
      }

      setLoadError('Unable to load map. Check your internet connection.')
      setIsLoaded(true)
      setIsStyleLoaded(true)
    }

    const handleMove = () => {
      if (!onViewportChangeRef.current) return
      onViewportChangeRef.current(getViewport(map))
    }

    const loadTimeout = window.setTimeout(() => {
      if (!map.loaded()) {
        setLoadError('Map is taking too long to load. Check your network and try again.')
      }
    }, 8000)

    map.on('load', handleLoad)
    map.on('styledata', handleStyleData)
    map.on('error', handleError)
    map.on('move', handleMove)

    setMapInstance(map)

    return () => {
      window.clearTimeout(loadTimeout)
      map.off('load', handleLoad)
      map.off('styledata', handleStyleData)
      map.off('error', handleError)
      map.off('move', handleMove)
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstance])

  useEffect(() => {
    if (!mapInstance || !viewport) return

    const nextView: Partial<MapViewport> = {}
    if (isValidCenter(viewport.center)) nextView.center = viewport.center
    if (Number.isFinite(viewport.zoom)) nextView.zoom = viewport.zoom
    if (Number.isFinite(viewport.bearing)) nextView.bearing = viewport.bearing
    if (Number.isFinite(viewport.pitch)) nextView.pitch = viewport.pitch
    if (Object.keys(nextView).length === 0) return

    mapInstance.jumpTo(nextView)
  }, [mapInstance, viewport])

  useEffect(() => {
    if (!mapInstance || !isLoaded) return

    const nextStyle = resolveStyle(resolvedTheme, mapStyles)
    if (currentStyleRef.current === nextStyle) return

    currentStyleRef.current = nextStyle
    setIsStyleLoaded(false)
    mapInstance.setStyle(nextStyle)
  }, [mapInstance, isLoaded, mapStyles, resolvedTheme])

  return (
    <MapContext.Provider value={{ map: mapInstance, isLoaded: isLoaded && isStyleLoaded }}>
      <div className={cn('relative overflow-hidden rounded-xl', loading && 'animate-pulse', className)}>
        <div ref={containerRef} className="h-full w-full" />
        {!isLoaded ? (
          <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs shadow-sm backdrop-blur">
              <span className="border-foreground/30 size-3 animate-spin rounded-full border-2 border-t-transparent" />
              Loading map...
            </div>
          </div>
        ) : null}
        {loadError ? (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-10 rounded-md border border-amber-500/35 bg-amber-50/95 px-2 py-1 text-[11px] font-medium text-amber-800 shadow-sm">
            {loadError}
          </div>
        ) : null}
        {children}
      </div>
    </MapContext.Provider>
  )
})

function MapMarker({
  longitude,
  latitude,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDrag,
  onDragEnd,
  draggable = false,
  ...markerOptions
}: MapMarkerProps) {
  const { map } = useMap()
  const callbacksRef = useRef({ onClick, onMouseEnter, onMouseLeave, onDragStart, onDrag, onDragEnd })
  callbacksRef.current = { onClick, onMouseEnter, onMouseLeave, onDragStart, onDrag, onDragEnd }

  const marker = useMemo(
    () =>
      new MapLibreGL.Marker({
        ...markerOptions,
        element: document.createElement('div'),
        draggable,
      }).setLngLat([longitude, latitude]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    marker.setLngLat([longitude, latitude])
  }, [longitude, latitude, marker])

  useEffect(() => {
    if (!map) return

    const element = marker.getElement()
    const handleClick = (event: MouseEvent) => callbacksRef.current.onClick?.(event)
    const handleMouseEnter = (event: MouseEvent) => callbacksRef.current.onMouseEnter?.(event)
    const handleMouseLeave = (event: MouseEvent) => callbacksRef.current.onMouseLeave?.(event)
    const handleDragStart = () => callbacksRef.current.onDragStart?.(marker.getLngLat())
    const handleDrag = () => callbacksRef.current.onDrag?.(marker.getLngLat())
    const handleDragEnd = () => callbacksRef.current.onDragEnd?.(marker.getLngLat())

    marker.addTo(map)
    element.addEventListener('click', handleClick)
    element.addEventListener('mouseenter', handleMouseEnter)
    element.addEventListener('mouseleave', handleMouseLeave)
    marker.on('dragstart', handleDragStart)
    marker.on('drag', handleDrag)
    marker.on('dragend', handleDragEnd)

    return () => {
      element.removeEventListener('click', handleClick)
      element.removeEventListener('mouseenter', handleMouseEnter)
      element.removeEventListener('mouseleave', handleMouseLeave)
      marker.off('dragstart', handleDragStart)
      marker.off('drag', handleDrag)
      marker.off('dragend', handleDragEnd)
      marker.remove()
    }
  }, [map, marker])

  return <MarkerContext.Provider value={{ marker, map }}>{children}</MarkerContext.Provider>
}

function MarkerContent({ children, className }: MarkerContentProps) {
  const { marker } = useMarkerContext()

  return createPortal(
    <div className={cn('relative cursor-pointer', className)}>{children || <DefaultMarkerIcon />}</div>,
    marker.getElement(),
  )
}

function DefaultMarkerIcon() {
  return <div className="bg-primary size-4 rounded-full border-2 border-white shadow-lg" />
}

function MarkerLabel({ children, className, position = 'top' }: MarkerLabelProps) {
  const positionClasses = {
    top: 'bottom-full mb-1',
    bottom: 'top-full mt-1',
  }

  return (
    <div
      className={cn(
        'text-foreground absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium',
        positionClasses[position],
        className,
      )}
    >
      {children}
    </div>
  )
}

function PopupCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close popup"
      className="text-foreground hover:bg-muted focus-visible:ring-ring absolute top-0.5 right-0.5 z-10 inline-flex size-5 items-center justify-center rounded-sm transition-colors focus:outline-none focus-visible:ring-2"
    >
      <X className="size-3.5" />
    </button>
  )
}

function MarkerTooltip({ children, className, ...popupOptions }: MarkerTooltipProps) {
  const { marker, map } = useMarkerContext()
  const container = useMemo(() => document.createElement('div'), [])
  const prevTooltipOptions = useRef(popupOptions)

  const tooltip = useMemo(
    () =>
      new MapLibreGL.Popup({
        offset: 16,
        ...popupOptions,
        closeOnClick: true,
        closeButton: false,
      }).setMaxWidth('none'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    if (!map) return

    tooltip.setDOMContent(container)

    const handleMouseEnter = () => {
      tooltip.setLngLat(marker.getLngLat()).addTo(map)
    }

    const handleMouseLeave = () => tooltip.remove()

    marker.getElement().addEventListener('mouseenter', handleMouseEnter)
    marker.getElement().addEventListener('mouseleave', handleMouseLeave)

    return () => {
      marker.getElement().removeEventListener('mouseenter', handleMouseEnter)
      marker.getElement().removeEventListener('mouseleave', handleMouseLeave)
      tooltip.remove()
    }
  }, [container, map, marker, tooltip])

  if (tooltip.isOpen()) {
    const prev = prevTooltipOptions.current
    if (prev.offset !== popupOptions.offset) {
      tooltip.setOffset(popupOptions.offset ?? 16)
    }
    prevTooltipOptions.current = popupOptions
  }

  return createPortal(
    <div className={cn('bg-popover text-popover-foreground rounded-md border px-2.5 py-1.5 text-xs shadow-md', className)}>
      {children}
    </div>,
    container,
  )
}

function MarkerPopup({ children, className, closeButton = false, ...popupOptions }: MarkerPopupProps) {
  const { marker, map } = useMarkerContext()
  const container = useMemo(() => document.createElement('div'), [])
  const prevPopupOptions = useRef(popupOptions)

  const popup = useMemo(
    () =>
      new MapLibreGL.Popup({
        offset: 16,
        ...popupOptions,
        closeButton: false,
      })
        .setMaxWidth('none')
        .setDOMContent(container),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    if (!map) return

    marker.setPopup(popup)

    return () => {
      marker.setPopup(null)
    }
  }, [map, marker, popup])

  if (popup.isOpen()) {
    const prev = prevPopupOptions.current

    if (prev.offset !== popupOptions.offset) {
      popup.setOffset(popupOptions.offset ?? 16)
    }
    if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
      popup.setMaxWidth(popupOptions.maxWidth ?? 'none')
    }
    prevPopupOptions.current = popupOptions
  }

  return createPortal(
    <div className={cn('bg-popover text-popover-foreground relative max-w-62 rounded-md border p-3 shadow-md', 'animate-in fade-in-0 zoom-in-95 duration-200 ease-out', className)}>
      {closeButton ? <PopupCloseButton onClick={() => popup.remove()} /> : null}
      {children}
    </div>,
    container,
  )
}

function MapPopup({ longitude, latitude, onClose, children, className, closeButton = false, ...popupOptions }: MapPopupProps) {
  const { map } = useMap()
  const popupOptionsRef = useRef(popupOptions)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const container = useMemo(() => document.createElement('div'), [])

  const popup = useMemo(
    () =>
      new MapLibreGL.Popup({
        offset: 16,
        ...popupOptions,
        closeButton: false,
      })
        .setMaxWidth('none')
        .setLngLat([longitude, latitude]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    if (!map) return

    const handleClose = () => onCloseRef.current?.()
    popup.on('close', handleClose)
    popup.setDOMContent(container)
    popup.addTo(map)

    return () => {
      popup.off('close', handleClose)
      popup.remove()
    }
  }, [container, map, popup])

  if (popup.isOpen()) {
    const prev = popupOptionsRef.current

    if (popup.getLngLat().lng !== longitude || popup.getLngLat().lat !== latitude) {
      popup.setLngLat([longitude, latitude])
    }

    if (prev.offset !== popupOptions.offset) {
      popup.setOffset(popupOptions.offset ?? 16)
    }
    if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
      popup.setMaxWidth(popupOptions.maxWidth ?? 'none')
    }
    popupOptionsRef.current = popupOptions
  }

  return createPortal(
    <div className={cn('bg-popover text-popover-foreground relative max-w-62 rounded-md border p-3 shadow-md', 'animate-in fade-in-0 zoom-in-95 duration-200 ease-out', className)}>
      {closeButton ? <PopupCloseButton onClick={() => popup.remove()} /> : null}
      {children}
    </div>,
    container,
  )
}

function ControlGroup({ children }: { children: React.ReactNode }) {
  return <div className="border-border bg-background flex flex-col overflow-hidden rounded-md border shadow-sm [&>button:not(:last-child)]:border-b">{children}</div>
}

function ControlButton({
  onClick,
  label,
  children,
  disabled = false,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      type="button"
      className={cn(
        'flex size-8 items-center justify-center transition-all',
        'hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

const positionClasses = {
  'top-left': 'top-2 left-2',
  'top-right': 'top-2 right-2',
  'bottom-left': 'bottom-2 left-2',
  'bottom-right': 'bottom-10 right-2',
}

function MapControls({
  position = 'bottom-right',
  showZoom = true,
  showCompass = false,
  showLocate = false,
  showFullscreen = false,
  className,
  onLocate,
}: MapControlsProps) {
  const { map } = useMap()
  const [waitingForLocation, setWaitingForLocation] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleZoomIn = useCallback(() => {
    map?.zoomTo(map.getZoom() + 1, { duration: 300 })
  }, [map])

  const handleZoomOut = useCallback(() => {
    map?.zoomTo(map.getZoom() - 1, { duration: 300 })
  }, [map])

  const handleResetBearing = useCallback(() => {
    map?.resetNorthPitch({ duration: 300 })
  }, [map])

  const handleLocate = useCallback(() => {
    setWaitingForLocation(true)

    if (!('geolocation' in navigator)) {
      setWaitingForLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { longitude: pos.coords.longitude, latitude: pos.coords.latitude }
        onLocate?.(coords)
        map?.flyTo({ center: [coords.longitude, coords.latitude], zoom: Math.max(map.getZoom(), 15), duration: 900 })
        setWaitingForLocation(false)
      },
      () => setWaitingForLocation(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }, [map, onLocate])

  const handleFullscreen = useCallback(() => {
    const element = document.documentElement
    if (!document.fullscreenElement) {
      void element.requestFullscreen?.()
      setIsFullscreen(true)
      return
    }

    void document.exitFullscreen?.()
    setIsFullscreen(false)
  }, [])

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  return (
    <div className={cn('absolute z-10 flex flex-col gap-1.5', positionClasses[position], className)}>
      {showZoom ? (
        <ControlGroup>
          <ControlButton onClick={handleZoomIn} label="Zoom in">
            <Plus className="size-4" />
          </ControlButton>
          <ControlButton onClick={handleZoomOut} label="Zoom out">
            <Minus className="size-4" />
          </ControlButton>
        </ControlGroup>
      ) : null}
      {showCompass ? (
        <ControlGroup>
          <ControlButton onClick={handleResetBearing} label="Reset bearing">
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
              <path d="M12 2l3.5 9.5L22 12l-6.5.5L12 22l-3.5-9.5L2 12l6.5-.5L12 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </ControlButton>
        </ControlGroup>
      ) : null}
      {showLocate ? (
        <ControlGroup>
          <ControlButton onClick={handleLocate} label="Find my location" disabled={waitingForLocation}>
            <Locate className={cn('size-4', waitingForLocation && 'animate-pulse')} />
          </ControlButton>
        </ControlGroup>
      ) : null}
      {showFullscreen ? (
        <ControlGroup>
          <ControlButton onClick={handleFullscreen} label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            <Maximize className="size-4" />
          </ControlButton>
        </ControlGroup>
      ) : null}
    </div>
  )
}

export {
  Map,
  useMap,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MarkerTooltip,
  MarkerLabel,
  MapPopup,
  MapControls,
}

export type { MapRef, MapViewport }