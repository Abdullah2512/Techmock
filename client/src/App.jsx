import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Setup from './pages/Setup'
import Workspace from './pages/Workspace'
import Results from './pages/Results'
import History from './pages/History'
import Profile from './pages/Profile'

function RequireAuth({ children }) {
  const token = localStorage.getItem('tm_access')
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/setup" element={<RequireAuth><Setup /></RequireAuth>} />
          <Route path="/workspace/:id" element={<RequireAuth><Workspace /></RequireAuth>} />
          <Route path="/results/:id" element={<RequireAuth><Results /></RequireAuth>} />
          <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
