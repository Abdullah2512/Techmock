import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
const topics = [
  ['dsa','Data Structures & Algorithms'],
  ['javascript','JavaScript'],
  ['react','React'],
  ['nodejs','Node.js'],
  ['python','Python'],
  ['sql','SQL'],
  ['system-design','System Design'],
]
const diffs = ['beginner','intermediate','advanced']
const modes = [{v:'coding',l:'Coding'},{v:'qa',l:'Technical Q&A'}]
const durations = [15,30,45,60]
export default function Setup() {
  const [topic,setTopic]=useState('dsa'); const [difficulty,setDifficulty]=useState('intermediate'); const [mode,setMode]=useState('coding'); const [duration,setDuration]=useState(30)
  const [err,setErr]=useState(''); const nav=useNavigate()
  const submit=async(e)=>{ e.preventDefault(); setErr('')
    try {
      const {data}=await api.post('/interviews',{topic,difficulty,mode,durationMinutes:duration})
      nav(`/workspace/${data.id||data.session?.id||data.interview?.id}`)
    } catch (ex) {
      const msg = ex.response?.data?.error?.message || ex.response?.data?.message || ex.message
      setErr(msg)
    }
  }
  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <h1 className="text-3xl font-bold">New Interview</h1>
      {err && <div className="text-red-400">{err}</div>}
      <select className="w-full p-2 bg-slate-800 rounded" value={topic} onChange={e=>setTopic(e.target.value)}>
        {topics.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <select className="w-full p-2 bg-slate-800 rounded" value={difficulty} onChange={e=>setDifficulty(e.target.value)}>
        {diffs.map(d=><option key={d} value={d}>{d}</option>)}
      </select>
      <select className="w-full p-2 bg-slate-800 rounded" value={mode} onChange={e=>setMode(e.target.value)}>
        {modes.map(m=><option key={m.v} value={m.v}>{m.l}</option>)}
      </select>
      <select className="w-full p-2 bg-slate-800 rounded" value={duration} onChange={e=>setDuration(+e.target.value)}>
        {durations.map(d=><option key={d} value={d}>{d}</option>)}
      </select>
      <button className="px-4 py-2 bg-brand-600 rounded">Create</button>
    </form>
  )
}
