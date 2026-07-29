import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AuthUser } from '../api/auth'
import { logout as apiLogout } from '../api/auth'

interface AuthContextValue {
  user: AuthUser | null
  setUser: (user: AuthUser) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'workspace-booking:user'

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() => readStoredUser())

  const setUser = (next: AuthUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setUserState(next)
  }

  const logout = async () => {
    try {
      await apiLogout()
    } finally {
      localStorage.removeItem(STORAGE_KEY)
      setUserState(null)
    }
  }

  const value = useMemo(() => ({ user, setUser, logout }), [user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
