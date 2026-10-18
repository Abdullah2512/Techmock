import { useEffect, useState } from 'react'
import api from '../api/client'
export default function Dashboard() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  useEffect(() => {
    api.get('/dashboard')
      .then(r => setState({ loading: false, error: '', data: r.data }))
      .catch(e => setState({ loading: false, error: e.response?.data?.error?.message || 'Failed to load', data: null }))
  }, [])
  if (state.loading) return <div>Loading dashboard...</div>
  if (state.error) return <div className="text-red-400">{state.error}</div>
  const d = state.data || {}
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 p-4 rounded"><div className="text-slate-400">Completed</div><div className="text-2xl">{d.completedInterviews ?? 0}</div></div>
        <div className="bg-slate-900 p-4 rounded"><div className="text-slate-400">Avg Score</div><div className="text-2xl">{d.averageScore ?? 0}</div></div>
        <div className="bg-slate-900 p-4 rounded"><div className="text-slate-400">Sessions</div><div className="text-2xl">{d.totalSessions ?? 0}</div></div>
      </div>
      <div className="bg-slate-900 p-4 rounded">
        <h2 className="font-semibold mb-2">Recent sessions</h2>
        {(d.recentSessions || []).length === 0 && <div className="text-slate-400">No recent sessions.</div>}
        {(d.recentSessions || []).map(s => <div key={s.id} className="py-1">{s.topic} - {s.status}</div>)}
      </div>
    </div>
  )
}
