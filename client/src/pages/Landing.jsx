import { Link } from 'react-router-dom'
export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="max-w-6xl mx-auto p-6 flex justify-between items-center">
        <div className="text-2xl font-bold">TechMock AI</div>
        <div className="space-x-3">
          <Link to="/login" className="px-4 py-2">Sign in</Link>
          <Link to="/register" className="px-4 py-2 bg-brand-600 rounded">Get started</Link>
        </div>
      </header>
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">AI-Powered Technical Interview Simulator</h1>
        <p className="text-slate-400 text-lg mb-8">Practice coding and technical questions with an AI interviewer.</p>
        <Link to="/register" className="px-6 py-3 bg-brand-600 rounded-lg">Start practicing</Link>
      </section>
    </div>
  )
}