"use client"

import { useState } from "react"

type PeriodSelectorProps = {
  defaultPeriod?: "morning" | "evening"
}

export function PeriodSelector({ defaultPeriod = "morning" }: PeriodSelectorProps) {
  const [period, setPeriod] = useState<"morning" | "evening">(defaultPeriod)

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Select Period</h2>
      <p className="mt-1 text-xs text-muted-foreground">Choose shift for bill entry activity.</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setPeriod("morning")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
            period === "morning"
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-background/80 text-foreground/70 hover:bg-muted"
          }`}
        >
          Morning
        </button>
        <button
          type="button"
          onClick={() => setPeriod("evening")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
            period === "evening"
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-background/80 text-foreground/70 hover:bg-muted"
          }`}
        >
          Evening
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-muted/60 p-3 text-sm text-foreground/80">
        Active period: <span className="font-semibold capitalize">{period}</span>
      </div>
    </section>
  )
}
