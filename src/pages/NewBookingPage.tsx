import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { getRooms, type Room } from '../api/rooms'
import { getMyTeamRoster, type TeamMember } from '../api/teams'
import { createBooking, BookingError } from '../api/bookings'
import './NewBookingPage.css'

const START_HOUR = 9
const END_HOUR = 18
const OPEN_HOUR = 8
const OPEN_MINUTE = 30
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120]
const MIN_PARTICIPANTS = 4

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildStartTimeOptions(now: Date): string[] {
  const options: string[] = []
  for (let totalMinutes = START_HOUR * 60; totalMinutes <= (END_HOUR * 60 - 15); totalMinutes += 15) {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const candidate = new Date(now)
    candidate.setHours(h, m, 0, 0)
    if (candidate.getTime() < now.getTime()) continue
    options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return options
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

export default function NewBookingPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [room, setRoom] = useState<Room | null>(null)
  const [now] = useState(() => new Date())
  const dateKey = useMemo(() => toDateKey(now), [now])
  const startOptions = useMemo(() => buildStartTimeOptions(now), [now])
  const isBeforeOpen = now.getHours() < OPEN_HOUR || (now.getHours() === OPEN_HOUR && now.getMinutes() < OPEN_MINUTE)

  const [startTime, setStartTime] = useState(startOptions[0] ?? '')
  const [duration, setDuration] = useState<number | null>(null)

  const [roster, setRoster] = useState<TeamMember[]>([])
  const [myMemberId, setMyMemberId] = useState<number | null>(null)
  const [rosterLoading, setRosterLoading] = useState(true)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!roomId) return
    getRooms().then((rooms) => setRoom(rooms.find((r) => r.id === Number(roomId)) ?? null)).catch(() => {})
  }, [roomId])

  useEffect(() => {
    let cancelled = false
    setRosterLoading(true)
    setRosterError(null)

    getMyTeamRoster()
      .then((data) => {
        if (cancelled) return
        setRoster(data.members)
        setMyMemberId(data.memberId)
        setSelectedIds([data.memberId])
      })
      .catch(() => {
        if (!cancelled) setRosterError('팀원 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const endTime = duration && startTime ? addMinutes(startTime, duration) : null
  const endTimeExceedsClose = endTime ? endTime > '18:00' : false

  const toggleMember = (memberId: number) => {
    if (memberId === myMemberId) return // 신청자 본인은 항상 포함
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    )
  }

  const canSubmit =
    !!startTime && !!duration && !endTimeExceedsClose && selectedIds.length >= MIN_PARTICIPANTS && !submitting

  const handleSubmit = async () => {
    if (!roomId || !startTime || !duration || !endTime) return
    setSubmitting(true)
    setError(null)
    try {
      await createBooking({
        roomId: Number(roomId),
        startTime: `${dateKey}T${startTime}:00`,
        endTime: `${dateKey}T${endTime}:00`,
        memberIds: selectedIds,
      })
      navigate(`/rooms/${roomId}`, { replace: true })
    } catch (err) {
      setError(err instanceof BookingError ? err.message : '예약에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="new-booking-page">
      <header className="new-booking-header">
        <button type="button" className="back-button" onClick={() => navigate(`/rooms/${roomId}`)}>
          ← 뒤로
        </button>
        <h1>{room?.name ?? `회의실 ${roomId}`} 예약</h1>
      </header>

      <main className="new-booking-content">
        {isBeforeOpen ? (
          <p className="state-message is-error">
            오늘 예약은 08:30부터 신청할 수 있습니다.
          </p>
        ) : startOptions.length === 0 ? (
          <p className="state-message is-error">오늘은 더 이상 예약할 수 있는 시간대가 없습니다.</p>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <section className="form-section">
              <h2>시작 시간</h2>
              <div className="chip-grid">
                {startOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`chip ${startTime === opt ? 'is-selected' : ''}`}
                    onClick={() => setStartTime(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </section>

            <section className="form-section">
              <h2>사용 시간</h2>
              <div className="chip-grid">
                {DURATION_OPTIONS.map((d) => {
                  const candidateEnd = startTime ? addMinutes(startTime, d) : null
                  const disabled = !candidateEnd || candidateEnd > '18:00'
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`chip ${duration === d ? 'is-selected' : ''}`}
                      disabled={disabled}
                      onClick={() => setDuration(d)}
                    >
                      {d < 60 ? `${d}분` : `${Math.floor(d / 60)}시간${d % 60 ? ` ${d % 60}분` : ''}`}
                    </button>
                  )
                })}
              </div>
              {endTime && (
                <p className="time-summary">
                  {startTime} ~ {endTime}
                </p>
              )}
            </section>

            <section className="form-section">
              <h2>참여 인원 (최소 {MIN_PARTICIPANTS}명, 본인 포함)</h2>
              {rosterLoading && <p className="state-message">팀원 목록 불러오는 중...</p>}
              {rosterError && <p className="state-message is-error">{rosterError}</p>}
              {!rosterLoading && !rosterError && (
                <div className="member-grid">
                  {roster.map((m) => {
                    const isMe = m.memberId === myMemberId
                    const checked = selectedIds.includes(m.memberId)
                    return (
                      <label
                        key={m.memberId}
                        className={`member-chip ${checked ? 'is-selected' : ''} ${isMe ? 'is-self' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isMe}
                          onChange={() => toggleMember(m.memberId)}
                        />
                        {m.name}
                        {isMe && <span className="self-badge">본인</span>}
                      </label>
                    )
                  })}
                </div>
              )}
              <p className="participant-count">{selectedIds.length}명 선택됨</p>
            </section>

            <AnimatePresence>
              {error && (
                <motion.p
                  className="form-error"
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button type="button" className="submit-button" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? '예약 중...' : '예약하기'}
            </button>
          </motion.div>
        )}
      </main>
    </div>
  )
}
