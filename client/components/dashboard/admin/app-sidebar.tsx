"use client"

import * as React from "react"
import { Bell, Building2, FileText, Home, Receipt, Settings2, Tag, Users } from "lucide-react"

import { NavMain } from "@/components/dashboard/shared/nav-main"
import { NavUser } from "@/components/dashboard/shared/nav-user"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"

interface AppSidebarProps {
    variant?: "sidebar" | "floating" | "inset"
    userName?: string
    userRole?: string
    onLogout?: () => void
}

const navItems = [
    {
        title: "Dashboard",
        url: "/dashboard/admin",
        icon: Home,
    },
    {
        title: "Houses",
        url: "/dashboard/admin/houses",
        icon: Building2,
    },
    {
        title: "House Config",
        url: "/dashboard/admin/house-config",
        icon: Settings2,
    },
    {
        title: "Daily Alerts",
        url: "/dashboard/admin/daily-alerts",
        icon: Bell,
    },
    {
        title: "Bills",
        url: "/dashboard/admin/bills",
        icon: FileText,
    },
    {
        title: "Users",
        url: "/dashboard/admin/users",
        icon: Users,
    },
    {
        title: "Rates",
        url: "/dashboard/admin/rates",
        icon: Tag,
    },
    {
        title: "Receipts",
        url: "/dashboard/admin/recipts",
        icon: Receipt,
    },
]

export function AppSidebar({
    variant = "inset",
    userName = "Admin User",
    userRole = "Administrator",
    onLogout,
}: AppSidebarProps) {
    return (
        <Sidebar variant={variant}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <a href="/dashboard/admin" className="cursor-pointer">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-violet-600">
                                    <span className="text-sm font-bold text-white">B</span>
                                </div>
                                <div className="flex flex-col gap-0.5 leading-none">
                                    <span className="font-semibold">Bill Manager</span>
                                    <span className="text-xs text-muted-foreground">Admin</span>
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
                <NavUser
                    user={{
                        name: userName,
                        email: userRole,
                        avatar: "",
                    }}
                    onLogout={onLogout}
                />
            </SidebarFooter>
        </Sidebar>
    )
}
