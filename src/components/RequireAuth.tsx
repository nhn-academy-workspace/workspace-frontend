import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null

  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (
    !user.telegramLinked &&
    !user.telegramLinkSkipped &&
    location.pathname !== '/my-page' &&
    location.pathname !== '/change-password'
  ) {
    return <Navigate to="/my-page" replace />
  }
  return <>{children}</>
}
