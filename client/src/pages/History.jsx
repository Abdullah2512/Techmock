import { useEffect, useState } from 'react'
import api from '../api/client'
import { Link } from 'react-router-dom'
export default function History() {
  const [items, setItems] = useState([])
  useEffect(() => { api.get('/interviews').then(r=>setItems(r.data.items||[])).catch(()=>{}) }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">History</h1>
      {items.map(i => (
        <Link to={`/results/${i.id}`} key={i.id} className="block bg-slate-900 p-3 rounded">
          {i.topic} · {i.difficulty} · {i.status}
        </Link>
      ))}
      {items.length===0 && <div className="text-slate-400">No sessions yet.</div>}
    </div>
  )
}