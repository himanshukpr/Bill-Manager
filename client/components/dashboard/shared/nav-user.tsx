"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { EllipsisVerticalIcon, KeyRound, LogOut } from "lucide-react"
import { LogoutConfirmButton } from "@/components/dashboard/shared/logout-confirm-button"
import { getSessionAuth } from "@/lib/auth"
import { toast } from "sonner"
import { dairiesApi } from "@/lib/api"

export function NavUser({
    user,
    onLogout,
}: {
    user: {
        name: string
        email: string
        avatar: string
    }
    onLogout?: () => void
}) {
    const { isMobile } = useSidebar()
    const [pwdDialogOpen, setPwdDialogOpen] = useState(false)
    const [newPassword, setNewPassword] = useState("")
    const [saving, setSaving] = useState(false)
    const session = getSessionAuth()

    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)
    }

    const handleChangePassword = async () => {
        if (!session?.dairyId) return
        setSaving(true)
        try {
            await dairiesApi.resetPassword(session.dairyId, newPassword)
            toast.success("Dairy password updated - you'll need to re-login with the new password")
            setPwdDialogOpen(false)
            setNewPassword("")
        } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e))
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                                size="lg"
                                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                            >
                                <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarImage src={user.avatar} alt={user.name} />
                                    <AvatarFallback className="rounded-lg bg-linear-to-br from-violet-500 to-violet-600 text-white">
                                        {getInitials(user.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{user.name}</span>
                                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                                </div>
                                <EllipsisVerticalIcon className="ml-auto size-4" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                            side={isMobile ? "bottom" : "right"}
                            align="end"
                            sideOffset={4}
                        >
                            <DropdownMenuLabel className="p-0 font-normal">
                                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={user.avatar} alt={user.name} />
                                        <AvatarFallback className="rounded-lg bg-linear-to-br from-violet-500 to-violet-600 text-white">
                                            {getInitials(user.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-medium">{user.name}</span>
                                        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                                    </div>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onSelect={(e) => {
                                    e.preventDefault()
                                    setPwdDialogOpen(true)
                                }}
                                className="cursor-pointer"
                            >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Change Password
                            </DropdownMenuItem>
                            {onLogout && (
                                <DropdownMenuItem asChild className="p-0 text-red-600 focus:bg-transparent focus:text-inherit">
                                    <LogoutConfirmButton
                                        onConfirm={onLogout}
                                        trigger={({ onClick }) => (
                                            <button
                                                type="button"
                                                onClick={onClick}
                                                className="flex w-full items-center px-2 py-1.5 text-left text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/30 dark:focus:text-red-400"
                                            >
                                                <LogOut className="mr-2 h-4 w-4" />
                                                Log out
                                            </button>
                                        )}
                                    />
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>

            <Dialog open={pwdDialogOpen} onOpenChange={open => { if (!open) setNewPassword(''); setPwdDialogOpen(open); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Dairy Master Password</DialogTitle>
                        <DialogDescription>Enter a new password for the dairy master account. You'll need to re-login with the new password.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>New Password</Label>
                            <Input type="password" placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPwdDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleChangePassword} disabled={saving || !newPassword.trim()}>
                            {saving ? 'Saving...' : 'Change Password'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}