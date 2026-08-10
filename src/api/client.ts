const STORAGE_KEY = 'workspace-booking:user'

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    localStorage.removeItem(STORAGE_KEY)
    window.location.replace('/login')
  }
  return res
}
