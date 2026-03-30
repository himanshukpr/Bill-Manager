"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { AppSidebar } from "@/components/dashboard/admin/app-sidebar"
import { SiteHeader } from "@/components/dashboard/admin/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { clearSessionAuth, getSessionAuth, type SessionAuth } from "@/lib/auth"

type AdminLayoutProps = {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
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

  const todayShortText = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
    []
  )

  function logout() {
    clearSessionAuth()
    router.replace("/")
  }

  if (!ready || !auth) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "calc(var(--spacing) * 72)",
        "--header-height": "calc(var(--spacing) * 12)",
      } as React.CSSProperties}
    >
      <AppSidebar
        variant="inset"
        userName={auth.profile}
        userRole="Admin"
        onLogout={logout}
      />
      <SidebarInset>
        <SiteHeader
          title="Dashboard"
          todayText={todayText}
          todayShortText={todayShortText}
          onLogout={logout}
        />
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}