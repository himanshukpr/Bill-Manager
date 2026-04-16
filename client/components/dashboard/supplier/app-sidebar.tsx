"use client"

import * as React from "react"
import { Home, List, Bell } from "lucide-react"
import { NavMain } from "@/components/dashboard/shared/nav-main"
import { NavUser } from "@/components/dashboard/shared/nav-user"
import {
  Sidebar, SidebarContent, SidebarFooter,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar"

interface SupplierSidebarProps {
  variant?: "sidebar" | "floating" | "inset"
  userName?: string
  onLogout?: () => void
}

const navItems = [
  { title: "Dashboard", url: "/dashboard/supplier", icon: Home },
  { title: "My Houses", url: "/dashboard/supplier/houses", icon: List },
]

export function SupplierSidebar({ variant = "inset", userName = "Supplier", onLogout }: SupplierSidebarProps) {
  return (
    <Sidebar variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard/supplier">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500 to-emerald-600">
                  <span className="text-sm font-bold text-white">B</span>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Bill Manager</span>
                  <span className="text-xs text-muted-foreground">Supplier</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: userName, email: "Supplier", avatar: "" }} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
