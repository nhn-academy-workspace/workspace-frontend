import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { getRoomBookings, getRooms, type Room, type TimetableEntry } from '../api/rooms'
import './RoomTimetablePage.css'

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

export default function RoomTimetablePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [date, setDate] = useState(() => new Date())
  const [room, setRoom] = useState<Room | null>(null)
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dateKey = useMemo(() => toDateKey(date), [date])

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

  const shiftDay = (delta: number) => {
    setDate((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta)
      return next
    })
  }

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

        {loading && <p className="state-message">불러오는 중...</p>}
        {error && <p className="state-message is-error">{error}</p>}

        {!loading && !error && (
          <AnimatePresence mode="wait">
            {entries.length === 0 ? (
              <motion.p
                key="empty"
                className="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                이 날짜엔 예약된 일정이 없습니다.
              </motion.p>
            ) : (
              <motion.ul
                key={dateKey}
                className="entry-list"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
              >
                {entries.map((entry) => (
                  <motion.li
                    key={`${entry.type}-${entry.id}`}
                    className={`entry-card entry-${entry.type.toLowerCase()}`}
                    variants={{
                      hidden: { opacity: 0, x: reduceMotion ? 0 : -12 },
                      visible: { opacity: 1, x: 0 },
                    }}
                  >
                    <span className="entry-time">
                      {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                    </span>
                    <span className="entry-label">
                      {entry.type === 'BOOKING' ? `${entry.teamName} 사용` : `TA 업무 · ${entry.reason ?? '사유 없음'}`}
                    </span>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  )
}
