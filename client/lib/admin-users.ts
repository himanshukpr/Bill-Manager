import { getAuthHeader } from "@/lib/auth"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL

export type AdminUser = {
  uuid: string
  username: string
  email: string
  role: "admin" | "supplier" | "member"
  isVerified: boolean
  createdAt: string
}

type UsersListResponse = {
  count: number
  users: AdminUser[]
}

type VerifyUserResponse = {
  message: string
  user: AdminUser
}

type DeleteUserResponse = {
  message: string
  user: {
    uuid: string
    username: string
    email: string
    role: "admin" | "supplier" | "member"
  }
}

type ApiError = {
  message?: string | string[]
}

async function parseResponse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T | ApiError

  if (!res.ok) {
    const apiError = body as ApiError
    const message = Array.isArray(apiError.message)
      ? apiError.message[0]
      : apiError.message || "Something went wrong"
    throw new Error(message)
  }

  return body as T
}

export async function apiAdminListUsers(): Promise<UsersListResponse> {
  const res = await fetch(`${BASE_URL}/users`, {
    method: "GET",
    headers: {
      ...getAuthHeader(),
    },
    cache: "no-store",
  })

  return parseResponse<UsersListResponse>(res)
}

export async function apiAdminVerifyUser(uuid: string): Promise<VerifyUserResponse> {
  const res = await fetch(`${BASE_URL}/users/${uuid}/verify`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
  })

  return parseResponse<VerifyUserResponse>(res)
}

export async function apiAdminDeleteUser(uuid: string): Promise<DeleteUserResponse> {
  const res = await fetch(`${BASE_URL}/users/${uuid}`, {
    method: "DELETE",
    headers: {
      ...getAuthHeader(),
    },
  })

  return parseResponse<DeleteUserResponse>(res)
}