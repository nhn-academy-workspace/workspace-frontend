import { apiFetch } from './client'

export type Role = 'STUDENT' | 'TA'

export interface AuthUser {
  name: string
  role: Role
  teamName: string | null
  mustChangePassword: boolean
  telegramLinked: boolean
  telegramLinkSkipped: boolean
}

export class LoginError extends Error {}
export class PasswordChangeError extends Error {}
export class PasswordResetError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch(`${API_V1}/auth/me`, { credentials: 'include' })
  if (!res.ok) return null
  return res.json()
}

export async function login(loginId: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_V1}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ loginId, password }),
  })

  if (!res.ok) {
    if (res.status === 401) {
      throw new LoginError('아이디 또는 비밀번호가 올바르지 않습니다.')
    }
    throw new LoginError('로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.')
  }

  return res.json()
}

export async function logout(): Promise<void> {
  await fetch(`${API_V1}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}

export async function resetPassword(loginId: string): Promise<void> {
  const res = await fetch(`${API_V1}/auth/password/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ loginId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new PasswordResetError(res.status, body?.message ?? '비밀번호 초기화에 실패했습니다.')
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
  const res = await apiFetch(`${API_V1}/auth/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new PasswordChangeError(body?.message ?? '비밀번호 변경에 실패했습니다.')
  }

  const data: { mustChangePassword: boolean } = await res.json()
  return data.mustChangePassword
}
