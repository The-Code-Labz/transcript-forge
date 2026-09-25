import { useEffect, useState } from 'react'
import { FileText, FileType, Subtitles, Braces, Clock, AlignLeft } from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { API_URL, API_KEY } from '../config'
import type { TranscriptJob } from '../types'

interface TranscriptChunk {
  index: number
  startSec: number
  endSec: number
  text: string
}

function formatTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`
}

function TranscriptViewer({ job }: { job: TranscriptJob }) {
  const [chunks, setChunks] = useState<TranscriptChunk[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)

  useEffect(() => {
    if (!job.outputs?.json) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`${API_URL}/files/${job.id}/transcript.json`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load transcript (${res.status})`)
        return res.json()
      })
      .then(data => {
        if (!cancelled) setChunks(data.chunks || [])
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load transcript')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [job.id, job.outputs?.json])

  if (!job.outputs?.json) return null

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium">Transcript</h3>
        <button
          onClick={() => setShowTimestamps(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1 text-xs font-medium hover:bg-zinc-800"
        >
          {showTimestamps ? <AlignLeft className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
          {showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-200">
        {loading && <p className="text-zinc-500">Loading transcript…</p>}
        {error && <p className="text-rose-300">{error}</p>}
        {!loading && !error && chunks && chunks.length === 0 && (
          <p className="text-zinc-500">No transcript text available.</p>
        )}
        {!loading && !error && chunks && chunks.length > 0 && (
          showTimestamps ? (
            <div className="space-y-2">
              {chunks
                .filter(c => c.text.trim())
                .map(c => (
                  <p key={c.index}>
                    <span className="mr-2 font-mono text-xs text-violet-400">[{formatTimestamp(c.startSec)}]</span>
                    {c.text.trim()}
                  </p>
                ))}
            </div>
          ) : (
            <p className="whitespace-pre-wrap">
              {chunks.map(c => c.text.trim()).filter(Boolean).join(' ')}
            </p>
          )
        )}
      </div>
    </div>
  )
}

export function JobDetail({ job, onDelete }: { job: TranscriptJob | null; onDelete: (id: string) => void }) {
  if (!job) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500">
        Select a job to view details.
      </div>
    )
  }

  const cancelJob = async () => {
    await fetch(`${API_URL}/jobs/${job.id}/cancel`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
    })
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{job.originalName}</h2>
          <p className="mt-1 text-xs text-zinc-500">ID: {job.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {!['completed', 'failed', 'cancelled'].includes(job.status) && (
            <button
              onClick={cancelJob}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-800"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`Delete "${job.originalName}" and its files? This cannot be undone.`)) {
                onDelete(job.id)
              }
            }}
            className="rounded-lg border border-rose-900/50 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mb-6">
        <ProgressBar job={job} />
      </div>

      {job.error && (
        <div className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/30 p-3 text-sm text-rose-200">
          {job.error}
        </div>
      )}

      {job.metadata && (
        <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-zinc-950 p-3">
            <p className="text-zinc-500">Duration</p>
            <p className="font-medium">
              {job.metadata.durationSec
                ? `${Math.floor(job.metadata.durationSec / 60)}m ${Math.floor(job.metadata.durationSec % 60)}s`
                : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-950 p-3">
            <p className="text-zinc-500">Chunks</p>
            <p className="font-medium">{job.metadata.chunkCount ?? '—'}</p>
          </div>
        </div>
      )}

      <TranscriptViewer job={job} />

      {job.outputs && (
        <div className="space-y-2">
          <h3 className="mb-2 font-medium">Downloads</h3>
          {job.outputs.md && (
            <a
              href={`/api/files/${job.id}/transcript.md`}
              download
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700"
            >
              <FileText className="h-4 w-4" /> Markdown (with timestamps)
            </a>
          )}
          {job.outputs.txt && (
            <a
              href={`/api/files/${job.id}/transcript.txt`}
              download
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700"
            >
              <FileType className="h-4 w-4" /> Text (no timestamps)
            </a>
          )}
          {job.outputs.srt && (
            <a
              href={`/api/files/${job.id}/transcript.srt`}
              download
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700"
            >
              <Subtitles className="h-4 w-4" /> SRT
            </a>
          )}
          {job.outputs.vtt && (
            <a
              href={`/api/files/${job.id}/transcript.vtt`}
              download
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700"
            >
              <Subtitles className="h-4 w-4" /> VTT
            </a>
          )}
          {job.outputs.json && (
            <a
              href={`/api/files/${job.id}/transcript.json`}
              download
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700"
            >
              <Braces className="h-4 w-4" /> JSON
            </a>
          )}
        </div>
      )}
    </div>
  )
}
