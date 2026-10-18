import { createContext, useContext, useState } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('tm_user')
    return u ? JSON.parse(u) : null
  })
  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('tm_access', data.accessToken)
    localStorage.setItem('tm_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }
  const register = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password })
    localStorage.setItem('tm_access', data.accessToken)
    localStorage.setItem('tm_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }
  const logout = async () => {
    try { await api.post('/auth/logout') } catch {}
    localStorage.removeItem('tm_access'); localStorage.removeItem('tm_user'); setUser(null)
  }
  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
