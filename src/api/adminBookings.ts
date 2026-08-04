const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export class AdminActionError extends Error {}

interface BookingResult {
  bookingId: number
  roomId: number
  startTime: string
  endTime: string
  status: string
}

async function handle(res: Response, fallback: string) {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new AdminActionError(body?.message ?? fallback)
  }
  return res.json()
}

export async function adjustBooking(bookingId: number, startTime: string, endTime: string): Promise<BookingResult> {
  const res = await fetch(`${API_V1}/admin/bookings/${bookingId}/adjust`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ startTime, endTime }),
  })
  return handle(res, '예약 조정에 실패했습니다.')
}

export async function cancelBooking(bookingId: number): Promise<BookingResult> {
  const res = await fetch(`${API_V1}/admin/bookings/${bookingId}/cancel`, {
    method: 'PATCH',
    credentials: 'include',
  })
  return handle(res, '예약 취소에 실패했습니다.')
}

export interface CreateLockPayload {
  roomId: number
  startTime: string
  endTime: string
  reason?: string
}

export interface LockResult {
  lockId: number
  roomId: number
  startTime: string
  endTime: string
  reason: string | null
}

export async function createLock(payload: CreateLockPayload): Promise<LockResult> {
  const res = await fetch(`${API_V1}/admin/room-locks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  return handle(res, '락 생성에 실패했습니다.')
}

export async function deleteLock(lockId: number): Promise<void> {
  const res = await fetch(`${API_V1}/admin/room-locks/${lockId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new AdminActionError(body?.message ?? '락 취소에 실패했습니다.')
  }
}
