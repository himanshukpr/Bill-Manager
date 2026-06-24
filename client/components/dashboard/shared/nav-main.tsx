"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar"
import { clearAllAuth, getSessionAuth } from "@/lib/auth"

export function NavMain({
    items,
}: {
    items: {
        title: string
        url: string
        icon?: React.ComponentType<{ className?: string }>
    }[]
}) {
    const pathname = usePathname()
    const router = useRouter()
    const { isMobile, setOpenMobile } = useSidebar()

    function checkPlanExpiry(): boolean {
        const session = getSessionAuth()
        if (session?.planExpiry) {
            const expiryDate = new Date(session.planExpiry)
            if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
                clearAllAuth()
                router.replace("/?plan-expired=1")
                return false
            }
        }
        return true
    }

    return (
        <SidebarGroup>
            <SidebarGroupContent>
                <SidebarMenu>
                    {items.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname === item.url

                        return (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                                    <Link
                                        href={item.url}
                                        onClick={(e) => {
                                            if (!checkPlanExpiry()) {
                                                e.preventDefault()
                                                return
                                            }
                                            if (isMobile) {
                                                setOpenMobile(false)
                                            }
                                        }}
                                    >
                                        {Icon && <Icon className="h-4 w-4" />}
                                        <span>{item.title}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}
