import { useEffect, useState } from 'react'
import { HardDrive, Trash2 } from 'lucide-react'
import { API_URL, API_KEY } from '../config'

interface StorageEntry {
  jobId: string
  sizeBytes: number
  updatedAt: string
  tracked: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// Job records live only in memory on the backend, so a server restart clears
// the job list but leaves the uploaded files/outputs behind on disk (local
// storage backend only). This panel surfaces those orphaned files so they can
// be reclaimed even though they no longer show up in the normal job list.
export function StoragePanel() {
  const [entries, setEntries] = useState<StorageEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchEntries = async () => {
    try {
      const res = await fetch(`${API_URL}/storage/jobs`, { headers: { 'x-api-key': API_KEY } })
      if (!res.ok) return
      const data = await res.json()
      setEntries(data)
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    fetchEntries()
    const iv = setInterval(fetchEntries, 15000)
    return () => clearInterval(iv)
  }, [])

  const orphaned = entries.filter((e) => !e.tracked)

  const deleteEntry = async (jobId: string) => {
    await fetch(`${API_URL}/storage/jobs/${jobId}`, {
      method: 'DELETE',
      headers: { 'x-api-key': API_KEY },
    })
    fetchEntries()
  }

  const deleteAll = async () => {
    if (!confirm(`Delete all ${orphaned.length} orphaned job folders? This cannot be undone.`)) return
    await Promise.all(orphaned.map((e) => deleteEntry(e.jobId)))
  }

  if (!loaded || orphaned.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-amber-200">
          <HardDrive className="h-4 w-4" /> Orphaned files ({orphaned.length})
        </h2>
        <button
          onClick={deleteAll}
          className="rounded-lg border border-amber-800/50 px-2 py-1 text-xs font-medium text-amber-200 hover:bg-amber-900/40"
        >
          Delete all
        </button>
      </div>
      <p className="mb-3 text-xs text-amber-300/70">
        Files left on disk from jobs no longer tracked (e.g. after a server restart).
      </p>
      <div className="space-y-2">
        {orphaned.map((e) => (
          <div
            key={e.jobId}
            className="flex items-center justify-between rounded-lg border border-amber-900/40 bg-zinc-950 px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-zinc-400">{e.jobId}</p>
              <p className="text-zinc-500">
                {formatSize(e.sizeBytes)} · {new Date(e.updatedAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => deleteEntry(e.jobId)}
              title="Delete files"
              className="ml-2 rounded-lg p-1.5 text-zinc-500 hover:bg-rose-950/50 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
