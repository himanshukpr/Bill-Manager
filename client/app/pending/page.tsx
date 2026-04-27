"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  clearSessionAuth,
  getSessionAuth,
  saveSessionAuth,
  dashboardPath,
  type SessionAuth,
  type AppRole,
} from "@/lib/auth"
import { fetchApi } from "@/lib/api-base"
import { Button } from "@/components/ui/button"

export default function PendingVerificationPage() {
  const router = useRouter()
  const [session, setSession] = useState<SessionAuth | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState("")

  useEffect(() => {
    const s = getSessionAuth()
    if (!s?.token) {
      router.replace("/")
      return
    }
    // If somehow already verified, skip this page
    if (s.isVerified) {
      router.replace(dashboardPath(s.role))
      return
    }
    setSession(s)
  }, [router])

  async function handleCheckAgain() {
    if (!session?.token || checking) return
    setChecking(true)
    setCheckMsg("")

    try {
      const res = await fetchApi('/auth/me', {
        headers: { Authorization: `Bearer ${session.token}` },
      })

      if (!res.ok) {
        setCheckMsg("Could not reach the server. Try again.")
        setChecking(false)
        return
      }

      const user = await res.json() as {
        uuid: string
        username: string
        email: string
        role: AppRole
        isVerified: boolean
      }

      if (user.isVerified) {
        // Update stored session so cookies reflect new state
        const updated: SessionAuth = {
          ...session,
          isVerified: true,
          role: user.role,
        }
        saveSessionAuth(updated)
        // Middleware will now allow access — navigate to user's dashboard
        router.replace(dashboardPath(user.role))
      } else {
        setCheckMsg("Your account is still pending. Please wait for admin approval.")
        setChecking(false)
      }
    } catch {
      setCheckMsg("Network error. Please check your connection.")
      setChecking(false)
    }
  }

  function handleLogout() {
    clearSessionAuth()
    router.replace("/")
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-[radial-gradient(circle_at_top,#f7fafc_0%,#eef2f7_45%,#e8edf5_100%)] px-4 py-10 dark:bg-[radial-gradient(circle_at_top,#111827_0%,#0f172a_45%,#020617_100%)]">
      <div className="mx-auto w-full max-w-md">
        <section className="rounded-3xl border border-border/70 bg-card/90 p-8 text-center shadow-[0_30px_80px_-36px_rgba(15,23,42,0.22)] backdrop-blur-sm transition-colors duration-300 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-[0_30px_80px_-36px_rgba(0,0,0,0.7)] sm:p-10">

          {/* Icon */}
          <div className="mx-auto mb-6 grid size-16 place-content-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <svg
              viewBox="0 0 24 24"
              className="size-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Account Pending Verification
          </h1>

          {/* Detail */}
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Hi{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {session?.username ?? "there"}
            </span>
            , your account{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {session?.email}
            </span>{" "}
            is awaiting administrator approval.
          </p>

          <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
            You&apos;ll be able to access your dashboard once an admin verifies your account.
          </p>

          {/* Status badge */}
          <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400">
            <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
            Awaiting verification
          </div>

          {/* Feedback message */}
          {checkMsg ? (
            <p className="mt-4 rounded-xl border border-border/70 bg-muted/60 px-3 py-2 text-xs text-foreground/70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              {checkMsg}
            </p>
          ) : null}

          {/* Actions */}
          <div className="mt-8 space-y-3">
            <Button
              type="button"
              onClick={handleCheckAgain}
              disabled={checking}
              className="h-11 w-full rounded-xl bg-slate-900 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {checking ? "Checking…" : "Check Again"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleLogout}
              className="h-11 w-full rounded-xl text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Sign Out
            </Button>
          </div>

        </section>
      </div>
    </main>
  )
}
