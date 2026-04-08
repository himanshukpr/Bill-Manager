'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Search, ShieldCheck, Trash2, UserPlus, ShieldOff } from 'lucide-react'
import { usersApi, type User } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteUuid, setDeleteUuid] = useState<string | null>(null)

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

  const suppliers = filtered.filter(u => u.role === 'supplier')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage system users and supplier accounts</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
            <Users className="h-3.5 w-3.5" />
            {users.length} total
          </Badge>
          <Badge className="gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20">
            {users.filter(u => !u.isVerified).length} pending
          </Badge>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by username or email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground rounded-lg bg-primary/5 border border-primary/10 px-4 py-3">
        New users register via the signup page. As admin, you can verify or remove them here.
        Unverified users will see a "Pending Approval" screen and cannot access the dashboard.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Suppliers */}
          <UserSection
            title="Suppliers"
            users={suppliers}
            onToggleVerify={toggleVerify}
            onDelete={setDeleteUuid}
          />
        </div>
      )}

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
  title, users, onToggleVerify, onDelete,
}: {
  title: string
  users: User[]
  onToggleVerify: (u: User) => void
  onDelete: (uuid: string) => void
}) {
  if (users.length === 0) return null
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{title}</h2>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {users.map((u, idx) => (
          <div key={u.uuid}
            className={`flex items-center gap-3 px-4 py-3.5 ${idx !== 0 ? 'border-t border-border/60' : ''} hover:bg-muted/20 transition-colors`}>
            {/* Avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
              {u.username[0].toUpperCase()}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm truncate">{u.username}</p>
                <Badge
                  variant={u.isVerified ? 'default' : 'secondary'}
                  className={`text-xs shrink-0 ${u.isVerified
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20'}`}>
                  {u.isVerified ? 'Verified' : 'Pending'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
            {/* Date */}
            <p className="hidden sm:block text-xs text-muted-foreground shrink-0">
              {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm"
                className={`gap-1.5 text-xs ${u.isVerified ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}`}
                onClick={() => onToggleVerify(u)}>
                {u.isVerified ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {u.isVerified ? 'Revoke' : 'Verify'}
              </Button>
              <Button variant="ghost" size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
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