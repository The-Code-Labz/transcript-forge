import { useState, useRef, FormEvent } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { API_URL, API_KEY } from '../config'

// Large files sent as one request can be rejected by edge proxies in front of
// the API (e.g. Cloudflare caps request bodies at 100MB on Free/Pro plans)
// before they ever reach the server — which looks like an upload stuck at
// 0%. Splitting the file into chunks and posting each separately keeps every
// request small regardless of total file size.
const CHUNK_THRESHOLD = 20 * 1024 * 1024 // files at/under this size skip chunking entirely

function xhrRequest(
  method: string,
  url: string,
  body: FormData | string,
  headers: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    if (onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(ev.loaded, ev.total)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {})
        } catch {
          resolve({})
        }
      } else {
        let message = `Request failed (${xhr.status})`
        try {
          const body = JSON.parse(xhr.responseText)
          if (body.error) message = body.error
        } catch {
          // ignore non-JSON response body
        }
        reject(new Error(message))
      }
    }
    xhr.onerror = () => reject(new Error('Request failed (network error)'))
    xhr.send(body)
  })
}

async function uploadDirect(file: File, onProgress: (pct: number) => void) {
  const form = new FormData()
  form.append('video', file)
  await xhrRequest('POST', `${API_URL}/jobs`, form, { 'x-api-key': API_KEY }, (loaded, total) => {
    onProgress(Math.round((loaded / total) * 100))
  })
}

async function uploadChunked(file: File, onProgress: (pct: number) => void) {
  const init = await xhrRequest(
    'POST',
    `${API_URL}/uploads/init`,
    JSON.stringify({ originalName: file.name, fileSize: file.size }),
    { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  )
  const { uploadId, chunkSize, totalChunks } = init

  try {
    let uploadedBytes = 0
    for (let index = 0; index < totalChunks; index++) {
      const start = index * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const blob = file.slice(start, end)
      const form = new FormData()
      form.append('chunk', blob, `chunk-${index}`)

      let attempt = 0
      // Small retry budget: a single chunk failing on a flaky connection
      // shouldn't force re-uploading the whole file.
      for (;;) {
        try {
          await xhrRequest(
            'POST',
            `${API_URL}/uploads/${uploadId}/chunk/${index}`,
            form,
            { 'x-api-key': API_KEY },
            (loaded) => {
              onProgress(Math.round(((uploadedBytes + loaded) / file.size) * 100))
            },
          )
          break
        } catch (err) {
          attempt++
          if (attempt > 2) throw err
        }
      }
      uploadedBytes = end
      onProgress(Math.round((uploadedBytes / file.size) * 100))
    }

    await xhrRequest('POST', `${API_URL}/uploads/${uploadId}/complete`, '{}', {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    })
  } catch (err) {
    // best-effort cleanup of the partial session; ignore failures
    xhrRequest('DELETE', `${API_URL}/uploads/${uploadId}`, '', { 'x-api-key': API_KEY }).catch(() => {})
    throw err
  }
}

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
    try {
      if (file.size <= CHUNK_THRESHOLD) {
        await uploadDirect(file, setProgress)
      } else {
        await uploadChunked(file, setProgress)
      }
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
