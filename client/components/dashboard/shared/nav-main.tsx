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
import { ensurePlanValid } from "@/lib/auth"

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

    function handleNavClick(e: React.MouseEvent, url: string) {
        // Block navigation until the plan is validated; expired dairies are
        // redirected by ensurePlanValid itself.
        e.preventDefault()
        void (async () => {
            if (!(await ensurePlanValid())) return
            if (isMobile) {
                setOpenMobile(false)
            }
            router.push(url)
        })()
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
                                        onClick={(e) => handleNavClick(e, item.url)}
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
