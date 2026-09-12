import { FileText, Subtitles, Braces } from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { API_URL, API_KEY } from '../config'
import type { TranscriptJob } from '../types'

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

      {job.outputs && (
        <div className="space-y-2">
          <h3 className="mb-2 font-medium">Downloads</h3>
          {job.outputs.md && (
            <a
              href={`/api/files/${job.id}/transcript.md`}
              download
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700"
            >
              <FileText className="h-4 w-4" /> Markdown
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
