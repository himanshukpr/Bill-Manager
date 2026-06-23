"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { apiGetDairy, apiDairyLogin, getDairySession, type DairyInfo } from "@/lib/auth"

type Props = { dairyId: number }

export function DairyAuthForm({ dairyId }: Props) {
  const router = useRouter()
  const [dairy, setDairy] = useState<DairyInfo | null>(null)
  const [dairyLoading, setDairyLoading] = useState(true)
  const [dairyNotFound, setDairyNotFound] = useState(false)
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const existing = getDairySession()
    if (existing?.dairyId === dairyId) {
      router.replace(`/dairy/${dairyId}/users`)
    }
  }, [router, dairyId])

  useEffect(() => {
    apiGetDairy(dairyId)
      .then((d) => setDairy(d))
      .catch(() => setDairyNotFound(true))
      .finally(() => setDairyLoading(false))
  }, [dairyId])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    if (!password.trim()) {
      setErrorMessage("Please enter the dairy password.")
      return
    }

    setErrorMessage("")
    setIsSubmitting(true)

    try {
      await apiDairyLogin(dairy!.email, password)
      router.push(`/dairy/${dairyId}/users`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid password. Please try again."
      setErrorMessage(msg)
      setIsSubmitting(false)
    }
  }

  if (dairyLoading) {
    return (
      <section className="rounded-3xl border border-border/70 bg-card/90 p-7 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.22)] backdrop-blur-sm transition-colors duration-300 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-[0_30px_80px_-36px_rgba(0,0,0,0.7)] sm:p-9">
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading dairy…
        </div>
      </section>
    )
  }

  if (dairyNotFound) {
    return (
      <section className="rounded-3xl border border-border/70 bg-card/90 p-7 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.22)] backdrop-blur-sm transition-colors duration-300 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-[0_30px_80px_-36px_rgba(0,0,0,0.7)] sm:p-9">
        <div className="text-center py-12">
          <p className="text-base font-semibold text-destructive">Dairy not found</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link href="/" className="font-semibold text-slate-900 hover:underline dark:text-slate-100">
              Back to dairy selection
            </Link>
          </p>
        </div>
      </section>
    )
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400">
            Authenticate Dairy
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{dairy!.name}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Dairy Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter dairy password"
            autoFocus
            className="h-12 w-full rounded-xl border border-border bg-background/80 px-3 text-base text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
          />
        </label>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-12 w-full rounded-xl bg-slate-900 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {isSubmitting ? "Verifying…" : "Continue"}
        </Button>

        {errorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          <Link href="/" className="font-semibold text-slate-900 hover:underline dark:text-slate-100">
            ← Choose a different dairy
          </Link>
        </p>
      </form>
    </section>
  )
}
