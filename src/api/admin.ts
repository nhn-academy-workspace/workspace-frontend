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
  const res = await fetch(`${API_V1}/admin/teams`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('팀 목록을 불러오지 못했습니다.')
  }
  return res.json()
}
