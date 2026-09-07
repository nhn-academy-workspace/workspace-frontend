import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, LoginError, resetPassword, PasswordResetError } from '../api/auth'
import { getRooms, type Room } from '../api/rooms'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

const roomStatusLabel: Record<Room['status'], string> = {
  AVAILABLE: '사용 가능',
  OCCUPIED: '사용 중',
  LOCK: 'TA 업무 중',
}

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
  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    let cancelled = false
    getRooms()
      .then((data) => {
        if (!cancelled) setRooms(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (rooms.length === 0) return null

  return (
    <div className="room-preview">
      {rooms.map((room) => {
        const busy = room.status !== 'AVAILABLE'
        return (
          <div key={room.id} className={`room-pill ${busy ? 'is-busy' : 'is-open'}`}>
            <span className="room-dot" />
            <span className="room-name">{room.name}</span>
            <span className="room-status">{roomStatusLabel[room.status]}</span>
          </div>
        )
      })}
    </div>
  )
}

type ResetStep = 'idle' | 'confirm' | 'loading' | 'success' | 'no-telegram' | 'error'

export default function LoginPage() {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [resetStep, setResetStep] = useState<ResetStep>('idle')

  const { setUser } = useAuth()
  const navigate = useNavigate()

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
      setFailCount((c) => c + 1)
    } finally {
      setSubmitting(false)
    }
  }

  const openResetConfirm = () => {
    if (!loginId.trim()) {
      setError('아이디를 먼저 입력해주세요.')
      return
    }
    setResetStep('confirm')
  }

  const handleResetConfirm = async () => {
    setResetStep('loading')
    try {
      await resetPassword(loginId)
      setResetStep('success')
    } catch (err) {
      if (err instanceof PasswordResetError && err.status === 422) {
        setResetStep('no-telegram')
      } else {
        setResetStep('error')
      }
    }
  }

  const closeReset = () => setResetStep('idle')

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="login-brand-inner fade-in">
          <div className="brand-mark"><BrandMark /></div>
          <h1>NHN Academy<br />회의실 예약</h1>
          <p className="brand-tagline">비어 있는 회의실을 확인하고 바로 예약하세요.</p>
          <RoomPreview />
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-form fade-in" onSubmit={handleSubmit}>
          <h2>로그인</h2>

          <div className="field">
            <label htmlFor="loginId">아이디 (학번)</label>
            <input
              id="loginId"
              name="loginId"
              type="text"
              autoComplete="username"
              placeholder="ATGG_03_000"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <div className="password-input">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
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
          </div>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          {failCount >= 1 && (
            <div className="reset-hint">
              <button type="button" className="reset-password-link" onClick={openResetConfirm}>
                비밀번호를 잊으셨나요?
              </button>
            </div>
          )}

          <button type="submit" className="submit-button" disabled={submitting}>
            {submitting ? <span className="spinner" aria-hidden="true" /> : '로그인'}
          </button>

          <p className="login-hint">계정은 담당 TA가 발급합니다. 별도의 회원가입은 없습니다.</p>
        </form>
      </section>

      {resetStep !== 'idle' && (
          <div
            className="reset-modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) closeReset() }}
          >
            <div className="reset-modal">
              {resetStep === 'confirm' && (
                <>
                  <h3 className="reset-modal-title">비밀번호 초기화</h3>
                  <p className="reset-modal-body">
                    <strong>{loginId}</strong> 계정의 비밀번호를 초기화합니다.
                  </p>
                  <p className="reset-modal-sub">
                    임시 비밀번호는 연동된 텔레그램으로 발송됩니다.
                  </p>
                  <div className="reset-modal-actions">
                    <button type="button" className="reset-modal-cancel" onClick={closeReset}>취소</button>
                    <button type="button" className="reset-modal-confirm" onClick={handleResetConfirm}>초기화</button>
                  </div>
                </>
              )}

              {resetStep === 'loading' && (
                <div className="reset-modal-loading">
                  <span className="spinner reset-spinner" aria-hidden="true" />
                  <p className="reset-modal-body">처리 중</p>
                </div>
              )}

              {resetStep === 'success' && (
                <>
                  <div className="reset-modal-icon success">✓</div>
                  <h3 className="reset-modal-title">전송 완료</h3>
                  <p className="reset-modal-body">
                    텔레그램으로 임시 비밀번호를 보냈습니다.
                  </p>
                  <p className="reset-modal-sub">
                    임시 비밀번호로 로그인한 뒤 새 비밀번호로 변경하세요.
                  </p>
                  <div className="reset-modal-actions">
                    <button type="button" className="reset-modal-confirm" onClick={closeReset}>확인</button>
                  </div>
                </>
              )}

              {resetStep === 'no-telegram' && (
                <>
                  <div className="reset-modal-icon warning">!</div>
                  <h3 className="reset-modal-title">텔레그램 미연동</h3>
                  <p className="reset-modal-body">
                    텔레그램이 연동되어 있지 않아 임시 비밀번호를 전송할 수 없습니다.
                  </p>
                  <p className="reset-modal-sub">
                    담당 TA에게 문의해 비밀번호를 초기화하세요.
                  </p>
                  <div className="reset-modal-actions">
                    <button type="button" className="reset-modal-confirm" onClick={closeReset}>확인</button>
                  </div>
                </>
              )}

              {resetStep === 'error' && (
                <>
                  <div className="reset-modal-icon warning">!</div>
                  <h3 className="reset-modal-title">초기화 실패</h3>
                  <p className="reset-modal-body">
                    아이디를 확인하거나 담당 TA에게 문의하세요.
                  </p>
                  <div className="reset-modal-actions">
                    <button type="button" className="reset-modal-cancel" onClick={() => setResetStep('confirm')}>다시 시도</button>
                    <button type="button" className="reset-modal-confirm" onClick={closeReset}>닫기</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
    </div>
  )
}
