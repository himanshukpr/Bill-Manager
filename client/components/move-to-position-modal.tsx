"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface MoveToPositionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPosition: number
  totalItems: number
  itemTitle: string
  onMove: (newPosition: number) => void
}

function MoveToPositionModalInner({
  currentPosition,
  totalItems,
  itemTitle,
  onMove,
  onOpenChange,
}: {
  currentPosition: number
  totalItems: number
  itemTitle: string
  onMove: (newPosition: number) => void
  onOpenChange: (open: boolean) => void
}) {
  const [positionInput, setPositionInput] = useState(() => String(currentPosition + 1))
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleSubmit = useCallback(() => {
    const value = positionInput.trim()
    
    if (!value) {
      setError("Position is required")
      return
    }

    const num = parseInt(value, 10)
    
    if (isNaN(num)) {
      setError("Please enter a valid number")
      return
    }

    if (num < 1 || num > totalItems) {
      setError(`Position must be between 1 and ${totalItems}`)
      return
    }

    if (num === currentPosition + 1) {
      onOpenChange(false)
      return
    }

    onMove(num - 1)
    onOpenChange(false)
  }, [positionInput, currentPosition, totalItems, onMove, onOpenChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === "" || /^\d+$/.test(value)) {
      setPositionInput(value)
      setError(null)
    }
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false)
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [onOpenChange])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 isolate z-50 bg-black/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-4xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/5 outline-none sm:max-w-md"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-none tracking-tight">Move to Position</h2>
          <p className="text-sm text-muted-foreground">
            Move &quot;{itemTitle}&quot; to a new position in the list.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Current Position</p>
            <p className="text-lg font-semibold">#{currentPosition + 1} of {totalItems}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-position">New Position (1-{totalItems})</Label>
            <Input
              ref={inputRef}
              id="new-position"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={positionInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className={error ? "border-destructive" : ""}
              aria-invalid={!!error}
              aria-describedby={error ? "position-error" : undefined}
            />
            {error && (
              <p id="position-error" className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
          >
            Move
          </Button>
        </div>
      </motion.div>
    </>
  )
}

export function MoveToPositionModal({
  open,
  onOpenChange,
  currentPosition,
  totalItems,
  itemTitle,
  onMove,
}: MoveToPositionModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <MoveToPositionModalInner
          key="modal-inner"
          currentPosition={currentPosition}
          totalItems={totalItems}
          itemTitle={itemTitle}
          onMove={onMove}
          onOpenChange={onOpenChange}
        />
      )}
    </AnimatePresence>
  )
}
