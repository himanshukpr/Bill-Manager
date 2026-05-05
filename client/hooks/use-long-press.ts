"use client"

import { useState, useCallback, useRef, useEffect } from "react"

interface UseLongPressOptions {
  onLongPress: () => void
  duration?: number
}

export function useLongPress({ onLongPress, duration = 500 }: UseLongPressOptions) {
  const [longPressTriggered, setLongPressTriggered] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setShowContextMenu(true)
    
    let clientX: number, clientY: number
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = (e as React.MouseEvent).clientX
      clientY = (e as React.MouseEvent).clientY
    }
    
    setContextMenuPosition({ x: clientX, y: clientY })
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    startPosRef.current = { x: e.clientX, y: e.clientY }
    setLongPressTriggered(false)
    
    clearTimer()
    
    timerRef.current = setTimeout(() => {
      setLongPressTriggered(true)
      onLongPress()
    }, duration)
  }, [onLongPress, duration, clearTimer])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current) return
    
    const dx = Math.abs(e.clientX - startPosRef.current.x)
    const dy = Math.abs(e.clientY - startPosRef.current.y)
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    if (distance > 10) {
      clearTimer()
    }
  }, [clearTimer])

  const handlePointerUp = useCallback(() => {
    startPosRef.current = null
    clearTimer()
  }, [clearTimer])

  const closeMenu = useCallback(() => {
    setShowContextMenu(false)
    setLongPressTriggered(false)
  }, [])

  useEffect(() => {
    return () => clearTimer()
  }, [clearTimer])

  return {
    longPressTriggered,
    showContextMenu,
    contextMenuPosition,
    handleContextMenu,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    closeMenu,
  }
}