import { apiFetch } from './client'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export interface AdminTeamMember {
  memberId: number
  name: string
  loginId: string
}

export interface AdminTeam {
  teamId: number
  name: string
  members: AdminTeamMember[]
}

export async function getAdminTeams(): Promise<AdminTeam[]> {
  const res = await apiFetch(`${API_V1}/admin/teams`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('팀 목록을 불러오지 못했습니다.')
  }
  return res.json()
}

export async function changeMemberTeam(memberId: number, teamId: number): Promise<void> {
  const res = await apiFetch(`${API_V1}/admin/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ teamId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? '팀 재배정에 실패했습니다.')
  }
}

export async function resetMemberPassword(memberId: number): Promise<string> {
  const res = await apiFetch(`${API_V1}/admin/members/${memberId}/password/reset`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? '비밀번호 초기화에 실패했습니다.')
  }
  const data: { tempPassword: string } = await res.json()
  return data.tempPassword
}

export async function callTarget(
  targetType: 'MEMBER' | 'TEAM',
  targetId: number,
  message: string,
): Promise<void> {
  const res = await apiFetch(`${API_V1}/admin/calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ targetType, targetId, message }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? '호출에 실패했습니다.')
  }
}
