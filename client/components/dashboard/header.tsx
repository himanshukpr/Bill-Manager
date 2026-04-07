'use client'

import { Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { LogoutConfirmButton } from '@/components/dashboard/shared/logout-confirm-button'

type HeaderProps = {
    userName: string
    todayText: string
    onMenuClick: () => void
    onLogout: () => void
    searchPlaceholder?: string
}

export function Header({
    userName,
    todayText,
    onMenuClick,
    onLogout,
    searchPlaceholder = 'Search...',
}: HeaderProps) {
    const { theme, resolvedTheme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const toggleTheme = () => {
        const currentResolved = resolvedTheme ?? 'light'
        setTheme(currentResolved === 'dark' ? 'light' : 'dark')
    }

    const effectiveTheme = theme === 'system' ? resolvedTheme : theme

    return (
        <header className="border-b border-border bg-card sticky top-0 z-40">
            <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
                {/* Top Row */}
                <div className="flex items-center justify-between gap-3">
                    {/* Mobile Menu */}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onMenuClick}
                        className="lg:hidden"
                        aria-label="Open menu"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>

                    {/* Date/Title */}
                    <p className="text-xs text-muted-foreground sm:text-sm font-medium truncate">
                        {todayText}
                    </p>

                    {/* Theme Toggle and Logout */}
                    <div className="flex items-center gap-2">
                        {mounted && (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={toggleTheme}
                                aria-label={`Change theme (current: ${theme ?? 'system'})`}
                                title={`Theme: ${theme ?? 'system'}`}
                                className="rounded-lg"
                            >
                                {effectiveTheme === 'dark' ? (
                                    <Sun className="h-5 w-5 text-amber-500" />
                                ) : (
                                    <Moon className="h-5 w-5 text-neutral-700" />
                                )}
                            </Button>
                        )}
                        <LogoutConfirmButton
                            onConfirm={onLogout}
                            trigger={({ onClick }) => (
                                <Button
                                    onClick={onClick}
                                    className="rounded-lg bg-destructive text-white hover:bg-destructive/90"
                                    size="sm"
                                >
                                    Log Out
                                </Button>
                            )}
                        />
                    </div>
                </div>

                {/* Search Bar */}
                <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5">
                    <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                </div>
            </div>
        </header>
    )
}
