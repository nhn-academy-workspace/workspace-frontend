export type Role = 'STUDENT' | 'TA'

export interface AuthUser {
  name: string
  role: Role
  teamName: string | null
}

export class LoginError extends Error {}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

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
