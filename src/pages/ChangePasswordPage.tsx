import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { changePassword, PasswordChangeError } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import './ChangePasswordPage.css'

export default function ChangePasswordPage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const forced = user?.mustChangePassword ?? false

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('모든 항목을 입력해주세요.')
      return
    }
    if (newPassword.length < 8) {
      setError('새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPassword === currentPassword) {
      setError('현재 비밀번호와 다른 비밀번호를 입력해주세요.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 서로 일치하지 않습니다.')
      return
    }

    setSubmitting(true)
    try {
      const mustChangePassword = await changePassword(currentPassword, newPassword)
      if (user) {
        setUser({ ...user, mustChangePassword })
      }
      navigate('/main', { replace: true })
    } catch (err) {
      setError(err instanceof PasswordChangeError ? err.message : '비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="change-password-page">
      <header className="change-password-header">
        {!forced && (
          <button type="button" className="back-button" onClick={() => navigate(-1)}>
            ← 뒤로
          </button>
        )}
        <h1>비밀번호 변경</h1>
      </header>

      <main className="change-password-content">
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {forced && (
            <p className="change-password-notice">
              처음 로그인하셨네요! 발급받은 임시 비밀번호를 계속 쓰기 전에, 원하는 비밀번호로 바꿔주세요.
            </p>
          )}

          <form className="change-password-form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="currentPassword">현재 비밀번호</label>
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="field">
              <label htmlFor="newPassword">새 비밀번호</label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="8자 이상"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="field">
              <label htmlFor="confirmPassword">새 비밀번호 확인</label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="submit-button" disabled={submitting}>
              {submitting ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        </motion.div>
      </main>
    </div>
  )
}
