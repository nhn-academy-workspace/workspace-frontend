import { apiFetch } from './client'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export interface TeamUsage {
  usedMinutes: number
  remainingMinutes: number
}

export async function getTeamUsage(teamId: number, date: string): Promise<TeamUsage> {
  const res = await apiFetch(`${API_V1}/teams/${teamId}/usage?date=${date}`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('사용 시간 정보를 불러오지 못했습니다.')
  }
  return res.json()
}
