import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { getRooms, getRoomBookings } from '../api/rooms'
import { getMyTeamBookingsToday, describeBookingTiming, formatMinutes, type MyBookingEntry } from '../api/myBooking'
import { extendBooking, earlyReturnBooking, BookingError } from '../api/bookings'
import { getMyTeamRoster } from '../api/teams'
import { getTeamUsage, type TeamUsage } from '../api/teamUsage'
import { useAuth } from '../context/AuthContext'
import './MyBookingsPage.css'

const CLOSE_MINUTES = 18 * 60
const DAILY_CAP_MINUTES = 240
const EXTEND_WINDOW = 15
const DURATION_OPTIONS = [15, 30, 45, 60]

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
  const [usage, setUsage] = useState<TeamUsage | null>(null)

  const [actionSubmitting, setActionSubmitting] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [extendingId, setExtendingId] = useState<number | null>(null)
  const [extendMax, setExtendMax] = useState<number | null>(null)
  const [extendLoading, setExtendLoading] = useState(false)

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

  const fetchUsage = () => {
    if (!user?.teamName) return
    getMyTeamRoster()
      .then((roster) => (roster.teamId ? getTeamUsage(roster.teamId, toDateKey(new Date())) : null))
      .then((data) => setUsage(data))
      .catch(() => setUsage(null))
  }

  useEffect(() => {
    fetchBookings()
    fetchUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.teamName])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const closeExtend = () => {
    setExtendingId(null)
    setExtendMax(null)
  }

  const openExtend = async (entry: MyBookingEntry) => {
    if (extendingId === entry.id) {
      closeExtend()
      return
    }
    setExtendingId(entry.id)
    setExtendMax(null)
    setActionError(null)
    setExtendLoading(true)

    try {
      const roomEntries = await getRoomBookings(entry.roomId, toDateKey(new Date()))
      const entryEnd = minutesOfDay(entry.endTime)

      let maxEndAbs = CLOSE_MINUTES
      for (const e of roomEntries) {
        if (e.id === entry.id && e.type === entry.type) continue
        const s = minutesOfDay(e.startTime)
        if (s > entryEnd && s < maxEndAbs) maxEndAbs = s
      }

      const usedToday = bookings.reduce(
        (sum, b) => sum + (minutesOfDay(b.endTime) - minutesOfDay(b.startTime)),
        0,
      )
      const capRemaining = Math.max(DAILY_CAP_MINUTES - usedToday, 0)
      maxEndAbs = Math.min(maxEndAbs, entryEnd + capRemaining)

      const rawMax = maxEndAbs - entryEnd
      setExtendMax(Math.max(Math.floor(rawMax / 15) * 15, 0))
    } catch {
      setExtendMax(0)
    } finally {
      setExtendLoading(false)
    }
  }

  const confirmExtend = async (entry: MyBookingEntry, minutes: number) => {
    setActionSubmitting(entry.id)
    setActionError(null)
    try {
      await extendBooking(entry.id, addMinutesIso(entry.endTime, minutes))
      closeExtend()
      await fetchBookings()
      fetchUsage()
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
      closeExtend()
      await fetchBookings()
      fetchUsage()
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
            {usage && (
              <div className="usage-summary">
                <div className="usage-summary-top">
                  <span>오늘 사용 시간</span>
                  <span>{formatMinutes(usage.usedMinutes)} / {formatMinutes(DAILY_CAP_MINUTES)}</span>
                </div>
                <div className="usage-bar">
                  <div
                    className="usage-bar-fill"
                    style={{ width: `${Math.min((usage.usedMinutes / DAILY_CAP_MINUTES) * 100, 100)}%` }}
                  />
                </div>
                <p className="usage-summary-remaining">
                  남은 {formatMinutes(Math.max(usage.remainingMinutes, 0))}
                </p>
              </div>
            )}

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
                  const canOfferExtend = timing.phase === 'ongoing' && timing.minutes <= EXTEND_WINDOW
                  const submitting = actionSubmitting === entry.id
                  const isExtending = extendingId === entry.id

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
                          {canOfferExtend && (
                            <button type="button" onClick={() => openExtend(entry)} disabled={submitting}>
                              연장
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

                      <AnimatePresence>
                        {isExtending && (
                          <motion.div
                            className="extend-options"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                          >
                            {extendLoading && <span className="extend-hint">확인 중...</span>}
                            {!extendLoading && extendMax !== null && extendMax < 15 && (
                              <span className="extend-hint">지금은 더 연장할 수 있는 시간이 없어요.</span>
                            )}
                            {!extendLoading &&
                              extendMax !== null &&
                              extendMax >= 15 &&
                              DURATION_OPTIONS.map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  className="chip"
                                  disabled={m > extendMax || submitting}
                                  onClick={() => confirmExtend(entry, m)}
                                >
                                  +{m}분
                                </button>
                              ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.article>
                  )
                })}
              </div>
            )}

            <button type="button" className="history-link" onClick={() => navigate('/bookings/history')}>
              지난 예약 이력 보기 →
            </button>
          </>
        )}
      </main>
    </div>
  )
}
