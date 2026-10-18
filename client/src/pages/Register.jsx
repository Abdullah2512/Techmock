import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    try { await register(name, email, password); nav('/dashboard') } catch { setErr('Registration failed') }
  }
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <form onSubmit={submit} className="bg-slate-900 p-8 rounded-xl w-96 space-y-4">
        <h2 className="text-2xl font-bold">Create account</h2>
        {err && <div className="text-red-400">{err}</div>}
        <input className="w-full p-2 rounded bg-slate-800" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <input className="w-full p-2 rounded bg-slate-800" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full p-2 rounded bg-slate-800" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="w-full py-2 bg-brand-600 rounded">Register</button>
        <Link to="/login" className="text-sm text-slate-400">Sign in</Link>
      </form>
    </div>
  )
}