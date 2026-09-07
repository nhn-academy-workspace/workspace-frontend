import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getRooms, getRoomBookings, type Room, type TimetableEntry } from '../api/rooms'
import {
  describeBookingTiming,
  describeRoomAvailability,
  formatMinutes,
  type MyBookingEntry,
} from '../api/myBooking'
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

  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [myBookings, setMyBookings] = useState<MyBookingEntry[]>([])
  const [entriesByRoom, setEntriesByRoom] = useState<Record<number, TimetableEntry[]>>({})
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false

    const fetchRooms = () => {
      getRooms()
        .then(async (data) => {
          if (cancelled) return
          setRooms(data)

          const key = toDateKey(new Date())
          const lists = await Promise.all(
            data.map((room) => getRoomBookings(room.id, key).then((entries) => [room, entries] as const)),
          )
          if (cancelled) return

          const byRoom: Record<number, TimetableEntry[]> = {}
          for (const [room, entries] of lists) byRoom[room.id] = entries
          setEntriesByRoom(byRoom)
          setError(null)

          if (user?.role === 'STUDENT' && user.teamName) {
            const mine = lists
              .flatMap(([room, entries]) =>
                entries
                  .filter((e) => e.type === 'BOOKING' && e.teamName === user.teamName)
                  .map((e) => ({ ...e, roomId: room.id, roomName: room.name })),
              )
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
            setMyBookings(mine)
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
        <Link to="/main" className="main-brand">
          <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect x="2" y="6" width="15" height="28" rx="6" fill="var(--accent)" />
            <rect x="21" y="6" width="17" height="28" rx="6" fill="var(--accent)" opacity="0.45" />
            <circle cx="9.5" cy="20" r="3" fill="var(--accent-strong)" />
          </svg>
          <span>회의실 예약</span>
        </Link>
        {user && (
          <button type="button" className="user-chip" onClick={() => navigate('/my-page')}>
            <span className="role-badge">{roleLabel[user.role] ?? user.role}</span>
            {user.name}
          </button>
        )}
      </header>

      <main className="main-content">
        <div className="fade-in">
          <h1>{user?.name ? `${user.name}님` : '회의실 예약'}</h1>
          {user?.teamName && <p className="content-sub">{user.teamName}</p>}
        </div>

        {user?.role === 'STUDENT' && (
          <article
            className="my-booking-banner fade-in"
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
                      {timing.phase === 'ongoing' ? '사용 중' : '다음 예약'}
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
                <h2>오늘 예약 없음</h2>
                <p>아래에서 회의실을 선택해 예약하세요.</p>
              </>
            )}
            <span className="banner-link">내 예약 →</span>
          </article>
        )}

        {user?.role === 'TA' && (
          <article
            className="my-booking-banner admin-banner fade-in"
            onClick={() => navigate('/admin/teams')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate('/admin/teams')
            }}
          >
            <span className="banner-eyebrow">팀 관리</span>
            <h2>팀 · 소속 학생</h2>
            <p>팀 구성, 학생 명단 확인</p>
            <span className="banner-link">팀 관리 화면으로 →</span>
          </article>
        )}

        {loading && <p className="state-message">불러오는 중</p>}
        {error && <p className="state-message is-error">{error}</p>}

        {!loading && !error && (
          <section className="room-grid">
            {rooms.map((room) => (
              <article
                key={room.id}
                className={`room-card status-${room.status.toLowerCase()}`}
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
                {(() => {
                  const avail = describeRoomAvailability(entriesByRoom[room.id] ?? [], now)
                  const detail =
                    avail.state === 'closed'
                      ? '오늘 운영 종료'
                      : avail.state === 'free'
                        ? avail.until
                          ? `${avail.until}까지 비어있음`
                          : '오늘 남은 시간 모두 가능'
                        : avail.state === 'lock'
                          ? `${avail.until}까지 TA 업무`
                          : `${avail.until}에 종료 예정`
                  return <p className={`room-detail state-${avail.state}`}>{detail}</p>
                })()}
              </article>
            ))}
          </section>
        )}

        <Link to="/game" className="game-link">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="4" width="14" height="8" rx="4" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4.5 8h2M5.5 7v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="10.5" cy="8" r="1" fill="currentColor" />
          </svg>
          대기 중 미니게임
        </Link>
      </main>
    </div>
  )
}
