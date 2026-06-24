"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { apiListDairies, apiDairyLogin, getSessionAuth, dashboardPath, type DairyInfo } from "@/lib/auth"

export function DairySelectForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [dairies, setDairies] = useState<DairyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedDairyId, setSelectedDairyId] = useState<number | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (searchParams.get("plan-expired") === "1") {
      setError("Your plan has expired. Please contact support to renew.")
    }
  }, [searchParams])

  useEffect(() => {
    const session = getSessionAuth()
    if (session?.token) {
      router.replace(dashboardPath(session.role))
    }
  }, [router])

  useEffect(() => {
    apiListDairies()
      .then((list) => setDairies(list))
      .catch(() => setDairies([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = dairies.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  const selectedDairy = dairies.find((d) => d.id === selectedDairyId)

  function handleSelectDairy(dairyId: number) {
    if (selectedDairyId === dairyId) {
      setSelectedDairyId(null)
      setPassword("")
      setError("")
    } else {
      setSelectedDairyId(dairyId)
      setPassword("")
      setError("")
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !selectedDairy) return

    if (!password.trim()) {
      setError("Please enter the dairy password.")
      return
    }

    setError("")
    setSubmitting(true)

    try {
      await apiDairyLogin(selectedDairy.email, password)
      router.push(`/dairy/${selectedDairy.id}/users`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid password. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-card/90 p-7 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.22)] backdrop-blur-sm transition-colors duration-300 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-[0_30px_80px_-36px_rgba(0,0,0,0.7)] sm:p-9">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-10 place-content-center rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400">
            Dairy Vyapar
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Select Dairy</h1>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : dairies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
          No dairies registered yet.
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dairy by name…"
              autoFocus
              className="h-11 w-full rounded-xl border border-border bg-background/80 pl-9 pr-3 text-sm text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
            />
          </div>

          {search.trim() && (
            filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-muted-foreground">
                No dairies match &ldquo;{search}&rdquo;
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((d) => {
                  const isSelected = selectedDairyId === d.id
                  return (
                    <div key={d.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectDairy(d.id)}
                        className={`flex w-full items-center gap-4 rounded-xl border bg-background/80 px-4 py-3 text-left transition-all duration-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/15 dark:bg-slate-900 dark:hover:bg-slate-800/80 ${
                          isSelected
                            ? "border-primary/50 ring-2 ring-primary/15"
                            : "border-border hover:border-primary/40 dark:border-slate-700 dark:hover:border-slate-500"
                        }`}
                      >
                        <div className="grid size-10 shrink-0 place-content-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {d.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{d.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.ownerName ? `${d.ownerName} · ` : ""}
                            {d.email}
                          </p>
                        </div>
                        <svg
                          viewBox="0 0 24 24"
                          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isSelected ? "rotate-90" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>

                      {isSelected && (
                        <form onSubmit={handlePasswordSubmit} className="mt-2 ml-14 space-y-3 animate-in slide-in-from-top-1 fade-in duration-200">
                          <div className="relative">
                            <svg
                              viewBox="0 0 24 24"
                              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Enter dairy password"
                              autoFocus
                              className="h-10 w-full rounded-lg border border-border bg-background/80 pl-9 pr-3 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                            />
                          </div>

                          {error && (
                            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                              {error}
                            </p>
                          )}

                          <Button
                            type="submit"
                            disabled={submitting}
                            className="h-9 w-full rounded-lg bg-slate-900 text-sm font-medium text-white transition-all duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                          >
                            {submitting ? "Verifying…" : "Continue"}
                          </Button>
                        </form>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </>
      )}
    </section>
  )
}
