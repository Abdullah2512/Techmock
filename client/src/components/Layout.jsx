import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, Plus, History, User, LogOut } from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-60 border-r border-slate-800 p-4 hidden md:block">
        <div className="text-xl font-bold mb-6">TechMock AI</div>
        <nav className="space-y-1">
          {[
            ['/dashboard', 'Dashboard', LayoutDashboard],
            ['/setup', 'New Interview', Plus],
            ['/history', 'History', History],
            ['/profile', 'Profile', User],
          ].map(([to, label, Icon]) => (
            <Link key={to} to={to} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-800">
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
        <button onClick={() => { logout(); nav('/') }} className="mt-6 flex items-center gap-2 text-slate-400 hover:text-white">
          <LogOut size={18} /> Logout
        </button>
      </aside>
      <main className="flex-1 p-6"><Outlet /></main>
    </div>
  )
}
