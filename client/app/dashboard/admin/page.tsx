"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/dashboard/stat-card"
import { clearSessionAuth, getSessionAuth, type SessionAuth } from "@/lib/auth"

const stats = [
  { label: "Total Bills", value: "124", hint: "+8 this week" },
  { label: "Pending Approval", value: "19", hint: "Need admin action" },
  { label: "Paid Today", value: "37", hint: "Settled by 5:00 PM" },
  { label: "Monthly Spend", value: "$8,420", hint: "4.7% lower vs last month" },
]

const recentBills = [
  { ref: "BILL-901", vendor: "Fresh Foods", amount: "$420", status: "Pending" },
  { ref: "BILL-902", vendor: "Power Utilities", amount: "$1,100", status: "Paid" },
  { ref: "BILL-903", vendor: "Office Mart", amount: "$265", status: "Pending" },
  { ref: "BILL-904", vendor: "Metro Water", amount: "$160", status: "Paid" },
]

export default function AdminDashboardPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const session = getSessionAuth()

    if (!session || session.role !== "admin") {
      router.replace("/")
      return
    }

    setAuth(session)
    setReady(true)
  }, [router])

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
    return <main className="min-h-svh bg-slate-50" />
  }

  return (
    <main className="min-h-svh bg-slate-50 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Admin Dashboard
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                Welcome, {auth.profile}
              </h1>
              <p className="mt-2 text-sm text-slate-600">{todayText}</p>
            </div>
            <Button type="button" variant="outline" className="rounded-xl" onClick={logout}>
              Log Out
            </Button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Recent Bills</h2>
            <p className="mt-1 text-sm text-slate-500">Latest invoice activities from suppliers.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-3">Reference</th>
                    <th className="py-3">Vendor</th>
                    <th className="py-3">Amount</th>
                    <th className="py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBills.map((bill) => (
                    <tr key={bill.ref} className="border-b border-slate-100 text-slate-700">
                      <td className="py-3 font-medium text-slate-900">{bill.ref}</td>
                      <td className="py-3">{bill.vendor}</td>
                      <td className="py-3">{bill.amount}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            bill.status === "Paid"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {bill.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
              <div className="mt-4 grid gap-2">
                <button className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Add New Bill
                </button>
                <button className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Approve Pending Bills
                </button>
                <button className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Export Monthly Report
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Alerts</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>3 invoices are due in the next 24 hours.</li>
                <li>2 suppliers updated payment account details.</li>
                <li>Monthly spend crossed 70% of the budget target.</li>
              </ul>
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}
