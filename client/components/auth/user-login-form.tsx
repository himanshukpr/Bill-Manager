"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { ProfileSwitcherList } from "@/components/auth/profile-switcher"
import { apiLogin, apiGetDairy, dashboardPath, getSessionAuth, syncDairySessionCookies, type DairyInfo } from "@/lib/auth"

type Props = { dairyId: number }

export function UserLoginForm({ dairyId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAddAccount = searchParams.get("add-account") === "1"
  const [dairy, setDairy] = useState<DairyInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Snapshot of a session from ANOTHER dairy, if one is active. A foreign
  // session must never auto-redirect this form away (that caused the stuck
  // "Loading…" screen); instead we show a notice below.
  const [activeSession] = useState<{ username: string; dairyId: number } | null>(() => {
    const userSession = getSessionAuth()
    return userSession?.token && userSession.dairyId !== dairyId
      ? { username: userSession.username, dairyId: userSession.dairyId }
      : null
  })

  useEffect(() => {
    // Restore dairy cookies from the persisted dairy session so this page and
    // middleware agree about which dairy was authenticated.
    syncDairySessionCookies()
    const userSession = getSessionAuth()
    // Only auto-continue when the signed-in user already belongs to THIS dairy.
    if (userSession?.token && !isAddAccount && userSession.dairyId === dairyId) {
      router.replace(dashboardPath(userSession.role))
      return
    }
    apiGetDairy(dairyId)
      .then((d) => { setDairy(d); setReady(true) })
      .catch(() => router.replace("/"))
  }, [router, dairyId, isAddAccount])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const trimmed = username.trim()
    if (!trimmed) {
      setErrorMessage("Please enter your username.")
      return
    }
    if (!password.trim()) {
      setErrorMessage("Please enter your password.")
      return
    }

    setErrorMessage("")
    setIsSubmitting(true)

    try {
      const session = await apiLogin(trimmed, password, dairyId)
      router.replace(dashboardPath(session.role))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again."
      setErrorMessage(msg)
      setIsSubmitting(false)
    }
  }

  if (!ready || !dairy) {
    return (
      <section className="rounded-3xl border border-border/70 bg-card/90 p-7 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.22)] backdrop-blur-sm transition-colors duration-300 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-[0_30px_80px_-36px_rgba(0,0,0,0.7)] sm:p-9">
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading…
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
            <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" />
            <path d="M9 8h6" />
            <path d="M9 11h6" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400">
            Dairy Vyapar
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{dairy!.name}</h1>
        </div>
      </div>

      {activeSession && !isAddAccount && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            You&apos;re signed in as {activeSession.username} on another dairy.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Sign in below to switch to this dairy. Your other account stays saved on this device.
          </p>
        </div>
      )}

      {isAddAccount && (
        <div className="mb-6 rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Add another account
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your current account stays signed in while you sign in here.
          </p>
          <div className="mt-3">
            <ProfileSwitcherList />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Username</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Enter your username"
            className="h-12 w-full rounded-xl border border-border bg-background/80 px-3 text-base text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter your password"
            className="h-12 w-full rounded-xl border border-border bg-background/80 px-3 text-base text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
          />
        </label>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-12 w-full rounded-xl bg-slate-900 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {isSubmitting ? "Signing In…" : "Sign In"}
        </Button>

        {errorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href={`/dairy/${dairyId}/register${isAddAccount ? "?add-account=1" : ""}`} className="font-semibold text-slate-900 hover:underline dark:text-slate-100">
            Register New User
          </Link>
        </p>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          <Link href="/" className="font-semibold text-slate-900 hover:underline dark:text-slate-100">
            ← Choose a different dairy
          </Link>
        </p>
      </form>
    </section>
  )
}
