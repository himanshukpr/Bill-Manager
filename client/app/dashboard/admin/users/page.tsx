'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Search, ShieldCheck, Trash2, UserPlus, ShieldOff, Lock } from 'lucide-react'
import { usersApi, type User } from '@/lib/api'
import { toast } from 'sonner'
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
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteUuid, setDeleteUuid] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [privilegeDialogOpen, setPrivilegeDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<'admin' | 'supplier'>('supplier')
  const [newUsername, setNewUsername] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addingSaving, setAddSaving] = useState(false)
  const [privilegeSaving, setPrivilegeSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await usersApi.list()
      setUsers(data)
    } catch (e: any) {
      toast.error(e.message)
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
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function handleAddUser() {
    if (!newUsername || !newEmail || !newPassword) {
      toast.error('Username, email, and password are required')
      return
    }
    setAddSaving(true)
    try {
      await usersApi.create({
        username: newUsername,
        email: newEmail,
        password: newPassword,
        role: 'supplier',
      })
      toast.success('User created successfully')
      setAddDialogOpen(false)
      setNewUsername('')
      setNewEmail('')
      setNewPassword('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAddSaving(false)
    }
  }

  async function handleChangeRole() {
    if (!selectedUser) return
    setPrivilegeSaving(true)
    try {
      await usersApi.changeRole(selectedUser.uuid, newRole)
      toast.success(`User role changed to ${newRole}`)
      setPrivilegeDialogOpen(false)
      setSelectedUser(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
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
    } catch (e: any) {
      toast.error(e.message)
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
            onChangeRole={(u) => { setSelectedUser(u); setNewRole(u.role as 'admin' | 'supplier'); setPrivilegeDialogOpen(true); }}
            onDelete={setDeleteUuid}
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
              <Label>Email</Label>
              <Input placeholder="Enter email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
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

      {/* Change Role Dialog */}
      <Dialog open={privilegeDialogOpen} onOpenChange={setPrivilegeDialogOpen}>
        <DialogContent className="max-w-md w-[90vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>Select a new role for {selectedUser?.username}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Role</Label>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPrivilegeDialogOpen(false); setSelectedUser(null); }}>Cancel</Button>
            <Button onClick={handleChangeRole} disabled={privilegeSaving}>
              {privilegeSaving ? 'Changing...' : 'Change Role'}
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
    </div>
  )
}

function UserSection({
  title, users, onToggleVerify, onChangeRole, onDelete,
}: {
  title: string
  users: User[]
  onToggleVerify: (u: User) => void
  onChangeRole: (u: User) => void
  onDelete: (uuid: string) => void
}) {
  if (users.length === 0) return null
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{title}</h2>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {users.map((u, idx) => (
          <div key={u.uuid}
            className={`flex items-center gap-3 px-4 py-3 sm:py-3.5 ${idx !== 0 ? 'border-t border-border/60' : ''} hover:bg-muted/20 transition-colors`}>
            {/* Avatar + Info */}
            <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                {u.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2 min-w-0">
                  <p className="font-semibold text-sm truncate max-w-[7rem] sm:max-w-none">{u.username}</p>
                  <Badge className="text-xs shrink-0" variant={u.role === 'admin' ? 'default' : 'secondary'}>
                    {u.role}
                  </Badge>
                  <Badge
                    variant={u.isVerified ? 'default' : 'secondary'}
                    className={`text-xs shrink-0 ${u.isVerified
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20'}`}>
                    {u.isVerified ? 'Verified' : 'Pending'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1 sm:mt-0.5">{u.email}</p>
              </div>
            </div>
            {/* Date + Actions */}
            <div className="flex items-center justify-end gap-2 ml-auto shrink-0">
              <p className="hidden sm:block text-xs text-muted-foreground shrink-0">
                {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <Button variant="ghost" size="sm"
                className={`flex-shrink-0 gap-1 sm:gap-1.5 text-xs px-2 sm:px-3 whitespace-nowrap ${u.isVerified
                  ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}`}
                onClick={() => onToggleVerify(u)}>
                {u.isVerified ? <ShieldOff className="h-3.5 w-3.5 shrink-0" /> : <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
                <span className="hidden sm:inline">{u.isVerified ? 'Unverify' : 'Verify'}</span>
              </Button>
              <Button variant="ghost" size="sm"
                className="flex-shrink-0 gap-1 sm:gap-1.5 text-xs px-2 sm:px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 whitespace-nowrap"
                onClick={() => onChangeRole(u)}>
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Privilege</span>
              </Button>
              <Button variant="ghost" size="icon"
                className="flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                onClick={() => onDelete(u.uuid)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}