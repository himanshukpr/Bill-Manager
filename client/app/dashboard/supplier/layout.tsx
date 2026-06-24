'use client'

import { useMemo, useState, useEffect } from 'react'
import { ArrowLeftCircle } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { clearAllAuth, clearSessionAuth, saveSessionAuth, restoreAdminSession, removeAdminSession, dashboardPath, getDairyIdFromCookie, getSessionAuth, type SessionAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { SupplierSidebar } from '@/components/dashboard/supplier/app-sidebar'
import { SiteHeader } from '@/components/dashboard/admin/site-header'
import { useAuthGuard } from '@/hooks/use-auth-guard'

type SupplierLayoutProps = { children: React.ReactNode }

export default function SupplierLayout({ children }: SupplierLayoutProps) {
  const { auth, ready } = useAuthGuard('supplier')
  const [showBanner, setShowBanner] = useState(false)
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

  useEffect(() => {
    if (auth?.impersonator) setShowBanner(true)
    else setShowBanner(false)
  }, [auth?.impersonator])

  const todayText = useMemo(() =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()), [])
  const todayShortText = useMemo(() =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()), [])

  function logout() { 
    clearSessionAuth()
    const dairyId = getDairyIdFromCookie()
    window.location.replace(dairyId ? `/dairy/${dairyId}/users` : "/")
  }

  function switchBack() {
    const adminSession = restoreAdminSession('adminSession')
    if (adminSession) {
      saveSessionAuth(adminSession)
      removeAdminSession('adminSession')
      window.location.href = dashboardPath('admin')
    } else {
      clearSessionAuth()
      const dairyId = getDairyIdFromCookie()
      window.location.replace(dairyId ? `/dairy/${dairyId}/users` : "/")
    }
  }

  if (!ready || !auth) return <div className="min-h-screen bg-background" />

  return (
    <SidebarProvider style={{ '--sidebar-width': 'calc(var(--spacing) * 65)', '--header-height': 'calc(var(--spacing) * 13)' } as React.CSSProperties}>
      <SupplierSidebar variant="inset" userName={auth.username} onLogout={logout} />
      <SidebarInset>
        {showBanner && (
          <div className="flex items-center justify-between gap-3 bg-purple-600 px-4 py-2 text-sm text-white">
            <span>
              Impersonating <strong>{auth.username}</strong>
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={switchBack}
            >
              <ArrowLeftCircle className="h-3.5 w-3.5" />
              Switch Back
            </Button>
          </div>
        )}
        <SiteHeader
          title="Supplier Panel"
          showDate={false}
          onLogout={logout}
        />
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
