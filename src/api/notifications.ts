const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_V1 = `${API_BASE}/api/v1`

export class TelegramLinkError extends Error {}

export async function requestTelegramLink(): Promise<string> {
  const res = await fetch(`${API_V1}/members/me/telegram-link`, {
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
