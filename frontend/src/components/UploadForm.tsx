import { useState, useRef, FormEvent } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { API_URL, API_KEY } from '../config'

export function UploadForm({ onUpload }: { onUpload: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('video', file)
    try {
      await fetch(`${API_URL}/jobs`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY },
        body: form,
      })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onUpload()
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-3 font-semibold">Upload Video</h2>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1 file:text-zinc-100"
      />
      <button
        type="submit"
        disabled={!file || uploading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? 'Uploading...' : 'Start Transcription'}
      </button>
    </form>
  )
}
