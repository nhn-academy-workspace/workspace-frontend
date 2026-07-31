export type TeamBookingStatus = 'BOOKED' | 'CANCELLED' | 'EARLY_RETURNED' | 'COMPLETED'

export interface TeamBookingHistoryEntry {
  bookingId: number
  roomName: string
  startTime: string
  endTime: string
  status: TeamBookingStatus
  originalStartTime: string | null
  originalEndTime: string | null
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export async function getTeamBookingHistory(teamId: number): Promise<TeamBookingHistoryEntry[]> {
  const res = await fetch(`${API_V1}/teams/${teamId}/bookings`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('예약 이력을 불러오지 못했습니다.')
  }
  return res.json()
}
