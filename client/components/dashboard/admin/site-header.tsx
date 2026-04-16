'use client'

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { LogoutConfirmButton } from "@/components/dashboard/shared/logout-confirm-button"

interface SiteHeaderProps {
    title?: string
    todayText?: string
    todayShortText?: string
    onLogout?: () => void
    actions?: React.ReactNode
}

export function SiteHeader({ title = "Dashboard", todayText, todayShortText, onLogout, actions }: SiteHeaderProps) {
    const { theme, resolvedTheme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const toggleTheme = () => {
        const currentResolved = resolvedTheme ?? "light"
        setTheme(currentResolved === "dark" ? "light" : "dark")
    }

    const effectiveTheme = theme === "system" ? resolvedTheme : theme

    return (
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b transition-[width,height] ease-linear sm:h-(--header-height) group-has-data-[collapsible=icon]/sidebar-wrapper:h-16 sm:group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
            <div className="flex w-full min-w-0 items-center gap-2 px-4 sm:px-4 lg:gap-2 lg:px-6">
            <SidebarTrigger className="-ml-1 h-11 w-11" />
                <span
                    aria-hidden="true"
                    className="mx-1.5 hidden h-8 w-px self-center bg-border sm:block"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    <h1 className="truncate text-xl font-semibold sm:text-base">{title}</h1>
                    {todayText && (
                        <>
                            <p className="truncate text-base leading-tight text-muted-foreground sm:hidden">
                                {todayShortText ?? todayText}
                            </p>
                            <p className="hidden truncate text-xs text-muted-foreground sm:block">{todayText}</p>
                        </>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 px-4 sm:gap-2 sm:px-4 lg:px-6">
                {actions}
                {mounted && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleTheme}
                        className="h-11 w-11 sm:h-9 sm:w-9"
                        title={`Theme: ${theme ?? "system"}`}
                        aria-label={`Change theme (current: ${theme ?? "system"})`}
                    >
                        {effectiveTheme === "dark" ? (
                            <Sun className="h-4 w-4 text-amber-500" />
                        ) : (
                            <Moon className="h-4 w-4 text-neutral-700" />
                        )}
                    </Button>
                )}
            </div>
        </header>
    )
}
