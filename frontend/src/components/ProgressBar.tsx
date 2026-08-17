import type { TranscriptJob } from '../types'

const statusColors: Record<TranscriptJob['status'], string> = {
  pending: 'bg-zinc-600',
  uploading: 'bg-blue-600',
  extracting_audio: 'bg-blue-600',
  splitting_chunks: 'bg-blue-600',
  transcribing: 'bg-indigo-600',
  stitching: 'bg-purple-600',
  generating_outputs: 'bg-purple-600',
  completed: 'bg-emerald-600',
  failed: 'bg-rose-600',
  cancelled: 'bg-zinc-600',
}

export function ProgressBar({ job }: { job: TranscriptJob }) {
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-zinc-300">{job.stage}</span>
        <span className="text-zinc-400">{job.progress}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all ${statusColors[job.status]}`}
          style={{ width: `${job.progress}%` }}
        />
      </div>
    </div>
  )
}
