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

export async function createGameSession(): Promise<string> {
  const res = await apiFetch('/api/v1/game/sessions', { method: 'POST' })
  if (!res.ok) throw new Error('session create failed')
  const data = await res.json()
  return data.sessionId as string
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
