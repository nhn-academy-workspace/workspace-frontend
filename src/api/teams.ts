export interface TeamMember {
  memberId: number
  name: string
}

export interface MyTeamRoster {
  memberId: number
  teamId: number
  members: TeamMember[]
}

import { apiFetch } from './client'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export async function getMyTeamRoster(): Promise<MyTeamRoster> {
  const res = await apiFetch(`${API_V1}/teams/me/members`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('팀원 목록을 불러오지 못했습니다.')
  }
  return res.json()
}
