"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { PeriodSelector } from "@/components/member/period-selector"
import { StatCard } from "@/components/dashboard/stat-card"
import { clearSessionAuth, getSessionAuth, type SessionAuth } from "@/lib/auth"

const memberStats = [
  { label: "Bills Added Today", value: "6", hint: "Across active period" },
  { label: "Draft Entries", value: "2", hint: "Need final submit" },
  { label: "Supplier Notes", value: "4", hint: "Unread comments" },
]

export default function MemberDashboardPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const session = getSessionAuth()

    if (!session || (session.role !== "member" && session.role !== "supplier")) {
      router.replace("/")
      return
    }

    setAuth(session)
    setReady(true)
  }, [router])

  function logout() {
    clearSessionAuth()
    router.replace("/")
  }

  if (!ready || !auth) {
    return <main className="min-h-svh bg-slate-50" />
  }

  return (
    <main className="min-h-svh bg-slate-50 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Member Workspace
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                Welcome, {auth.profile}
              </h1>
              <p className="mt-2 text-sm text-slate-600">User ID: {auth.userId}</p>
            </div>
            <Button type="button" variant="outline" className="rounded-xl" onClick={logout}>
              Log Out
            </Button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {memberStats.map((item) => (
            <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <PeriodSelector defaultPeriod="morning" />

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Today Checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Verify bills captured in selected period.</li>
              <li>Attach receipts for pending entries.</li>
              <li>Submit entries before end-of-day cut-off.</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  )
}
