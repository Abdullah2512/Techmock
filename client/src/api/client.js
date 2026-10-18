import axios from 'axios'
const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
export const api = axios.create({ baseURL: base, withCredentials: true })
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('tm_access')
  if (t) c.headers.Authorization = `Bearer ${t}`
  return c
})
export default api
