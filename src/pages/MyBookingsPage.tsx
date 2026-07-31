import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { getRooms } from '../api/rooms'
import { getMyTeamBookingsToday, describeBookingTiming, formatMinutes, type MyBookingEntry } from '../api/myBooking'
import { extendBooking, earlyReturnBooking, BookingError } from '../api/bookings'
import { useAuth } from '../context/AuthContext'
import './MyBookingsPage.css'

const END_HOUR = 18
const EXTEND_STEP = 15
const EXTEND_WINDOW = 15

function formatTime(iso: string): string {
  return iso.slice(11, 16)
}

function addMinutesIso(iso: string, minutes: number): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + minutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function minutesOfDay(iso: string): number {
  const h = Number(iso.slice(11, 13))
  const m = Number(iso.slice(14, 16))
  return h * 60 + m
}

export default function MyBookingsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const reduceMotion = useReducedMotion()

  const [bookings, setBookings] = useState<MyBookingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const [actionSubmitting, setActionSubmitting] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchBookings = () => {
    if (!user?.teamName) return Promise.resolve()
    setLoading(true)
    setError(null)
    return getRooms()
      .then((rooms) => getMyTeamBookingsToday(rooms, user.teamName!, toDateKey(new Date())))
      .then((data) => setBookings(data))
      .catch(() => setError('예약 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchBookings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.teamName])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const handleExtend = async (entry: MyBookingEntry) => {
    setActionSubmitting(entry.id)
    setActionError(null)
    try {
      await extendBooking(entry.id, addMinutesIso(entry.endTime, EXTEND_STEP))
      await fetchBookings()
    } catch (err) {
      setActionError(err instanceof BookingError ? err.message : '연장에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setActionSubmitting(null)
    }
  }

  const handleEarlyReturn = async (entry: MyBookingEntry) => {
    setActionSubmitting(entry.id)
    setActionError(null)
    try {
      await earlyReturnBooking(entry.id)
      await fetchBookings()
    } catch (err) {
      setActionError(err instanceof BookingError ? err.message : '조기 반납에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setActionSubmitting(null)
    }
  }

  return (
    <div className="my-bookings-page">
      <header className="my-bookings-header">
        <button type="button" className="back-button" onClick={() => navigate('/main')}>
          ← 뒤로
        </button>
        <h1>내 예약</h1>
      </header>

      <main className="my-bookings-content">
        {user?.role !== 'STUDENT' ? (
          <p className="state-message">TA 계정은 팀 예약이 없습니다.</p>
        ) : (
          <>
            {loading && <p className="state-message">불러오는 중...</p>}
            {error && <p className="state-message is-error">{error}</p>}

            {!loading && !error && bookings.length === 0 && (
              <p className="state-message">오늘 예약된 회의가 없어요.</p>
            )}

            {!loading && !error && actionError && <p className="state-message is-error">{actionError}</p>}

            {!loading && !error && bookings.length > 0 && (
              <div className="my-bookings-list">
                {bookings.map((entry, i) => {
                  const timing = describeBookingTiming(entry, now)
                  const canExtend =
                    timing.phase === 'ongoing' &&
                    timing.minutes <= EXTEND_WINDOW &&
                    minutesOfDay(entry.endTime) + EXTEND_STEP <= END_HOUR * 60
                  const submitting = actionSubmitting === entry.id

                  return (
                    <motion.article
                      key={entry.id}
                      className={`booking-card phase-${timing.phase}`}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.35, ease: 'easeOut' }}
                    >
                      <div className="booking-card-top">
                        <h2>{entry.roomName}</h2>
                        <span className="booking-time">
                          {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                        </span>
                      </div>

                      <p className="booking-status">
                        {timing.phase === 'ongoing' && `지금 진행 중 · ${formatMinutes(timing.minutes)} 후 종료`}
                        {timing.phase === 'upcoming' && `${formatMinutes(timing.minutes)} 후 시작`}
                        {timing.phase === 'past' && '종료됨'}
                      </p>

                      {timing.phase === 'ongoing' && (
                        <div className="booking-actions">
                          {canExtend && (
                            <button type="button" onClick={() => handleExtend(entry)} disabled={submitting}>
                              +{EXTEND_STEP}분 연장
                            </button>
                          )}
                          <button
                            type="button"
                            className="early-return-button"
                            onClick={() => handleEarlyReturn(entry)}
                            disabled={submitting}
                          >
                            조기 반납
                          </button>
                        </div>
                      )}
                    </motion.article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
