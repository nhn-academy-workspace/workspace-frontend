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

export async function extendBooking(bookingId: number, endTime: string): Promise<BookingResult> {
  const res = await fetch(`${API_V1}/bookings/${bookingId}/extend`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ endTime }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new BookingError(body?.message ?? '연장에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }

  return res.json()
}

export async function earlyReturnBooking(bookingId: number): Promise<{ status: string }> {
  const res = await fetch(`${API_V1}/bookings/${bookingId}/early-return`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new BookingError(body?.message ?? '조기 반납에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }

  return res.json()
}

export async function cancelBooking(bookingId: number): Promise<{ status: string }> {
  const res = await fetch(`${API_V1}/bookings/${bookingId}/cancel`, {
    method: 'PATCH',
    credentials: 'include',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new BookingError(body?.message ?? '예약 취소에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }

  return res.json()
}
