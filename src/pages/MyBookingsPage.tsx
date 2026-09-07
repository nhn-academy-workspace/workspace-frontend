import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRoomBookings } from '../api/rooms'
import { getTeamBookingHistory, type TeamBookingHistoryEntry } from '../api/teamHistory'
import { describeBookingTiming, formatMinutes } from '../api/myBooking'
import { extendBooking, earlyReturnBooking, cancelBooking, BookingError } from '../api/bookings'
import { getMyTeamRoster } from '../api/teams'
import { getTeamUsage, type TeamUsage } from '../api/teamUsage'
import { useAuth } from '../context/AuthContext'
import './MyBookingsPage.css'

const CLOSE_MINUTES = 18 * 60
const DAILY_CAP_MINUTES = 240
const MAX_BOOKING_MINUTES = 120 // 1회 예약(연장 포함) 최대 2시간
const EXTEND_STEP = 5 // 백엔드 연장 최소 단위와 일치
const DURATION_OPTIONS = [5, 10, 15, 30, 45, 60]

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

// 표시 우선순위: 진행 중/예정 > 종료됨 > 취소됨
function sortRank(entry: TeamBookingHistoryEntry, now: Date): number {
  if (entry.status === 'CANCELLED') return 3
  const phase = describeBookingTiming(entry, now).phase
  if (phase === 'ongoing') return 0
  if (phase === 'upcoming') return 1
  return 2
}

export default function MyBookingsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [bookings, setBookings] = useState<TeamBookingHistoryEntry[]>([])
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
    const todayKey = toDateKey(new Date())
    return getMyTeamRoster()
      .then((roster) => (roster.teamId ? getTeamBookingHistory(roster.teamId) : []))
      .then((data) => setBookings(data.filter((e) => e.startTime.slice(0, 10) === todayKey)))
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

  const openExtend = async (entry: TeamBookingHistoryEntry) => {
    if (extendingId === entry.bookingId) {
      closeExtend()
      return
    }
    setExtendingId(entry.bookingId)
    setExtendMax(null)
    setActionError(null)
    setExtendLoading(true)

    try {
      const roomEntries = await getRoomBookings(entry.roomId, toDateKey(new Date()))
      const entryEnd = minutesOfDay(entry.endTime)

      let maxEndAbs = CLOSE_MINUTES
      for (const e of roomEntries) {
        if (e.id === entry.bookingId && e.type === 'BOOKING') continue
        const s = minutesOfDay(e.startTime)
        if (s > entryEnd && s < maxEndAbs) maxEndAbs = s
      }

      const usedToday = bookings
        .filter((b) => b.status !== 'CANCELLED')
        .reduce((sum, b) => sum + (minutesOfDay(b.endTime) - minutesOfDay(b.startTime)), 0)
      const capRemaining = Math.max(DAILY_CAP_MINUTES - usedToday, 0)
      // 다음 일정 / 18:00 / 팀 일일 4시간 / 이 예약 시작으로부터 최대 2시간
      maxEndAbs = Math.min(
        maxEndAbs,
        entryEnd + capRemaining,
        minutesOfDay(entry.startTime) + MAX_BOOKING_MINUTES,
      )

      const rawMax = maxEndAbs - entryEnd
      setExtendMax(Math.max(Math.floor(rawMax / EXTEND_STEP) * EXTEND_STEP, 0))
    } catch {
      setExtendMax(0)
    } finally {
      setExtendLoading(false)
    }
  }

  const confirmExtend = async (entry: TeamBookingHistoryEntry, minutes: number) => {
    setActionSubmitting(entry.bookingId)
    setActionError(null)
    try {
      await extendBooking(entry.bookingId, addMinutesIso(entry.endTime, minutes))
      closeExtend()
      await fetchBookings()
      fetchUsage()
    } catch (err) {
      setActionError(err instanceof BookingError ? err.message : '연장에 실패했습니다.')
    } finally {
      setActionSubmitting(null)
    }
  }

  const handleEarlyReturn = async (entry: TeamBookingHistoryEntry) => {
    setActionSubmitting(entry.bookingId)
    setActionError(null)
    try {
      await earlyReturnBooking(entry.bookingId)
      closeExtend()
      await fetchBookings()
      fetchUsage()
    } catch (err) {
      setActionError(err instanceof BookingError ? err.message : '조기 반납에 실패했습니다.')
    } finally {
      setActionSubmitting(null)
    }
  }

  const handleCancel = async (entry: TeamBookingHistoryEntry) => {
    if (!window.confirm('이 예약을 취소하시겠습니까?')) return
    setActionSubmitting(entry.bookingId)
    setActionError(null)
    try {
      await cancelBooking(entry.bookingId)
      closeExtend()
      await fetchBookings()
      fetchUsage()
    } catch (err) {
      setActionError(err instanceof BookingError ? err.message : '예약 취소에 실패했습니다.')
    } finally {
      setActionSubmitting(null)
    }
  }

  const sortedBookings = [...bookings].sort((a, b) => {
    const rankDiff = sortRank(a, now) - sortRank(b, now)
    if (rankDiff !== 0) return rankDiff
    return a.startTime.localeCompare(b.startTime)
  })

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
                  <span>
                    {formatMinutes(usage.usedMinutes)} / {formatMinutes(DAILY_CAP_MINUTES)}
                  </span>
                </div>
                <div className="usage-bar">
                  <div
                    className="usage-bar-fill"
                    style={{
                      width: `${Math.min((usage.usedMinutes / DAILY_CAP_MINUTES) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="usage-summary-remaining">
                  {formatMinutes(Math.max(usage.remainingMinutes, 0))} 남음
                </p>
              </div>
            )}

            {loading && <p className="state-message">불러오는 중</p>}
            {error && <p className="state-message is-error">{error}</p>}

            {!loading && !error && bookings.length === 0 && (
              <p className="state-message">오늘 예약이 없습니다.</p>
            )}

            {!loading && !error && actionError && (
              <p className="state-message is-error">{actionError}</p>
            )}

            {!loading && !error && sortedBookings.length > 0 && (
              <div className="my-bookings-list">
                {sortedBookings.map((entry) => {
                  const isCancelled = entry.status === 'CANCELLED'
                  const timing = describeBookingTiming(entry, now)
                  const bookedNow =
                    !isCancelled && entry.status === 'BOOKED' && timing.phase !== 'past'
                  // 아직 2시간(=시작+120분) 미만이면 연장 여지 있음 — 실제 한도는 openExtend에서 계산
                  const canOfferExtend =
                    bookedNow &&
                    (timing.phase === 'ongoing' || timing.phase === 'upcoming') &&
                    minutesOfDay(entry.endTime) - minutesOfDay(entry.startTime) <
                      MAX_BOOKING_MINUTES
                  const canOfferEarlyReturn = bookedNow && timing.phase === 'ongoing'
                  const canOfferCancel = bookedNow && timing.phase === 'upcoming'
                  const submitting = actionSubmitting === entry.bookingId
                  const isExtending = extendingId === entry.bookingId

                  return (
                    <article
                      key={entry.bookingId}
                      className={`booking-card phase-${isCancelled ? 'cancelled' : timing.phase} fade-in`}
                    >
                      <div className="booking-card-top">
                        <h2>{entry.roomName}</h2>
                        <span className="booking-time">
                          {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                        </span>
                      </div>

                      <p className="booking-status">
                        {isCancelled && '취소됨'}
                        {!isCancelled &&
                          timing.phase === 'ongoing' &&
                          `사용 중 · ${formatMinutes(timing.minutes)} 후 종료`}
                        {!isCancelled &&
                          timing.phase === 'upcoming' &&
                          `${formatMinutes(timing.minutes)} 후 시작`}
                        {!isCancelled && timing.phase === 'past' && '종료됨'}
                      </p>

                      {(canOfferExtend || canOfferEarlyReturn || canOfferCancel) && (
                        <div className="booking-actions">
                          {canOfferExtend && (
                            <button
                              type="button"
                              onClick={() => openExtend(entry)}
                              disabled={submitting}
                            >
                              연장
                            </button>
                          )}
                          {canOfferEarlyReturn && (
                            <button
                              type="button"
                              className="early-return-button"
                              onClick={() => handleEarlyReturn(entry)}
                              disabled={submitting}
                            >
                              조기 반납
                            </button>
                          )}
                          {canOfferCancel && (
                            <button
                              type="button"
                              className="is-danger"
                              onClick={() => handleCancel(entry)}
                              disabled={submitting}
                            >
                              예약 취소
                            </button>
                          )}
                        </div>
                      )}

                      {isExtending && (
                        <div className="extend-options">
                          {extendLoading && <span className="extend-hint">확인 중</span>}
                          {!extendLoading && extendMax !== null && extendMax < EXTEND_STEP && (
                            <span className="extend-hint">연장 가능한 시간이 없습니다.</span>
                          )}
                          {!extendLoading &&
                            extendMax !== null &&
                            extendMax >= EXTEND_STEP &&
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
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}

            <button
              type="button"
              className="history-link"
              onClick={() => navigate('/bookings/history')}
            >
              지난 예약 이력 →
            </button>
          </>
        )}
      </main>
    </div>
  )
}
