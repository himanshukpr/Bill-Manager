"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { clearSessionAuth, getSessionAuth, type SessionAuth } from "@/lib/auth"

const supplierTasks = [
    "Review pending vendor bill submissions.",
    "Upload invoice documents for today deliveries.",
    "Confirm payment status updates before cut-off.",
]

export default function SupplierDashboardPage() {
    const router = useRouter()
    const [auth, setAuth] = useState<SessionAuth | null>(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const session = getSessionAuth()

        if (!session || session.role !== "supplier") {
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
        return <main className="min-h-svh bg-slate-50 dark:bg-slate-950" />
    }

    return (
        <main className="min-h-svh bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:px-10">
            <div className="mx-auto w-full max-w-5xl space-y-6">
                <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                Supplier Workspace
                            </p>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                Welcome, {auth.profile}
                            </h1>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Supplier ID: {auth.userId}</p>
                        </div>
                        <Button type="button" variant="outline" className="rounded-xl" onClick={logout}>
                            Log Out
                        </Button>
                    </div>
                </header>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Today Checklist</h2>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                        {supplierTasks.map((task) => (
                            <li key={task}>{task}</li>
                        ))}
                    </ul>
                </section>
            </div>
        </main>
    )
}
