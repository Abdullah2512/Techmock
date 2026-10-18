import { useEffect, useState } from 'react'
import { useParams as useP } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import api from '../api/client'
export default function Workspace() {
  const { id } = useP()
  const [session, setSession] = useState(null)
  const [code, setCode] = useState('// write code')
  const [lang, setLang] = useState('javascript')
  const [output, setOutput] = useState('')
  useEffect(() => { api.get(`/interviews/${id}`).then(r=>setSession(r.data)) }, [id])
  const run = async () => {
    const {data}=await api.post(`/interviews/${id}/run`, { sourceCode: code, language: lang })
    setOutput(JSON.stringify(data, null, 2))
  }
  const submit = async () => {
    await api.post(`/interviews/${id}/submit`, { sourceCode: code, language: lang })
    window.location.href = `/results/${id}`
  }
  return (
    <div className="grid grid-cols-2 gap-4 h-[80vh]">
      <div className="bg-slate-900 p-4 rounded overflow-auto">
        <h2 className="font-bold mb-2">{session?.topic}</h2>
        <pre className="whitespace-pre-wrap text-sm">{session?.question?.prompt || 'Loading...'}</pre>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <select value={lang} onChange={e=>setLang(e.target.value)} className="bg-slate-800 p-1 rounded">
            <option>javascript</option><option>python</option><option>java</option><option>cpp</option>
          </select>
          <button onClick={run} className="px-3 py-1 bg-slate-700 rounded">Run</button>
          <button onClick={submit} className="px-3 py-1 bg-brand-600 rounded">Submit</button>
        </div>
        <Editor height="50%" theme="vs-dark" language={lang} value={code} onChange={setCode} />
        <pre className="bg-black p-2 rounded h-1/3 overflow-auto text-xs">{output}</pre>
      </div>
    </div>
  )
}