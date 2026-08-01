import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { getAdminTeams, type AdminTeam } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import './AdminTeamsPage.css'

export default function AdminTeamsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const reduceMotion = useReducedMotion()

  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user?.role !== 'TA') {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    getAdminTeams()
      .then((data) => {
        if (!cancelled) setTeams(data)
      })
      .catch(() => {
        if (!cancelled) setError('팀 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.role])

  return (
    <div className="admin-teams-page">
      <header className="admin-teams-header">
        <button type="button" className="back-button" onClick={() => navigate('/main')}>
          ← 뒤로
        </button>
        <h1>전체 팀 관리</h1>
      </header>

      <main className="admin-teams-content">
        {user?.role !== 'TA' ? (
          <p className="state-message is-error">TA 계정만 접근할 수 있습니다.</p>
        ) : (
          <>
            {loading && <p className="state-message">불러오는 중...</p>}
            {error && <p className="state-message is-error">{error}</p>}

            {!loading && !error && teams.length === 0 && (
              <p className="state-message">등록된 팀이 없어요.</p>
            )}

            {!loading && !error && teams.length > 0 && (
              <div className="admin-teams-list">
                {teams.map((team, i) => (
                  <motion.section
                    key={team.teamId}
                    className="admin-team-card"
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.35, ease: 'easeOut' }}
                  >
                    <div className="admin-team-top">
                      <h2>{team.name}</h2>
                      <span className="admin-team-count">{team.members.length}명</span>
                    </div>

                    {team.members.length === 0 ? (
                      <p className="admin-team-empty">소속 학생이 없어요.</p>
                    ) : (
                      <ul className="admin-member-list">
                        {team.members.map((m) => (
                          <li key={m.memberId}>
                            <span className="admin-member-name">{m.name}</span>
                            <span className="admin-member-login">{m.loginId}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
