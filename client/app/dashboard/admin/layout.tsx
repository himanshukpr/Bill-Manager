"use client"

import { useMemo } from "react"

import { AppSidebar } from "@/components/dashboard/admin/app-sidebar"
import { SiteHeader } from "@/components/dashboard/admin/site-header"
import { AdminAlertsPanel } from "@/components/dashboard/admin/admin-alerts-panel"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { clearSessionAuth, getSessionAuth, type SessionAuth } from "@/lib/auth"
import { useAuthGuard } from "@/hooks/use-auth-guard"

type AdminLayoutProps = {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { auth, ready } = useAuthGuard("admin")

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
    window.location.replace("/")
  }

  if (!ready || !auth) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "calc(var(--spacing) * 72)",
        "--header-height": "calc(var(--spacing) * 13)",
      } as React.CSSProperties}
    >
      <AppSidebar
        variant="inset"
        userName={auth.username}
        userRole="Admin"
        onLogout={logout}
      />
      <SidebarInset>
        <SiteHeader
          title="Dashboard"
          todayText={todayText}
          todayShortText={todayShortText}
          onLogout={logout}
          actions={<AdminAlertsPanel />}
        />
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
