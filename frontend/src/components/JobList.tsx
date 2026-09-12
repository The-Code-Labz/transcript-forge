import { FileText, Clock, Trash2 } from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import type { TranscriptJob } from '../types'

export function JobList({
  jobs,
  selectedId,
  onSelect,
  onDelete,
}: {
  jobs: TranscriptJob[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (!jobs.length) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
        No jobs yet. Upload a video to begin.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-3 font-semibold">Jobs ({jobs.length})</h2>
      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            onClick={() => onSelect(job.id)}
            className={`w-full cursor-pointer rounded-lg border p-3 text-left transition ${
              selectedId === job.id
                ? 'border-indigo-500/50 bg-indigo-500/10'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 text-zinc-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{job.originalName}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />
                  {new Date(job.createdAt).toLocaleString()}
                </div>
                <div className="mt-3">
                  <ProgressBar job={job} />
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete "${job.originalName}" and its files? This cannot be undone.`)) {
                    onDelete(job.id)
                  }
                }}
                title="Delete job and files"
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-950/50 hover:text-rose-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
