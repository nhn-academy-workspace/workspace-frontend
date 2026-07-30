import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'
import RoomTimetablePage from './pages/RoomTimetablePage'
import NewBookingPage from './pages/NewBookingPage'
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
        path="/rooms/:roomId/book"
        element={
          <RequireAuth>
            <NewBookingPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
