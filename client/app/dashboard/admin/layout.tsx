"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { clearSessionAuth, getSessionAuth, type SessionAuth } from "@/lib/auth"

type AdminLayoutProps = {
  children: React.ReactNode
}

const navLinks = [
  { label: "Dashboard", href: "/dashboard/admin" },
  { label: "Houses", href: "/dashboard/admin/houses" },
  { label: "Bills", href: "/dashboard/admin/bills" },
  { label: "Users", href: "/dashboard/admin/users" },
  { label: "Recipts", href: "/dashboard/admin/recipts" },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [ready, setReady] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const session = getSessionAuth()

    if (!session || session.role !== "admin") {
      router.replace("/")
      return
    }

    setAuth(session)
    setReady(true)
  }, [router])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const todayText = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    []
  )

  function logout() {
    clearSessionAuth()
    router.replace("/")
  }

  if (!ready || !auth) {
    return <main className="min-h-svh bg-slate-100" />
  }

  const sidebarContent = (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
          B
        </span>
        <div>
          <p className="text-lg font-semibold leading-none text-slate-900">Bill Manager</p>
          <p className="mt-1 text-xs text-slate-500">Admin Console</p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl bg-slate-50 px-3 py-3">
        <p className="truncate text-sm font-semibold text-slate-900">{auth.profile}</p>
        <p className="text-xs text-slate-500">Project Manager</p>
      </div>

      <p className="px-2 text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
        Navigation
      </p>
      <nav className="mt-3 space-y-1">
        {navLinks.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
              pathname === item.href
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  )

  return (
    <main className="min-h-svh bg-slate-100">
      <div className="min-h-svh lg:flex lg:w-full">
        <aside className="hidden border-r border-slate-200 bg-white px-4 py-6 text-slate-900 lg:block lg:w-[20%]">
          {sidebarContent}
        </aside>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 animate-fade-in bg-slate-900/45 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <aside
              className="h-full w-72 animate-slide-in-left bg-white px-4 py-6 text-slate-900 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              {sidebarContent}
            </aside>
          </div>
        ) : null}

        <section className="w-full bg-slate-100 lg:w-[80%]">
          <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M3 12h18" />
                  <path d="M3 18h18" />
                </svg>
              </button>

              <span className="truncate text-xs text-slate-500 sm:text-sm">{todayText}</span>

              <Button
                type="button"
                className="rounded-xl border-red-600! bg-red-600! text-white! hover:bg-red-700!"
                onClick={logout}
              >
                Log Out
              </Button>
            </div>

            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-slate-500"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                placeholder="Search projects"
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          </header>

          <div className="px-4 py-5 sm:px-6 sm:py-6">{children}</div>
        </section>
      </div>
    </main>
  )
}