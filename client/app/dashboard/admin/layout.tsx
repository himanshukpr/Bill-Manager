"use client"

import { useEffect, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"

import { AppSidebar } from "@/components/dashboard/admin/app-sidebar"
import { SiteHeader } from "@/components/dashboard/admin/site-header"
import { AdminAlertsPanel } from "@/components/dashboard/admin/admin-alerts-panel"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { clearSessionAuth, clearAllAuth, getSessionAuth, getDairyIdFromCookie, type SessionAuth } from "@/lib/auth"
import { useAuthGuard } from "@/hooks/use-auth-guard"

type AdminLayoutProps = {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { auth, ready } = useAuthGuard("admin")
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (window.location.search.includes("plan-expired=1")) return
    const session = getSessionAuth()
    if (session?.planExpiry) {
      const expiryDate = new Date(session.planExpiry)
      if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
        clearAllAuth()
        router.replace("/?plan-expired=1")
      }
    }
  }, [pathname, router])

  const pageTitle = useMemo(() => {
    const titleMap: Record<string, string> = {
      "/dashboard/admin": "Dashboard",
      "/dashboard/admin/direct-entry": "Direct Entry",
      "/dashboard/admin/houses": "Houses",
      "/dashboard/admin/house-config": "House Config",
      "/dashboard/admin/daily-alerts": "Daily Alerts",
      "/dashboard/admin/bills": "Bills",
      "/dashboard/admin/recipts": "Receipts",
      "/dashboard/admin/delivery-analysis": "Delivery Analysis",
      "/dashboard/admin/rates": "Rates",
      "/dashboard/admin/users": "Users",
    }
    return titleMap[pathname] || "Dashboard"
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
    const dairyId = getDairyIdFromCookie()
    window.location.replace(dairyId ? `/dairy/${dairyId}/users` : "/")
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
          title={pageTitle}
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
