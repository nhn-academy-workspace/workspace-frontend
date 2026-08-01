export interface TeamMember {
  memberId: number
  name: string
}

export interface MyTeamRoster {
  memberId: number
  // TODO(backend): teamId가 아직 응답에 없음. TeamMemberResponse에 teamId 필드
  // 하나만 추가되면 팀 예약 이력(GET /teams/{teamId}/bookings) 조회에 바로 씀.
  teamId?: number
  members: TeamMember[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export async function getMyTeamRoster(): Promise<MyTeamRoster> {
  const res = await fetch(`${API_V1}/teams/me/members`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('팀원 목록을 불러오지 못했습니다.')
  }
  return res.json()
}
