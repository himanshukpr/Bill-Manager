"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface ContextMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  x: number
  y: number
  onMoveToPosition: () => void
}

export function ContextMenu({ open, onOpenChange, x, y, onMoveToPosition }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open, onOpenChange])

  const handleMoveClick = useCallback(() => {
    onMoveToPosition()
    onOpenChange(false)
  }, [onMoveToPosition, onOpenChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleMoveClick()
    }
  }, [handleMoveClick])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className="fixed z-50 min-w-[160px] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
        style={{
          left: x,
          top: y,
        }}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          className="flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-sm text-popover-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={handleMoveClick}
        >
          Move to Position
        </button>
      </motion.div>
    </AnimatePresence>
  )
}