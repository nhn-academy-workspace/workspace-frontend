import { apiFetch } from './client'

export interface ScoreEntry {
  memberName: string
  teamName: string
  score: number
}

export interface PlayCountEntry {
  memberName: string
  teamName: string
  playCount: number
}

export interface TeamScoreEntry {
  teamName: string
  avgScore: number
}

export interface GameSession {
  sessionId: string
  /** 서버가 지정한 하트비트 주기(ms). 이 간격을 지키지 않으면 세션이 무효화된다. */
  beatIntervalMs: number
}

export async function createGameSession(): Promise<GameSession> {
  const res = await apiFetch('/api/v1/game/sessions', { method: 'POST' })
  if (!res.ok) throw new Error('session create failed')
  const data = await res.json()
  return {
    sessionId: data.sessionId as string,
    beatIntervalMs: (data.beatIntervalMs as number) ?? 5000,
  }
}

/** 플레이 중 진행 상황 보고. 실패하면 세션이 무효화된 것이므로 제출을 포기해야 한다. */
export async function sendBeat(sessionId: string, score: number): Promise<void> {
  const res = await apiFetch(`/api/v1/game/sessions/${sessionId}/beat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score }),
  })
  if (!res.ok) throw new Error('beat rejected')
}

export async function submitScore(sessionId: string, score: number): Promise<void> {
  const res = await apiFetch('/api/v1/game/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, score }),
  })
  if (!res.ok) throw new Error('submit failed')
}

export async function getTopScores(): Promise<ScoreEntry[]> {
  const res = await apiFetch('/api/v1/game/scores/top')
  if (!res.ok) return []
  return res.json()
}

export async function getTodayTopScores(): Promise<ScoreEntry[]> {
  const res = await apiFetch('/api/v1/game/scores/today')
  if (!res.ok) return []
  return res.json()
}

export async function getPlayCountRanking(): Promise<PlayCountEntry[]> {
  const res = await apiFetch('/api/v1/game/play-count')
  if (!res.ok) return []
  return res.json()
}

export async function getTeamRanking(): Promise<TeamScoreEntry[]> {
  const res = await apiFetch('/api/v1/game/scores/teams')
  if (!res.ok) return []
  return res.json()
}
