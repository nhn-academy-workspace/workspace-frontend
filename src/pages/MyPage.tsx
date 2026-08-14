import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { getTelegramLinkStatus, requestTelegramLink } from '../api/notifications'
import './MyPage.css'

const roleLabel: Record<string, string> = {
  STUDENT: '수강생',
  TA: 'TA',
}

export default function MyPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [telegramLinking, setTelegramLinking] = useState(false)
  const [telegramLinkError, setTelegramLinkError] = useState<string | null>(null)
  const [telegramLinked, setTelegramLinked] = useState(false)

  useEffect(() => {
    let cancelled = false
    const checkStatus = () => {
      getTelegramLinkStatus().then((linked) => {
        if (!cancelled) setTelegramLinked(linked)
      })
    }
    checkStatus()
    window.addEventListener('focus', checkStatus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', checkStatus)
    }
  }, [])

  const handleTelegramLink = async () => {
    setTelegramLinking(true)
    setTelegramLinkError(null)
    try {
      const deepLink = await requestTelegramLink()
      window.open(deepLink, '_blank', 'noopener,noreferrer')
    } catch {
      setTelegramLinkError('텔레그램 연동에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setTelegramLinking(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="my-page">
      <header className="my-page-header">
        <Link to="/main" className="header-brand">
          <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect x="2" y="6" width="15" height="28" rx="6" fill="var(--accent)" />
            <rect x="21" y="6" width="17" height="28" rx="6" fill="var(--accent)" opacity="0.45" />
            <circle cx="9.5" cy="20" r="3" fill="var(--accent-strong)" />
          </svg>
          <span>회의실 예약</span>
        </Link>
        <button type="button" className="back-button" onClick={() => navigate(-1)}>
          ← 뒤로
        </button>
        <h1>마이페이지</h1>
      </header>

      <main className="my-page-content">
        <motion.div
          className="my-page-sections"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <section className="my-section">
            <div className="my-profile">
              <div className="my-profile-name">
                <span className="role-badge">{roleLabel[user?.role ?? ''] ?? user?.role}</span>
                <span className="profile-name">{user?.name}님</span>
              </div>
              {user?.teamName && <span className="profile-team">{user.teamName}</span>}
            </div>
          </section>

          <section className="my-section">
            <h2 className="section-title">텔레그램 알림</h2>
            {telegramLinked ? (
              <p className="telegram-linked">연동 완료</p>
            ) : (
              <>
                <p className="section-desc">예약 알림을 텔레그램으로 받으려면 연동해주세요.</p>
                {telegramLinkError && <p className="my-error">{telegramLinkError}</p>}
                <button
                  type="button"
                  className="my-action-button"
                  onClick={handleTelegramLink}
                  disabled={telegramLinking}
                >
                  {telegramLinking ? '연동 중...' : '텔레그램 연동하기'}
                </button>
              </>
            )}
          </section>

          <section className="my-section">
            <h2 className="section-title">계정</h2>
            <button
              type="button"
              className="my-nav-item"
              onClick={() => navigate('/change-password')}
            >
              비밀번호 변경
              <span className="nav-arrow">→</span>
            </button>
          </section>

          <section className="my-section">
            <button type="button" className="my-logout-button" onClick={handleLogout}>
              로그아웃
            </button>
          </section>
        </motion.div>
      </main>
    </div>
  )
}
