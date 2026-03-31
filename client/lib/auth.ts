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
    destination: "/dashboard/supplier",
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

  const serialized = JSON.stringify(auth)

  try {
    window.sessionStorage.setItem("bill-manager-auth", serialized)
  } catch {
    // Some mobile/private browser contexts can block sessionStorage writes.
  }

  try {
    window.localStorage.setItem("bill-manager-auth", serialized)
  } catch {
    // localStorage can also fail in restricted contexts.
  }
}

export function getSessionAuth(): SessionAuth | null {
  if (typeof window === "undefined") {
    return null
  }

  let value: string | null = null

  try {
    value = window.sessionStorage.getItem("bill-manager-auth")
  } catch {
    value = null
  }

  if (!value) {
    try {
      value = window.localStorage.getItem("bill-manager-auth")
    } catch {
      value = null
    }
  }

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

  try {
    window.sessionStorage.removeItem("bill-manager-auth")
  } catch {
    // ignore
  }

  try {
    window.localStorage.removeItem("bill-manager-auth")
  } catch {
    // ignore
  }
}
