import { apiFetch } from './client'

export interface ScoreEntry {
  memberName: string
  teamName: string
  score: number
}

export async function submitScore(score: number): Promise<void> {
  const res = await apiFetch('/api/game/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score }),
  })
  if (!res.ok) throw new Error('submit failed')
}

export async function getTopScores(): Promise<ScoreEntry[]> {
  const res = await apiFetch('/api/game/scores/top')
  if (!res.ok) return []
  return res.json()
}
