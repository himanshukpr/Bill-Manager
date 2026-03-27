"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { resolveProfile, saveSessionAuth } from "@/lib/auth"

export function LoginForm() {
  const router = useRouter()
  const [profile, setProfile] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const resolvedProfile = resolveProfile(profile)
  const userId = resolvedProfile?.userId ?? "-"

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!resolvedProfile) {
      setErrorMessage("Enter a valid profile: Admin, Supplier, or Member.")
      return
    }

    if (!password.trim()) {
      setErrorMessage("Please enter password.")
      return
    }

    setErrorMessage("")

    saveSessionAuth({
      role: resolvedProfile.role,
      profile: profile.trim(),
      userId: resolvedProfile.userId,
      loginAt: new Date().toISOString(),
    })

    router.push(resolvedProfile.destination)
  }

  return (
    <section className="rounded-3xl border border-white/70 bg-white/95 p-7 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-sm sm:p-9">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-10 place-content-center rounded-2xl bg-slate-900 text-white">
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
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
            Bill Manager
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Account Login</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Profile</span>
          <input
            value={profile}
            onChange={(event) => setProfile(event.target.value)}
            placeholder="Admin, Supplier, Member"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">User ID</span>
          <input
            readOnly
            value={userId}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <Button
          type="submit"
          className="mt-2 h-11 w-full rounded-xl bg-slate-900 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign In
        </Button>

        {errorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <p className="text-center text-xs text-slate-500">
          Admin opens admin dashboard. Supplier or Member opens period page.
        </p>
      </form>
    </section>
  )
}
