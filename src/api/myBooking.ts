import { getRoomBookings, type Room, type TimetableEntry } from './rooms'

export interface MyBookingEntry extends TimetableEntry {
  roomId: number
  roomName: string
}

export async function getMyTeamBookingsToday(
  rooms: Room[],
  teamName: string,
  dateKey: string,
): Promise<MyBookingEntry[]> {
  const perRoom = await Promise.all(
    rooms.map((room) =>
      getRoomBookings(room.id, dateKey).then((entries) =>
        entries
          .filter((e) => e.type === 'BOOKING' && e.teamName === teamName)
          .map((e) => ({ ...e, roomId: room.id, roomName: room.name })),
      ),
    ),
  )
  return perRoom.flat().sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export type BookingPhase = 'upcoming' | 'ongoing' | 'past'

export interface BookingTiming {
  phase: BookingPhase
  minutes: number // upcoming: 시작까지 남은 분 / ongoing: 종료까지 남은 분 / past: 0
}

export function describeBookingTiming(entry: { startTime: string; endTime: string }, now: Date): BookingTiming {
  const start = new Date(entry.startTime).getTime()
  const end = new Date(entry.endTime).getTime()
  const n = now.getTime()

  if (n < start) {
    return { phase: 'upcoming', minutes: Math.round((start - n) / 60_000) }
  }
  if (n < end) {
    return { phase: 'ongoing', minutes: Math.round((end - n) / 60_000) }
  }
  return { phase: 'past', minutes: 0 }
}

export type RoomAvailabilityState = 'free' | 'busy' | 'lock' | 'closed'

export interface RoomAvailability {
  state: RoomAvailabilityState
  until: string | null // 'HH:MM' — free: 다음 예약 시작 / busy·lock: 현재 항목 종료
}

const CLOSE_HOUR = 18

/** 오늘 타임라인 항목들로 "지금" 이 방이 언제까지 비어있는지 / 언제 풀리는지 계산 */
export function describeRoomAvailability(entries: TimetableEntry[], now: Date): RoomAvailability {
  if (now.getHours() >= CLOSE_HOUR) return { state: 'closed', until: null }
  const n = now.getTime()
  const hhmm = (iso: string) => iso.slice(11, 16)

  const current = entries.find((e) => {
    const s = new Date(e.startTime).getTime()
    const en = new Date(e.endTime).getTime()
    return s <= n && n < en
  })
  if (current) {
    return { state: current.type === 'LOCK' ? 'lock' : 'busy', until: hhmm(current.endTime) }
  }

  const next = entries
    .filter((e) => new Date(e.startTime).getTime() > n)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0]
  return { state: 'free', until: next ? hhmm(next.startTime) : null }
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}
