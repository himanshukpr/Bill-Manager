"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { saveSessionAuth } from "@/lib/auth"

export function SignUpForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    if (!name.trim()) {
      setErrorMessage("Please enter your name.")
      return
    }

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setErrorMessage("Please enter a valid email.")
      return
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.")
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.")
      return
    }

    setErrorMessage("")
    setIsSubmitting(true)

    // Simulating signup success and auto-login
    saveSessionAuth({
      role: "admin",
      profile: trimmedEmail,
      userId: "NEW-USER",
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6" />
            <path d="M16 11h6" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400">
            Bill Manager
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Create Account</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="John Doe"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="name@example.com"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Confirm Password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm your password"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
          />
        </label>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-11 w-full rounded-xl bg-slate-900 text-sm font-medium text-white transition-all duration-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {isSubmitting ? "Creating Account..." : "Sign Up"}
        </Button>

        {errorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/" className="font-semibold text-slate-900 hover:underline dark:text-slate-100">
            Sign In
          </Link>
        </p>
      </form>
    </section>
  )
}
