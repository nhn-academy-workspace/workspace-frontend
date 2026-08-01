import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'
import RoomTimetablePage from './pages/RoomTimetablePage'
import MyBookingsPage from './pages/MyBookingsPage'
import BookingHistoryPage from './pages/BookingHistoryPage'
import AdminTeamsPage from './pages/AdminTeamsPage'
import { RequireAuth } from './components/RequireAuth'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/main"
        element={
          <RequireAuth>
            <MainPage />
          </RequireAuth>
        }
      />
      <Route
        path="/rooms/:roomId"
        element={
          <RequireAuth>
            <RoomTimetablePage />
          </RequireAuth>
        }
      />
      <Route
        path="/my-bookings"
        element={
          <RequireAuth>
            <MyBookingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/bookings/history"
        element={
          <RequireAuth>
            <BookingHistoryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/teams"
        element={
          <RequireAuth>
            <AdminTeamsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
