import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getRooms, type Room } from '../api/rooms'
import './MainPage.css'

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
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getRooms()
      .then((data) => {
        if (!cancelled) setRooms(data)
      })
      .catch(() => {
        if (!cancelled) setError('회의실 현황을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

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
            <span className="user-chip">
              <span className="role-badge">{roleLabel[user.role] ?? user.role}</span>
              {user.name}님
            </span>
          )}
          <button type="button" className="logout-button" onClick={handleLogout}>
            로그아웃
          </button>
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
