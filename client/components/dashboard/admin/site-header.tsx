'use client'

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

interface SiteHeaderProps {
    title?: string
    todayText?: string
    todayShortText?: string
    onLogout?: () => void
}

export function SiteHeader({ title = "Dashboard", todayText, todayShortText, onLogout }: SiteHeaderProps) {
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
        <header className="flex h-(--header-height) shrink-0 items-center justify-between gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
            <div className="flex w-full min-w-0 items-center gap-1 px-3 sm:px-4 lg:gap-2 lg:px-6">
                <SidebarTrigger className="-ml-1" />
                <span
                    aria-hidden="true"
                    className="mx-1.5 hidden h-8 w-px self-center bg-border sm:block"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
                    {todayText && (
                        <>
                            <p className="truncate text-[11px] leading-tight text-muted-foreground sm:hidden">
                                {todayShortText ?? todayText}
                            </p>
                            <p className="hidden truncate text-xs text-muted-foreground sm:block">{todayText}</p>
                        </>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 px-3 sm:gap-2 sm:px-4 lg:px-6">
                {mounted && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleTheme}
                        className="h-8 w-8 sm:h-9 sm:w-9"
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
                {onLogout && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onLogout}
                        className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 sm:h-9 sm:px-3 sm:text-sm"
                    >
                        Logout
                    </Button>
                )}
            </div>
        </header>
    )
}
