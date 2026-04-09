'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Building2,
    Receipt,
    Users,
    FileText,
    LogOut,
} from 'lucide-react';
import { LogoutConfirmButton } from '@/components/dashboard/shared/logout-confirm-button'

type SidebarProps = {
    userName: string
    role: string
    onLogout: () => void
    onMobileClose?: () => void
}

const navItems = [
    {
        label: 'Dashboard',
        href: '/dashboard/admin',
        icon: Home,
    },
    {
        label: 'Houses',
        href: '/dashboard/admin/houses',
        icon: Building2,
    },
    {
        label: 'Bills',
        href: '/dashboard/admin/bills',
        icon: FileText,
    },
    {
        label: 'Users',
        href: '/dashboard/admin/users',
        icon: Users,
    },
    {
        label: 'Receipts',
        href: '/dashboard/admin/recipts',
        icon: Receipt,
    },
];

export function Sidebar({
    userName,
    role,
    onLogout,
    onMobileClose,
}: SidebarProps) {
    const pathname = usePathname()

    return (
        <aside className="flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
            {/* Logo */}
            <div className="border-b border-sidebar-border px-6 py-6">
                <Link href="/dashboard/admin" className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-sidebar-primary to-sidebar-primary/80">
                        <span className="text-sm font-bold text-sidebar-primary-foreground">
                            B
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <p className="text-lg font-semibold leading-tight">Bill Manager</p>
                        <p className="text-xs text-sidebar-foreground/60">Admin</p>
                    </div>
                </Link>
            </div>

            {/* User Profile */}
            <div className="border-b border-sidebar-border px-6 py-4">
                <div className="rounded-lg bg-sidebar-accent/50 p-3">
                    <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">
                        {userName}
                    </p>
                    <p className="text-xs text-sidebar-accent-foreground/70">{role}</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                    Navigation
                </p>

                {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onMobileClose}
                            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                                }`}
                        >
                            <Icon className="h-5 w-5 shrink-0" />
                            <span>{item.label}</span>
                            {isActive && (
                                <div className="absolute inset-0 rounded-lg border border-sidebar-primary/30" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Logout Button */}
            <div className="border-t border-sidebar-border px-3 py-4">
                <LogoutConfirmButton
                    onConfirm={onLogout}
                    trigger={({ onClick }) => (
                        <button
                            type="button"
                            onClick={onClick}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                            <LogOut className="h-5 w-5" />
                            <span>Log Out</span>
                        </button>
                    )}
                />
            </div>
        </aside>
    )
}
