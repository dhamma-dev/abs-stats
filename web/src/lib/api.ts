import { useQuery } from '@tanstack/react-query'
import type { FamilyStats, Me, UserStats, UserSummary } from '../../../shared/types.ts'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'same-origin',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`)
  return body as T
}

export const coverUrl = (itemId: string | null | undefined) => (itemId ? `/api/cover/${itemId}` : null)

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), retry: false })

export const useUsers = (enabled: boolean) =>
  useQuery({ queryKey: ['users'], queryFn: () => api<UserSummary[]>('/api/users'), enabled })

/** Stable color slot per person: their position in the alphabetical user list. */
export function usePersonIndex(enabled = true) {
  const users = useUsers(enabled)
  const sorted = [...(users.data ?? [])].sort((a, b) => a.username.localeCompare(b.username))
  return (id: string) => Math.max(0, sorted.findIndex((u) => u.id === id))
}

const qs = (params: Record<string, string | number | null | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const useStats = (userId: string | null, year: number | null) =>
  useQuery({
    queryKey: ['stats', userId, year],
    queryFn: () => api<UserStats>(`/api/stats${qs({ user: userId, year })}`),
    placeholderData: (prev) => prev,
  })

export const useFamily = (year: number | null, enabled = true) =>
  useQuery({
    queryKey: ['family', year],
    queryFn: () => api<FamilyStats>(`/api/family${qs({ year })}`),
    enabled,
    placeholderData: (prev) => prev,
  })
