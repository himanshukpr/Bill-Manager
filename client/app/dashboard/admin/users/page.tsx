"use client"

import { useMemo, useState } from "react"
import { Eye, ShieldCheck, ShieldX, Trash2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type UserRole = "admin" | "supplier" | "member"

type UserItem = {
  uuid: string
  username: string
  email: string
  role: UserRole
  isVerified: boolean
  createdAt: string
}

const dummyUsers: UserItem[] = [
  {
    uuid: "2b1ab7c4-a9f6-41a5-b7e0-104e0db4db10",
    username: "Arjun",
    email: "arjun@example.com",
    role: "supplier",
    isVerified: false,
    createdAt: "2026-04-01T08:15:00.000Z",
  },
  {
    uuid: "f8adca91-9a5c-4798-b610-0f8d2c86f118",
    username: "Meera",
    email: "meera@example.com",
    role: "member",
    isVerified: false,
    createdAt: "2026-04-01T07:55:00.000Z",
  },
  {
    uuid: "c9c490be-b8ff-4a77-9a11-c9f4a4f7135e",
    username: "Rohit",
    email: "rohit@example.com",
    role: "supplier",
    isVerified: true,
    createdAt: "2026-03-30T11:20:00.000Z",
  },
]

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>(dummyUsers)
  const [query, setQuery] = useState("")
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null)

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return users
    return users.filter((user) =>
      [user.username, user.email, user.role, user.isVerified ? "verified" : "unverified"]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    )
  }, [users, query])

  function handleDelete(uuid: string) {
    const confirmed = window.confirm("Delete this user permanently?")
    if (!confirmed) return

    setUsers((prev) => prev.filter((item) => item.uuid !== uuid))
    if (selectedUser?.uuid === uuid) setSelectedUser(null)
  }

  function toggleVerification(user: UserItem) {
    setUsers((prev) =>
      prev.map((item) =>
        item.uuid === user.uuid ? { ...item, isVerified: !item.isVerified } : item,
      ),
    )
    if (selectedUser?.uuid === user.uuid) {
      setSelectedUser({ ...user, isVerified: !user.isVerified })
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:space-y-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-foreground/70 uppercase">Users</p>
          <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">User Management</h1>
          <p className="text-sm text-foreground/75">
            Frontend demo view only. Shows users, verify state, and action buttons.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
          <Users className="h-3.5 w-3.5" />
          {users.length} registered users
        </div>
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by username, email, role, status..."
          className="w-full sm:max-w-md"
        />
        {selectedUser && (
          <p className="text-sm text-foreground/75">
            Viewing: <span className="font-medium text-foreground">{selectedUser.username}</span>
          </p>
        )}
      </div>

      <article className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
        <table className="w-full min-w-200 text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-foreground/70">
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-foreground/70" colSpan={6}>
                  No users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.uuid} className="border-b border-border/70 text-foreground hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium text-foreground">{user.username}</td>
                  <td className="px-4 py-3 text-foreground/80">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium uppercase tracking-wide">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.isVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">
                        <ShieldX className="h-3.5 w-3.5" /> Unverified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground/80">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedUser(user)}
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleVerification(user)}
                      >
                        {user.isVerified ? "Unverify" : "Verify"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleDelete(user.uuid)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>

      <div className="space-y-3 md:hidden">
        {filteredUsers.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-foreground/70">
            No users found.
          </div>
        ) : (
          filteredUsers.map((user) => (
            <article key={user.uuid} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-foreground">{user.username}</p>
                  <p className="text-sm text-foreground/80">{user.email}</p>
                </div>
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium uppercase tracking-wide">
                  {user.role}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                {user.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">
                    <ShieldX className="h-3.5 w-3.5" /> Unverified
                  </span>
                )}
                <span className="text-xs text-foreground/75">
                  {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedUser(user)}>
                  <Eye className="h-3.5 w-3.5" /> View
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void toggleVerification(user)}>
                  {user.isVerified ? "Unverify" : "Verify"}
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => void handleDelete(user.uuid)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}