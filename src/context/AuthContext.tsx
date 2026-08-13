import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthUser } from '../api/auth'
import { getMe, logout as apiLogout } from '../api/auth'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  setUser: (user: AuthUser) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'workspace-booking:user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const applyMe = (me: AuthUser | null) => {
    if (me) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(me))
      setUserState(me)
    } else {
      localStorage.removeItem(STORAGE_KEY)
      setUserState(null)
    }
  }

  useEffect(() => {
    getMe().then(applyMe).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') getMe().then(applyMe)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

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

  const value = useMemo(() => ({ user, loading, setUser, logout }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
