export type AppRole = "admin" | "supplier" | "member"

export type SessionAuth = {
  role: AppRole
  profile: string
  userId: string
  loginAt: string
}

type ProfileRule = {
  role: AppRole
  userId: string
  destination: string
  aliases: string[]
}

const profileRules: ProfileRule[] = [
  {
    role: "admin",
    userId: "ADM-001",
    destination: "/dashboard/admin",
    aliases: ["admin", "family - admin", "family admin"],
  },
  {
    role: "supplier",
    userId: "SUP-001",
    destination: "/dashboard/member",
    aliases: ["supplier", "suppliers", "member 1", "member 1 - suppliers"],
  },
  {
    role: "member",
    userId: "MEM-002",
    destination: "/dashboard/member",
    aliases: ["member", "member 2"],
  },
]

export function resolveProfile(profileInput: string) {
  const normalized = profileInput.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  return profileRules.find((rule) =>
    rule.aliases.some((alias) => alias === normalized)
  )
}

export function saveSessionAuth(auth: SessionAuth) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.setItem("bill-manager-auth", JSON.stringify(auth))
}

export function getSessionAuth(): SessionAuth | null {
  if (typeof window === "undefined") {
    return null
  }

  const value = window.sessionStorage.getItem("bill-manager-auth")
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as SessionAuth
  } catch {
    return null
  }
}

export function clearSessionAuth() {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.removeItem("bill-manager-auth")
}
