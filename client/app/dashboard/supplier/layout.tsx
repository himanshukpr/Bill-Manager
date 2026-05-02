'use client'

import { useMemo } from 'react'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { clearSessionAuth, type SessionAuth } from '@/lib/auth'
import { SupplierSidebar } from '@/components/dashboard/supplier/app-sidebar'
import { SiteHeader } from '@/components/dashboard/admin/site-header'
import { useAuthGuard } from '@/hooks/use-auth-guard'

type SupplierLayoutProps = { children: React.ReactNode }

export default function SupplierLayout({ children }: SupplierLayoutProps) {
  const { auth, ready } = useAuthGuard('supplier')

  const todayText = useMemo(() =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()), [])
  const todayShortText = useMemo(() =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()), [])

  function logout() { clearSessionAuth(); window.location.replace('/') }

  if (!ready || !auth) return <div className="min-h-screen bg-background" />

  return (
    <SidebarProvider style={{ '--sidebar-width': 'calc(var(--spacing) * 65)', '--header-height': 'calc(var(--spacing) * 13)' } as React.CSSProperties}>
      <SupplierSidebar variant="inset" userName={auth.username} onLogout={logout} />
      <SidebarInset>
        <SiteHeader
          title="Supplier Panel"
          // hide global today date for supplier area so page-level selected date is single source
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
