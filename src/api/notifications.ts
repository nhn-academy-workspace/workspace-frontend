import { apiFetch } from './client'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export class TelegramLinkError extends Error {}

export async function requestTelegramLink(): Promise<string> {
  const res = await apiFetch(`${API_V1}/members/me/telegram-link`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new TelegramLinkError(body?.message ?? '텔레그램 연동에 실패했습니다.')
  }

  const data: { deepLink: string } = await res.json()
  return data.deepLink
}

export async function getTelegramLinkStatus(): Promise<boolean> {
  const res = await apiFetch(`${API_V1}/members/me/telegram-link`, {
    credentials: 'include',
  })

  if (!res.ok) {
    return false
  }

  const data: { linked: boolean } = await res.json()
  return data.linked
}
