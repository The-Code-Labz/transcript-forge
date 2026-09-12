import { useState, useRef, FormEvent } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { API_URL, API_KEY } from '../config'

export function UploadForm({ onUpload }: { onUpload: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setProgress(0)
    setError(null)
    const form = new FormData()
    form.append('video', file)
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_URL}/jobs`)
        xhr.setRequestHeader('x-api-key', API_KEY)
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setProgress(Math.round((ev.loaded / ev.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            let message = `Upload failed (${xhr.status})`
            try {
              const body = JSON.parse(xhr.responseText)
              if (body.error) message = body.error
            } catch {
              // ignore non-JSON response body
            }
            reject(new Error(message))
          }
        }
        xhr.onerror = () => reject(new Error('Upload failed (network error)'))
        xhr.send(form)
      })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onUpload()
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-3 font-semibold">Upload Video or Audio</h2>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus,.wma"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1 file:text-zinc-100"
      />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {uploading && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-zinc-400">{progress}%</p>
        </div>
      )}
      <button
        type="submit"
        disabled={!file || uploading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? `Uploading... ${progress}%` : 'Start Transcription'}
      </button>
    </form>
  )
}
