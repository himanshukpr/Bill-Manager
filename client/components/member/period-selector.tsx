"use client"

import { useState } from "react"

type PeriodSelectorProps = {
  defaultPeriod?: "morning" | "evening"
}

export function PeriodSelector({ defaultPeriod = "morning" }: PeriodSelectorProps) {
  const [period, setPeriod] = useState<"morning" | "evening">(defaultPeriod)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Select Period</h2>
      <p className="mt-1 text-xs text-slate-500">Choose shift for bill entry activity.</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setPeriod("morning")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
            period === "morning"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
        >
          Morning
        </button>
        <button
          type="button"
          onClick={() => setPeriod("evening")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
            period === "evening"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
        >
          Evening
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        Active period: <span className="font-semibold capitalize">{period}</span>
      </div>
    </section>
  )
}
