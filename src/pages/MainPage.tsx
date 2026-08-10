import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getRooms, type Room } from '../api/rooms'
import { getMyTeamBookingsToday, describeBookingTiming, formatMinutes, type MyBookingEntry } from '../api/myBooking'
import './MainPage.css'

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(iso: string): string {
  return iso.slice(11, 16)
}

const roleLabel: Record<string, string> = {
  STUDENT: '수강생',
  TA: 'TA',
}

const statusLabel: Record<Room['status'], string> = {
  AVAILABLE: '사용 가능',
  OCCUPIED: '사용 중',
  LOCK: 'TA 업무 중',
}

export default function MainPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [myBookings, setMyBookings] = useState<MyBookingEntry[]>([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false

    const fetchRooms = () => {
      getRooms()
        .then((data) => {
          if (cancelled) return
          setRooms(data)
          setError(null)
          if (user?.role === 'STUDENT' && user.teamName) {
            getMyTeamBookingsToday(data, user.teamName, toDateKey(new Date()))
              .then((bookings) => {
                if (!cancelled) setMyBookings(bookings)
              })
              .catch(() => {})
          }
        })
        .catch(() => {
          if (!cancelled) setError('회의실 현황을 불러오지 못했습니다.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    fetchRooms()
    const pollTimer = setInterval(fetchRooms, 30_000)

    return () => {
      cancelled = true
      clearInterval(pollTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const upcomingOrOngoing = myBookings.find((b) => describeBookingTiming(b, now).phase !== 'past')

  return (
    <div className="main-page">
      <header className="main-header">
        <div className="main-brand">
          <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect x="2" y="6" width="15" height="28" rx="6" fill="var(--accent)" />
            <rect x="21" y="6" width="17" height="28" rx="6" fill="var(--accent)" opacity="0.45" />
            <circle cx="9.5" cy="20" r="3" fill="var(--accent-strong)" />
          </svg>
          <span>회의실 예약</span>
        </div>
        <div className="main-user">
          {user && (
            <button type="button" className="user-chip" onClick={() => navigate('/my-page')}>
              <span className="role-badge">{roleLabel[user.role] ?? user.role}</span>
              {user.name}님
            </button>
          )}
        </div>
      </header>

      <main className="main-content">
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <h1>환영합니다, {user?.name ?? '사용자'}님</h1>
          <p className="content-sub">지금 회의실 사용 현황을 확인하고 바로 예약해보세요.</p>
        </motion.div>

        {user?.role === 'STUDENT' && (
          <motion.article
            className="my-booking-banner"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45, ease: 'easeOut' }}
            onClick={() => navigate('/my-bookings')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate('/my-bookings')
            }}
          >
            {upcomingOrOngoing ? (
              (() => {
                const timing = describeBookingTiming(upcomingOrOngoing, now)
                return (
                  <>
                    <span className="banner-eyebrow">
                      {timing.phase === 'ongoing' ? '지금 진행 중' : '다음 예약'}
                    </span>
                    <h2>
                      {upcomingOrOngoing.roomName} · {formatTime(upcomingOrOngoing.startTime)}–
                      {formatTime(upcomingOrOngoing.endTime)}
                    </h2>
                    <p>
                      {timing.phase === 'ongoing'
                        ? `${formatMinutes(timing.minutes)} 후 종료`
                        : `${formatMinutes(timing.minutes)} 후 시작`}
                    </p>
                  </>
                )
              })()
            ) : (
              <>
                <span className="banner-eyebrow">내 팀 예약</span>
                <h2>오늘 예약된 회의가 없어요</h2>
                <p>빈 회의실을 골라서 새로 예약해보세요.</p>
              </>
            )}
            <span className="banner-link">내 예약 보기 →</span>
          </motion.article>
        )}

        {user?.role === 'TA' && (
          <motion.article
            className="my-booking-banner admin-banner"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45, ease: 'easeOut' }}
            onClick={() => navigate('/admin/teams')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate('/admin/teams')
            }}
          >
            <span className="banner-eyebrow">TA 관리</span>
            <h2>전체 팀 · 소속 학생 보기</h2>
            <p>팀 구성과 학생 명단을 한눈에 확인하세요.</p>
            <span className="banner-link">팀 관리 화면으로 →</span>
          </motion.article>
        )}

        {loading && <p className="state-message">불러오는 중...</p>}
        {error && <p className="state-message is-error">{error}</p>}

        {!loading && !error && (
          <section className="room-grid">
            {rooms.map((room, i) => (
              <motion.article
                key={room.id}
                className={`room-card status-${room.status.toLowerCase()}`}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.45, ease: 'easeOut' }}
                whileHover={reduceMotion ? undefined : { y: -4 }}
                onClick={() => navigate(`/rooms/${room.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/rooms/${room.id}`)
                }}
              >
                <div className="room-card-top">
                  <h2>{room.name}</h2>
                  <span className="status-pill">
                    <span className="status-dot" />
                    {statusLabel[room.status]}
                  </span>
                </div>
                <p className="room-detail">탭해서 오늘 예약 현황 보기</p>
              </motion.article>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
