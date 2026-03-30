"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getSessionAuth, saveSessionAuth } from "@/lib/auth"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const session = getSessionAuth()

    if (!session) {
      return
    }

    if (session.role === "admin") {
      router.replace("/dashboard/admin")
      return
    }

    if (session.role === "supplier") {
      router.replace("/dashboard/supplier")
      return
    }

    router.replace("/dashboard/member")
  }, [router])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    const trimmedEmail = email.trim()

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setErrorMessage("Please enter a valid email.")
      return
    }

    if (!password.trim()) {
      setErrorMessage("Please enter password.")
      return
    }

    setErrorMessage("")
    setIsSubmitting(true)

    saveSessionAuth({
      role: "admin",
      profile: trimmedEmail,
      userId: "",
      loginAt: new Date().toISOString(),
    })

    router.replace("/dashboard/admin")
  }

  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white/95 p-7 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-sm transition-colors duration-300 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-[0_30px_80px_-36px_rgba(0,0,0,0.7)] sm:p-9">
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
            Bill Manager
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Account Login</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            placeholder="name@example.com"
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
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
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
          />
        </label>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-12 w-full rounded-xl bg-slate-900 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {isSubmitting ? "Signing In..." : "Sign In"}
        </Button>

        {errorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Sign in opens the admin dashboard.
        </p>
      </form>
    </section>
  )
}
