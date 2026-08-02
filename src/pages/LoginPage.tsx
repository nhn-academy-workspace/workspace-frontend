import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { login, LoginError } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

function BrandMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="15" height="28" rx="6" fill="currentColor" opacity="0.9" />
      <rect x="21" y="6" width="17" height="28" rx="6" fill="currentColor" opacity="0.45" />
      <circle cx="9.5" cy="20" r="3" fill="var(--accent-strong)" />
    </svg>
  )
}

function RoomPreview() {
  const reduceMotion = useReducedMotion()

  const rooms = [
    { name: '회의실 1', status: '사용 가능', busy: false },
    { name: '회의실 2', status: '사용 중 · 13:00까지', busy: true },
  ]

  return (
    <div className="room-preview">
      {rooms.map((room, i) => (
        <motion.div
          key={room.name}
          className={`room-pill ${room.busy ? 'is-busy' : 'is-open'}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 + i * 0.12, duration: 0.5, ease: 'easeOut' }}
        >
          <span
            className="room-dot"
            style={
              room.busy && !reduceMotion
                ? { animation: 'pulse 2s ease-in-out infinite' }
                : undefined
            }
          />
          <span className="room-name">{room.name}</span>
          <span className="room-status">{room.status}</span>
        </motion.div>
      ))}
    </div>
  )
}

export default function LoginPage() {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { setUser } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!loginId || !password) {
      setError('아이디와 비밀번호를 모두 입력해주세요.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const user = await login(loginId, password)
      setUser(user)
      navigate(user.mustChangePassword ? '/change-password' : '/main', { replace: true })
    } catch (err) {
      setError(err instanceof LoginError ? err.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <motion.div
          className="login-brand-inner"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="brand-mark"><BrandMark /></div>
          <h1>NHN Academy<br />회의실 예약</h1>
          <p className="brand-tagline">
            담당 TA에게 물어보지 않아도,
            <br />
            바로 확인하고 예약하세요.
          </p>
          <RoomPreview />
        </motion.div>
      </section>

      <section className="login-form-panel">
        <motion.form
          className="login-form"
          onSubmit={handleSubmit}
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
          }}
        >
          <motion.h2
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          >
            로그인
          </motion.h2>
          <motion.p
            className="login-form-sub"
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          >
            부여받은 아이디와 비밀번호로 접속하세요.
          </motion.p>

          <motion.div
            className="field"
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          >
            <label htmlFor="loginId">아이디 (학번)</label>
            <input
              id="loginId"
              name="loginId"
              type="text"
              autoComplete="username"
              placeholder="예: 20260123"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              disabled={submitting}
            />
          </motion.div>

          <motion.div
            className="field"
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          >
            <label htmlFor="password">비밀번호</label>
            <div className="password-input">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="비밀번호 입력"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              >
                {showPassword ? '숨기기' : '표시'}
              </button>
            </div>
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div
                className="form-error"
                role="alert"
                initial={{ opacity: 0, height: 0 }}
                animate={
                  reduceMotion
                    ? { opacity: 1, height: 'auto' }
                    : { opacity: 1, height: 'auto', x: [0, -8, 8, -5, 5, 0] }
                }
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            className="submit-button"
            disabled={submitting}
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          >
            {submitting ? <span className="spinner" aria-hidden="true" /> : '로그인'}
          </motion.button>

          <motion.p
            className="login-hint"
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          >
            계정은 회원가입이 아닌, 담당 TA로부터 발급받은 아이디·비밀번호를 사용합니다.
          </motion.p>
        </motion.form>
      </section>
    </div>
  )
}
