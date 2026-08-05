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

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}
