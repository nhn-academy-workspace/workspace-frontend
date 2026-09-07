import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminTeams, changeMemberTeam, callTarget, resetMemberPassword, type AdminTeam } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import './AdminTeamsPage.css'

interface ResetConfirmTarget {
  memberId: number
  name: string
}

export default function AdminTeamsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [reassignTarget, setReassignTarget] = useState<Record<number, number>>({})
  const [reassigning, setReassigning] = useState<number | null>(null)
  const [reassignError, setReassignError] = useState<string | null>(null)

  const [calling, setCalling] = useState<string | null>(null)
  const [callError, setCallError] = useState<string | null>(null)

  const [resetConfirm, setResetConfirm] = useState<ResetConfirmTarget | null>(null)
  const [resetting, setResetting] = useState<number | null>(null)
  const [resetResult, setResetResult] = useState<{ name: string; tempPassword: string } | null>(null)

  const fetchTeams = () => {
    setLoading(true)
    setError(null)
    return getAdminTeams()
      .then((data) => setTeams(data))
      .catch(() => setError('팀 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user?.role !== 'TA') {
      setLoading(false)
      return
    }
    fetchTeams()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role])

  const handleReassign = async (memberId: number, teamId: number) => {
    setReassigning(memberId)
    setReassignError(null)
    try {
      await changeMemberTeam(memberId, teamId)
      await fetchTeams()
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : '팀 재배정에 실패했습니다.')
    } finally {
      setReassigning(null)
    }
  }

  const handleCall = async (targetType: 'MEMBER' | 'TEAM', targetId: number, label: string) => {
    const message = window.prompt(`${label}에게 보낼 메시지`, '회의실로 와 주세요.')
    if (!message) return
    const callKey = `${targetType}-${targetId}`
    setCalling(callKey)
    setCallError(null)
    try {
      await callTarget(targetType, targetId, message)
      window.alert('호출했습니다.')
    } catch (err) {
      setCallError(err instanceof Error ? err.message : '호출에 실패했습니다.')
    } finally {
      setCalling(null)
    }
  }

  const handleResetConfirm = async () => {
    if (!resetConfirm) return
    const { memberId, name } = resetConfirm
    setResetConfirm(null)
    setResetting(memberId)
    try {
      const tempPassword = await resetMemberPassword(memberId)
      setResetResult({ name, tempPassword })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '비밀번호 초기화에 실패했습니다.')
    } finally {
      setResetting(null)
    }
  }

  return (
    <div className="admin-teams-page">
      <header className="admin-teams-header">
        <button type="button" className="back-button" onClick={() => navigate('/main')}>
          ← 뒤로
        </button>
        <h1>팀 관리</h1>
      </header>

      <main className="admin-teams-content">
        {user?.role !== 'TA' ? (
          <p className="state-message is-error">TA 계정만 접근할 수 있습니다.</p>
        ) : (
          <>
            {loading && <p className="state-message">불러오는 중</p>}
            {error && <p className="state-message is-error">{error}</p>}

            {!loading && !error && teams.length === 0 && (
              <p className="state-message">등록된 팀이 없습니다.</p>
            )}

            {reassignError && <p className="state-message is-error">{reassignError}</p>}
            {callError && <p className="state-message is-error">{callError}</p>}

            {!loading && !error && teams.length > 0 && (
              <div className="admin-teams-list">
                {teams.map((team) => (
                  <section key={team.teamId} className="admin-team-card fade-in">
                    <div className="admin-team-top">
                      <h2>{team.name}</h2>
                      <span className="admin-team-count">{team.members.length}명</span>
                      <button
                        type="button"
                        className="admin-call-button"
                        disabled={calling === `TEAM-${team.teamId}`}
                        onClick={() => handleCall('TEAM', team.teamId, team.name)}
                      >
                        팀 호출
                      </button>
                    </div>

                    {team.members.length === 0 ? (
                      <p className="admin-team-empty">소속 학생이 없습니다.</p>
                    ) : (
                      <ul className="admin-member-list">
                        {team.members.map((m) => {
                          const target = reassignTarget[m.memberId] ?? team.teamId
                          return (
                            <li key={m.memberId}>
                              <div className="admin-member-info">
                                <span className="admin-member-name">{m.name}</span>
                                <span className="admin-member-login">{m.loginId}</span>
                              </div>
                              <select
                                className="admin-reassign-select"
                                value={target}
                                onChange={(e) =>
                                  setReassignTarget((prev) => ({ ...prev, [m.memberId]: Number(e.target.value) }))
                                }
                                disabled={reassigning === m.memberId}
                              >
                                {teams.map((t) => (
                                  <option key={t.teamId} value={t.teamId}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="admin-reassign-button"
                                disabled={target === team.teamId || reassigning === m.memberId}
                                onClick={() => handleReassign(m.memberId, target)}
                              >
                                {reassigning === m.memberId ? '이동 중' : '이동'}
                              </button>
                              <button
                                type="button"
                                className="admin-call-button"
                                disabled={calling === `MEMBER-${m.memberId}`}
                                onClick={() => handleCall('MEMBER', m.memberId, m.name)}
                              >
                                호출
                              </button>
                              <button
                                type="button"
                                className="admin-reset-pw-button"
                                disabled={resetting === m.memberId}
                                onClick={() => setResetConfirm({ memberId: m.memberId, name: m.name })}
                              >
                                {resetting === m.memberId ? '초기화 중' : '비밀번호 초기화'}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* 비밀번호 초기화 확인 모달 */}
      {resetConfirm && (
          <div
            className="admin-modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) setResetConfirm(null) }}
          >
            <div className="admin-modal">
              <h3 className="admin-modal-title">비밀번호 초기화</h3>
              <p className="admin-modal-body">
                <strong>{resetConfirm.name}</strong> 학생의 비밀번호를 초기화합니다.
              </p>
              <p className="admin-modal-sub">
                임시 비밀번호가 화면에 표시됩니다. 학생에게 직접 전달하세요.
              </p>
              <div className="admin-modal-actions">
                <button type="button" className="admin-modal-cancel" onClick={() => setResetConfirm(null)}>취소</button>
                <button type="button" className="admin-modal-confirm" onClick={handleResetConfirm}>초기화</button>
              </div>
            </div>
          </div>
        )}

      {/* 초기화 결과 모달 */}
      {resetResult && (
          <div className="admin-modal-overlay">
            <div className="admin-modal">
              <div className="admin-modal-icon success">✓</div>
              <h3 className="admin-modal-title">초기화 완료</h3>
              <p className="admin-modal-body">
                <strong>{resetResult.name}</strong> 학생의 임시 비밀번호입니다.
              </p>
              <div className="admin-temp-password">{resetResult.tempPassword}</div>
              <p className="admin-modal-sub">
                학생에게 전달하고, 로그인 후 비밀번호를 변경하도록 안내하세요.
              </p>
              <div className="admin-modal-actions">
                <button type="button" className="admin-modal-confirm" onClick={() => setResetResult(null)}>확인</button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
