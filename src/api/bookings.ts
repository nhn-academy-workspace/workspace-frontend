export interface CreateBookingPayload {
  roomId: number
  startTime: string
  endTime: string
  memberIds: number[]
}

export interface BookingResult {
  bookingId: number
  roomId: number
  startTime: string
  endTime: string
  status: string
}

export class BookingError extends Error {}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export async function createBooking(payload: CreateBookingPayload): Promise<BookingResult> {
  const res = await fetch(`${API_V1}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new BookingError(body?.message ?? '예약에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }

  return res.json()
}
