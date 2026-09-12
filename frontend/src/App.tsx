import { useEffect, useState } from 'react'
import { UploadForm } from './components/UploadForm'
import { JobList } from './components/JobList'
import { JobDetail } from './components/JobDetail'
import { StoragePanel } from './components/StoragePanel'
import { API_URL, API_KEY } from './config'
import type { TranscriptJob } from './types'

function App() {
  const [jobs, setJobs] = useState<TranscriptJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fetchJobs = async () => {
    const res = await fetch(`${API_URL}/jobs`, { headers: { 'x-api-key': API_KEY } })
    const data = await res.json()
    setJobs(data)
  }

  useEffect(() => {
    fetchJobs()
    const iv = setInterval(fetchJobs, 5000)
    return () => clearInterval(iv)
  }, [])

  const deleteJob = async (id: string) => {
    await fetch(`${API_URL}/jobs/${id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': API_KEY },
    })
    if (selectedId === id) setSelectedId(null)
    fetchJobs()
  }

  const selectedJob = jobs.find((j) => j.id === selectedId) || null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">TranscriptForge</h1>
        <p className="text-sm text-zinc-400">Long-video transcription powered by VoidAI</p>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-1">
            <UploadForm onUpload={fetchJobs} />
            <JobList jobs={jobs} selectedId={selectedId} onSelect={setSelectedId} onDelete={deleteJob} />
            <StoragePanel />
          </div>
          <div className="lg:col-span-2">
            <JobDetail job={selectedJob} onDelete={deleteJob} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
