'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Search, ShieldCheck, Trash2, UserPlus, ShieldOff, Lock, SwitchCamera, KeyRound } from 'lucide-react'
import { usersApi, type User } from '@/lib/api'
import { apiImpersonate, saveSessionAuth, saveAdminSession, dashboardPath, getSessionAuth } from '@/lib/auth'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteUuid, setDeleteUuid] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [privilegeDialogOpen, setPrivilegeDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<'admin' | 'supplier'>('supplier')
  const [newUsername, setNewUsername] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [addingSaving, setAddSaving] = useState(false)
  const [roleChangingUuid, setRoleChangingUuid] = useState<string | null>(null)
  const [privilegeSaving, setPrivilegeSaving] = useState(false)
  const [permEditItems, setPermEditItems] = useState(false)
  const [permEditHouses, setPermEditHouses] = useState(false)
  const [permViewAll, setPermViewAll] = useState(false)
  const [permModifyDeliveryLogs, setPermModifyDeliveryLogs] = useState(false)
  const [resetPwdUuid, setResetPwdUuid] = useState<string | null>(null)
  const [resetPwdValue, setResetPwdValue] = useState('')
  const [resetPwdSaving, setResetPwdSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await usersApi.list(undefined, true)
      setUsers(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  async function toggleVerify(u: User) {
    try {
      await usersApi.verify(u.uuid, !u.isVerified)
      toast.success(`User ${u.isVerified ? 'unverified' : 'verified'}`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleRoleChange(u: User, role: User['role']) {
    if (role === u.role) return
    if (getSessionAuth()?.uuid === u.uuid) {
      toast.error('You cannot change your own role')
      return
    }
    setRoleChangingUuid(u.uuid)
    try {
      await usersApi.changeRole(u.uuid, role)
      toast.success(`${u.username} role changed to ${role}`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRoleChangingUuid(null)
    }
  }

  async function handleAddUser() {
    if (!newUsername || !newPassword) {
      toast.error('Username and password are required')
      return
    }
    setAddSaving(true)
    try {
      await usersApi.create({
        username: newUsername,
        password: newPassword,
        role: 'supplier',
        isVerified: true,
      })
      toast.success('User created successfully')
      setAddDialogOpen(false)
      setNewUsername('')
      setNewPassword('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setAddSaving(false)
    }
  }

  async function handleChangeRole() {
    if (!selectedUser) return
    if (getSessionAuth()?.uuid === selectedUser.uuid) {
      toast.error('You cannot change your own role')
      return
    }
    setPrivilegeSaving(true)
    try {
      await Promise.all([
        usersApi.changeRole(selectedUser.uuid, newRole),
        usersApi.updatePermissions(selectedUser.uuid, {
          canEditItems: permEditItems,
          canEditHouses: permEditHouses,
          canViewAllHouses: permViewAll,
          canModifyDeliveryLogs: permModifyDeliveryLogs,
        }),
      ])
      toast.success(`User role changed to ${newRole}`)
      setPrivilegeDialogOpen(false)
      setSelectedUser(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPrivilegeSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteUuid) return
    try {
      await usersApi.delete(deleteUuid)
      toast.success('User deleted')
      setDeleteUuid(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleResetPassword() {
    if (!resetPwdUuid || !resetPwdValue.trim()) return
    try {
      setResetPwdSaving(true)
      await usersApi.resetPassword(resetPwdUuid, resetPwdValue.trim())
      toast.success('Password reset successfully')
      setResetPwdUuid(null)
      setResetPwdValue('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setResetPwdSaving(false)
    }
  }

  async function handleImpersonate(u: User) {
    try {
      const adminSession = { ...getSessionAuth()! }
      saveAdminSession('adminSession', adminSession)
      const impersonated = await apiImpersonate(u.uuid)
      saveSessionAuth(impersonated)
      router.push(dashboardPath('supplier'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage system users and supplier accounts</p>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:items-center">
          <Button onClick={() => setAddDialogOpen(true)} className="gap-2 w-full sm:w-auto">
            <UserPlus className="h-4 w-4" /> Add User
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 flex-1 sm:flex-none justify-center">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs sm:text-sm">{users.length} total</span>
            </Badge>
            <Badge className="gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 flex-1 sm:flex-none justify-center">
              <span className="text-xs sm:text-sm">{users.filter(u => !u.isVerified).length} pending</span>
            </Badge>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by username or email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* All Users */}
          <UserSection
            title="All Users"
            users={filtered}
            onToggleVerify={toggleVerify}
            onRoleChange={handleRoleChange}
            onChangeRole={(u) => {
              setSelectedUser(u)
              setNewRole(u.role as 'admin' | 'supplier')
              setPermEditItems(u.permissions?.canEditItems ?? false)
              setPermEditHouses(u.permissions?.canEditHouses ?? false)
              setPermViewAll(u.permissions?.canViewAllHouses ?? false)
              setPermModifyDeliveryLogs(u.permissions?.canModifyDeliveryLogs ?? false)
              setPrivilegeDialogOpen(true)
            }}
            onDelete={setDeleteUuid}
            onImpersonate={handleImpersonate}
            onResetPassword={setResetPwdUuid}
          />
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md w-[90vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>Create a new user account in the system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input placeholder="Enter username" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input placeholder="Enter password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={addingSaving}>
              {addingSaving ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Privileges Dialog */}
      <Dialog open={privilegeDialogOpen} onOpenChange={setPrivilegeDialogOpen}>
        <DialogContent className="max-w-md w-[90vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>User Privileges</DialogTitle>
            <DialogDescription>Manage role and permissions for {selectedUser?.username}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Role */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'supplier')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Permissions (only for suppliers) */}
            {newRole === 'supplier' && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <Label className="text-sm font-semibold">Supplier Permissions</Label>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permEditItems}
                      onChange={(e) => setPermEditItems(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Edit Delivery History</p>
                      <p className="text-xs text-muted-foreground">Allow editing or deleting past delivery entries from the delivery history page</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permEditHouses}
                      onChange={(e) => setPermEditHouses(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Edit House Details</p>
                      <p className="text-xs text-muted-foreground">Allow editing house name, rates, and other house settings</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permViewAll}
                      onChange={(e) => setPermViewAll(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">View All Houses</p>
                      <p className="text-xs text-muted-foreground">Show all houses in the list instead of only those assigned to the supplier's route</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permModifyDeliveryLogs}
                      onChange={(e) => setPermModifyDeliveryLogs(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Modify Daily Deliveries</p>
                      <p className="text-xs text-muted-foreground">Allow editing quantities or deleting deliveries on the daily delivery screen after submission</p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPrivilegeDialogOpen(false); setSelectedUser(null); }}>Cancel</Button>
            <Button onClick={handleChangeRole} disabled={privilegeSaving}>
              {privilegeSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUuid} onOpenChange={open => !open && setDeleteUuid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this user from the system. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!resetPwdUuid} onOpenChange={open => { if (!open) { setResetPwdUuid(null); setResetPwdValue(''); } }}>
        <DialogContent className="max-w-sm w-[90vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for this user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input placeholder="Enter new password" type="password" value={resetPwdValue} onChange={e => setResetPwdValue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetPwdUuid(null); setResetPwdValue(''); }}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetPwdSaving || !resetPwdValue.trim()}>
              {resetPwdSaving ? 'Saving...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserSection({
  title, users, onToggleVerify, onRoleChange, onChangeRole, onDelete, onImpersonate, onResetPassword,
  roleChangingUuid,
}: {
  title: string
  users: User[]
  onToggleVerify: (u: User) => void
  onRoleChange?: (u: User, role: User['role']) => void
  onChangeRole: (u: User) => void
  onDelete: (uuid: string) => void
  onImpersonate?: (u: User) => void
  onResetPassword?: (uuid: string) => void
  roleChangingUuid?: string | null
}) {
  if (users.length === 0) return null
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{title}</h2>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {users.map((u, idx) => (
          <div key={u.uuid}
            className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-3.5 ${idx !== 0 ? 'border-t border-border/60' : ''} hover:bg-muted/20 transition-colors`}>
            {/* Avatar + Info */}
            <div className="flex items-start gap-3 flex-1 min-w-0 w-full sm:w-auto">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                {u.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm truncate max-w-[12rem] sm:max-w-none">{u.username}</p>
                  <Select
                    value={u.role}
                    onValueChange={(v) => onRoleChange?.(u, v as User['role'])}
                    disabled={roleChangingUuid === u.uuid || getSessionAuth()?.uuid === u.uuid}
                  >
                    <SelectTrigger aria-label={`Role for ${u.username}`} className="h-8 w-28 text-xs rounded-full border-0 bg-primary/10 text-primary focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge
                    variant={u.isVerified ? 'default' : 'secondary'}
                    className={`text-xs shrink-0 ${u.isVerified
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20'}`}>
                    {u.isVerified ? 'Verified' : 'Pending'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1.5">{u.email}</p>
              </div>
            </div>
            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <p className="hidden sm:block text-xs text-muted-foreground shrink-0">
                {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <Button variant="ghost" size="sm" aria-label={u.isVerified ? 'Unverify user' : 'Verify user'}
                className={`flex-shrink-0 h-9 w-9 sm:w-auto sm:px-3 sm:gap-1.5 text-xs ${u.isVerified
                  ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}`}>
                {u.isVerified ? <ShieldOff className="h-4 w-4 shrink-0" /> : <ShieldCheck className="h-4 w-4 shrink-0" />}
                <span className="hidden sm:inline">{u.isVerified ? 'Unverify' : 'Verify'}</span>
              </Button>
              <Button variant="ghost" size="sm" aria-label="Edit user privileges"
                className="flex-shrink-0 h-9 w-9 sm:w-auto sm:px-3 sm:gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                onClick={() => onChangeRole(u)}>
                <Lock className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Privilege</span>
              </Button>
              {u.role === 'supplier' && u.isVerified && onImpersonate && (
                <Button variant="ghost" size="sm" aria-label={`Impersonate ${u.username}`}
                  className="flex-shrink-0 h-9 w-9 sm:w-auto sm:px-3 sm:gap-1.5 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                  onClick={() => onImpersonate(u)}>
                  <SwitchCamera className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Switch</span>
                </Button>
              )}
              {/* Reset Password - only for current admin's own account (master ID) */}
              {onResetPassword && u.uuid === getSessionAuth()?.uuid && (
                <Button variant="ghost" size="icon" aria-label="Change your password"
                  className="flex-shrink-0 h-9 w-9 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                  onClick={() => onResetPassword(u.uuid)}>
                  <KeyRound className="h-4 w-4" />
                </Button>
              )}
              {/* Reset Password for other users - admin can reset any user's password */}
              {onResetPassword && u.uuid !== getSessionAuth()?.uuid && (
                <Button variant="ghost" size="icon" aria-label="Reset password"
                  className="flex-shrink-0 h-9 w-9 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                  onClick={() => onResetPassword(u.uuid)}>
                  <KeyRound className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Delete user"
                className="flex-shrink-0 h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(u.uuid)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}