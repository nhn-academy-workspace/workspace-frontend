import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { getRoomBookings, getRooms, type Room, type TimetableEntry } from '../api/rooms'
import './RoomTimetablePage.css'

const START_HOUR = 9
const END_HOUR = 18
const HOUR_HEIGHT = 56 // px
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function formatDateLabel(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY[date.getDay()]})`
}

function formatTime(iso: string): string {
  return iso.slice(11, 16)
}

// 자정 기준 분 단위로 변환 (같은 날짜 문자열 안에서 시:분만 사용)
function minutesOfDay(iso: string): number {
  const h = Number(iso.slice(11, 13))
  const m = Number(iso.slice(14, 16))
  return h * 60 + m
}

function offsetFromStart(minutes: number): number {
  return minutes - START_HOUR * 60
}

function entryLabel(entry: TimetableEntry): string {
  return entry.type === 'BOOKING' ? `${entry.teamName} 사용` : `TA 업무 · ${entry.reason ?? '사유 없음'}`
}

export default function RoomTimetablePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [date, setDate] = useState(() => new Date())
  const [room, setRoom] = useState<Room | null>(null)
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const dateKey = useMemo(() => toDateKey(date), [date])
  const isToday = dateKey === toDateKey(now)

  useEffect(() => {
    if (!roomId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([getRooms(), getRoomBookings(Number(roomId), dateKey)])
      .then(([rooms, bookings]) => {
        if (cancelled) return
        setRoom(rooms.find((r) => r.id === Number(roomId)) ?? null)
        setEntries([...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime)))
      })
      .catch(() => {
        if (!cancelled) setError('예약 현황을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [roomId, dateKey])

  // 현재 시각 표시선을 위해 1분마다 갱신
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const shiftDay = (delta: number) => {
    setDate((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta)
      return next
    })
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowInRange = isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60
  const nowTop = nowInRange ? (offsetFromStart(nowMinutes) / 60) * HOUR_HEIGHT : null

  const currentEntry = nowInRange
    ? entries.find((e) => {
        const s = offsetFromStart(minutesOfDay(e.startTime))
        const en = offsetFromStart(minutesOfDay(e.endTime))
        return offsetFromStart(nowMinutes) >= s && offsetFromStart(nowMinutes) < en
      })
    : undefined

  const currentCaption = !nowInRange
    ? null
    : currentEntry
      ? `지금 ${entryLabel(currentEntry)} 중`
      : '지금 비어있음'

  return (
    <div className="timetable-page">
      <header className="timetable-header">
        <button type="button" className="back-button" onClick={() => navigate('/main')}>
          ← 뒤로
        </button>
        <h1>{room?.name ?? `회의실 ${roomId}`}</h1>
      </header>

      <main className="timetable-content">
        <div className="date-nav">
          <button type="button" onClick={() => shiftDay(-1)} aria-label="이전 날짜">
            ‹
          </button>
          <span className="date-label">{formatDateLabel(date)}</span>
          <button type="button" onClick={() => shiftDay(1)} aria-label="다음 날짜">
            ›
          </button>
        </div>

        {currentCaption && <p className="current-caption">{currentCaption}</p>}

        {loading && <p className="state-message">불러오는 중...</p>}
        {error && <p className="state-message is-error">{error}</p>}

        {!loading && !error && (
          <>
            <div className="timeline" style={{ height: TOTAL_HEIGHT }}>
              {HOURS.map((h, i) => (
                <div key={h} className="hour-row" style={{ top: i * HOUR_HEIGHT }}>
                  <span className="hour-label">{h}:00</span>
                  <span className="hour-line" />
                </div>
              ))}

              <div className="timeline-blocks">
                {entries.map((entry, i) => {
                  const startOffset = offsetFromStart(minutesOfDay(entry.startTime))
                  const endOffset = offsetFromStart(minutesOfDay(entry.endTime))
                  const top = (startOffset / 60) * HOUR_HEIGHT
                  const height = Math.max(((endOffset - startOffset) / 60) * HOUR_HEIGHT, 20)

                  return (
                    <motion.div
                      key={`${entry.type}-${entry.id}`}
                      className={`timeline-block entry-${entry.type.toLowerCase()}`}
                      style={{ top, height }}
                      initial={{ opacity: 0, scaleY: reduceMotion ? 1 : 0.6 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}
                    >
                      <span className="block-time">
                        {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                      </span>
                      <span className="block-label">{entryLabel(entry)}</span>
                    </motion.div>
                  )
                })}
              </div>

              {nowTop !== null && (
                <div className="now-line" style={{ top: nowTop }}>
                  <span className="now-dot" />
                  <span className="now-time">
                    {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>

            {entries.length === 0 && <p className="empty-state">이 날짜엔 예약된 일정이 없습니다.</p>}
          </>
        )}
      </main>
    </div>
  )
}
