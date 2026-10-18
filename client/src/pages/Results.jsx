import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/client'
export default function Results() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  useEffect(() => { api.get(`/interviews/${id}/report`).then(r=>setReport(r.data.report||r.data)).catch(()=>{}) }, [id])
  if (!report) return <div>Loading...</div>
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Report</h1>
      <div className="text-4xl font-bold text-brand-400">{report.total_score ?? report.totalScore}</div>
      <div className="bg-slate-900 p-4 rounded"><pre className="text-sm">{JSON.stringify(report, null, 2)}</pre></div>
    </div>
  )
}