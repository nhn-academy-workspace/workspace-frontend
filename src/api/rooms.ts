export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'LOCK'

export interface Room {
  id: number
  name: string
  status: RoomStatus
}

export type TimetableEntryType = 'BOOKING' | 'LOCK'

export interface TimetableEntry {
  id: number
  type: TimetableEntryType
  startTime: string
  endTime: string
  teamName: string | null
  reason: string | null
}

import { apiFetch } from './client'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export async function getRooms(): Promise<Room[]> {
  const res = await apiFetch(`${API_V1}/rooms`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('회의실 목록을 불러오지 못했습니다.')
  }
  return res.json()
}

export async function getRoomBookings(roomId: number, date?: string): Promise<TimetableEntry[]> {
  const query = date ? `?date=${date}` : ''
  const res = await apiFetch(`${API_V1}/rooms/${roomId}/bookings${query}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error('예약 현황을 불러오지 못했습니다.')
  }
  return res.json()
}
