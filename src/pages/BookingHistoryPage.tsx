import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { getMyTeamRoster } from '../api/teams'
import { getTeamBookingHistory, type TeamBookingHistoryEntry, type TeamBookingStatus } from '../api/teamHistory'
import './BookingHistoryPage.css'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

const statusLabel: Record<TeamBookingStatus, string> = {
  BOOKED: '예약됨',
  CANCELLED: '취소됨',
  EARLY_RETURNED: '조기 반납',
  COMPLETED: '완료',
}

function dateKeyOf(iso: string): string {
  return iso.slice(0, 10)
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${m}월 ${d}일 (${WEEKDAY[date.getDay()]})`
}

function formatTime(iso: string): string {
  return iso.slice(11, 16)
}

function groupByDate(entries: TeamBookingHistoryEntry[]): [string, TeamBookingHistoryEntry[]][] {
  const groups: [string, TeamBookingHistoryEntry[]][] = []
  for (const entry of entries) {
    const key = dateKeyOf(entry.startTime)
    const last = groups[groups.length - 1]
    if (last && last[0] === key) {
      last[1].push(entry)
    } else {
      groups.push([key, [entry]])
    }
  }
  return groups
}

export default function BookingHistoryPage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [entries, setEntries] = useState<TeamBookingHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getMyTeamRoster()
      .then((roster) => {
        if (cancelled) return
        if (!roster.teamId) {
          setError('팀 정보를 불러오지 못했습니다.')
          return
        }
        return getTeamBookingHistory(roster.teamId).then((data) => {
          if (!cancelled) setEntries(data)
        })
      })
      .catch(() => {
        if (!cancelled) setError('예약 이력을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const groups = groupByDate(entries)

  return (
    <div className="booking-history-page">
      <header className="booking-history-header">
        <button type="button" className="back-button" onClick={() => navigate('/my-bookings')}>
          ← 뒤로
        </button>
        <h1>예약 이력</h1>
      </header>

      <main className="booking-history-content">
        {loading && <p className="state-message">불러오는 중...</p>}
        {error && <p className="state-message is-error">{error}</p>}

        {!loading && !error && entries.length === 0 && (
          <p className="state-message">아직 예약 이력이 없어요.</p>
        )}

        {!loading &&
          !error &&
          groups.map(([dateKey, dayEntries], gi) => (
            <section key={dateKey} className="history-group">
              <h2 className="history-date">{formatDateLabel(dateKey)}</h2>
              <div className="history-list">
                {dayEntries.map((entry, i) => (
                  <motion.article
                    key={entry.bookingId}
                    className={`history-card status-${entry.status.toLowerCase()}`}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (gi * 3 + i) * 0.03, duration: 0.3, ease: 'easeOut' }}
                  >
                    <div className="history-card-top">
                      <h3>{entry.roomName}</h3>
                      <span className="history-status-pill">{statusLabel[entry.status]}</span>
                    </div>
                    <p className="history-time">
                      {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                    </p>
                    {entry.originalStartTime && entry.originalEndTime && (
                      <p className="history-adjusted">
                        조정됨 · 원래 {formatTime(entry.originalStartTime)}–{formatTime(entry.originalEndTime)}
                      </p>
                    )}
                  </motion.article>
                ))}
              </div>
            </section>
          ))}
      </main>
    </div>
  )
}
