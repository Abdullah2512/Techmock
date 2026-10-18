import { useEffect, useState } from 'react'
import api from '../api/client'
export default function Profile() {
  const [p, setP] = useState(null)
  useEffect(() => { api.get('/profile').then(r=>setP(r.data)).catch(()=>{}) }, [])
  if (!p) return <div>Loading...</div>
  return <div className="space-y-2"><h1 className="text-3xl font-bold">Profile</h1><pre className="bg-slate-900 p-4 rounded">{JSON.stringify(p,null,2)}</pre></div>
}