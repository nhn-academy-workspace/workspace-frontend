export interface TeamMember {
  memberId: number
  name: string
}

export interface MyTeamRoster {
  memberId: number
  members: TeamMember[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

// TODO(backend): /api/v1/teams/me/members 엔드포인트가 아직 없음.
// 세션의 memberId로 소속 팀을 찾아 { memberId, members: [{memberId, name}] } 형태로 내려주면 됨.
export async function getMyTeamRoster(): Promise<MyTeamRoster> {
  const res = await fetch(`${API_V1}/teams/me/members`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('팀원 목록을 불러오지 못했습니다.')
  }
  return res.json()
}
