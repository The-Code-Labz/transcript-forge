import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import { mkdirSync, unlink, createReadStream, createWriteStream } from 'node:fs'
import { rename, rm, mkdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { config } from './config.js'
import * as storage from './storage.js'
import * as queue from './queue.js'
import { downloadFile } from './storage.js'

const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mov', '.mkv', '.avi', '.webm', '.flv', '.wmv', '.m4v',
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.wma',
])

const upload = multer({
  dest: 'data/uploads/',
  limits: { fileSize: config.maxFileSizeBytes },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.includes('.') ? '.' + file.originalname.split('.').pop()!.toLowerCase() : ''
    const isAllowedMime = file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')
    if (isAllowedMime || ALLOWED_EXTENSIONS.has(ext)) return cb(null, true)
    cb(new Error(`Unsupported file type: ${file.mimetype || ext}`))
  },
})
mkdirSync(resolve('data/uploads'), { recursive: true })

// --- Chunked upload support -------------------------------------------------
// Large files sent as a single request can be rejected outright by edge
// proxies in front of this API (e.g. Cloudflare caps request bodies at
// 100MB on Free/Pro plans) long before they reach this server, which looks
// like an upload stuck at 0%. Splitting the file into small chunks client
// side and posting each one separately keeps every individual request well
// under any such limit, regardless of total file size.
const CHUNK_SIZE = 20 * 1024 * 1024 // 20MB per chunk
const CHUNK_UPLOAD_DIR = resolve('data/uploads/chunks')
const CHUNK_SESSION_TTL_MS = 24 * 60 * 60 * 1000 // abandoned sessions are reaped after this
mkdirSync(CHUNK_UPLOAD_DIR, { recursive: true })

interface PendingUpload {
  originalName: string
  fileSize: number
  totalChunks: number
  receivedChunks: Set<number>
  createdAt: number
}
const pendingUploads = new Map<string, PendingUpload>()

async function reapStaleUploadSessions() {
  const now = Date.now()
  for (const [uploadId, session] of pendingUploads) {
    if (now - session.createdAt > CHUNK_SESSION_TTL_MS) {
      pendingUploads.delete(uploadId)
      await rm(join(CHUNK_UPLOAD_DIR, uploadId), { recursive: true, force: true }).catch(() => {})
    }
  }
}
setInterval(reapStaleUploadSessions, 60 * 60 * 1000).unref()

const chunkUpload = multer({
  dest: 'data/uploads/chunk-tmp/',
  limits: { fileSize: CHUNK_SIZE + 5 * 1024 * 1024 }, // small slack over the exact chunk size
})
mkdirSync(resolve('data/uploads/chunk-tmp'), { recursive: true })

// Streams chunk files (in order) into a single destination file without
// buffering the whole assembled file in memory at once.
async function assembleChunks(uploadId: string, totalChunks: number, destPath: string) {
  await mkdir(dirname(destPath), { recursive: true })
  const writeStream = createWriteStream(destPath)
  try {
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = join(CHUNK_UPLOAD_DIR, uploadId, String(i))
      await new Promise<void>((resolvePromise, rejectPromise) => {
        const readStream = createReadStream(chunkPath)
        readStream.on('error', rejectPromise)
        readStream.on('end', resolvePromise)
        readStream.pipe(writeStream, { end: false })
      })
    }
  } finally {
    writeStream.end()
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    writeStream.on('finish', resolvePromise)
    writeStream.on('error', rejectPromise)
  })
}

function requireApiKey(req: Request, res: Response, next: () => void) {
  const key = req.headers['x-api-key'] || req.query.api_key
  if (!config.apiKey || key === config.apiKey) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

export const apiRouter = Router()

apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', voidaiConfigured: !!config.voidaiApiKey, storage: config.storageBackend })
})

apiRouter.post('/uploads/init', requireApiKey, (req: Request, res: Response) => {
  const { originalName, fileSize } = req.body || {}
  if (!originalName || typeof originalName !== 'string' || typeof fileSize !== 'number' || fileSize <= 0) {
    return res.status(400).json({ error: 'originalName and fileSize are required' })
  }
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop()!.toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(400).json({ error: `Unsupported file type: ${ext || '(none)'}` })
  }
  if (fileSize > config.maxFileSizeBytes) {
    return res.status(400).json({ error: `File too large (max ${config.maxFileSizeBytes} bytes)` })
  }
  const uploadId = uuid()
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)
  pendingUploads.set(uploadId, { originalName, fileSize, totalChunks, receivedChunks: new Set(), createdAt: Date.now() })
  mkdirSync(join(CHUNK_UPLOAD_DIR, uploadId), { recursive: true })
  res.json({ uploadId, chunkSize: CHUNK_SIZE, totalChunks })
})

function handleChunkUpload(req: Request, res: Response, next: (err?: any) => void) {
  chunkUpload.single('chunk')(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'Chunk upload failed' })
    next()
  })
}

apiRouter.post('/uploads/:uploadId/chunk/:index', requireApiKey, handleChunkUpload, async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params
    const session = pendingUploads.get(uploadId)
    if (!session) {
      if (req.file) unlink(req.file.path, () => {})
      return res.status(404).json({ error: 'Unknown or expired upload session' })
    }
    if (!req.file) return res.status(400).json({ error: 'No chunk data provided' })
    const index = Number(req.params.index)
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
      unlink(req.file.path, () => {})
      return res.status(400).json({ error: 'Invalid chunk index' })
    }
    const dest = join(CHUNK_UPLOAD_DIR, uploadId, String(index))
    await rename(req.file.path, dest)
    session.receivedChunks.add(index)
    res.json({ ok: true, received: session.receivedChunks.size, totalChunks: session.totalChunks })
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) })
  }
})

apiRouter.post('/uploads/:uploadId/complete', requireApiKey, async (req: Request, res: Response) => {
  const { uploadId } = req.params
  const session = pendingUploads.get(uploadId)
  try {
    if (!session) return res.status(404).json({ error: 'Unknown or expired upload session' })
    if (session.receivedChunks.size !== session.totalChunks) {
      return res.status(400).json({ error: `Missing chunks: received ${session.receivedChunks.size}/${session.totalChunks}` })
    }

    const jobId = uuid()
    const ext = session.originalName.includes('.') ? '.' + session.originalName.split('.').pop()!.toLowerCase() : ''
    const assembledPath = resolve('data/uploads', `${jobId}-assembled${ext}`)
    await assembleChunks(uploadId, session.totalChunks, assembledPath)

    const videoKey = storage.keyPath(jobId, `input${ext}`)
    queue.createJob(jobId, session.originalName)
    queue.setJobStatus(jobId, 'uploading', 'Uploading video', 2)
    await storage.uploadFile(assembledPath, videoKey)
    unlink(assembledPath, () => {})
    queue.updateJob(jobId, { videoKey })
    queue.setJobStatus(jobId, 'pending', 'Queued for processing', 5)

    await queue.addTranscriptionJob(jobId)
    res.status(201).json(queue.getJob(jobId))
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) })
  } finally {
    pendingUploads.delete(uploadId)
    rm(join(CHUNK_UPLOAD_DIR, uploadId), { recursive: true, force: true }).catch(() => {})
  }
})

apiRouter.delete('/uploads/:uploadId', requireApiKey, async (req: Request, res: Response) => {
  const { uploadId } = req.params
  pendingUploads.delete(uploadId)
  await rm(join(CHUNK_UPLOAD_DIR, uploadId), { recursive: true, force: true }).catch(() => {})
  res.json({ ok: true })
})

function handleUpload(req: Request, res: Response, next: (err?: any) => void) {
  upload.single('video')(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' })
    next()
  })
}

apiRouter.post(
  '/jobs',
  requireApiKey,
  handleUpload,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No video or audio file provided' })
      const jobId = uuid()
      const originalName = req.file.originalname
      const videoKey = storage.keyPath(jobId, `input${originalName.replace(/.*(?=\.)/, '')}`)

      queue.createJob(jobId, originalName)
      queue.setJobStatus(jobId, 'uploading', 'Uploading video', 2)
      await storage.uploadFile(req.file.path, videoKey)
      unlink(req.file.path, () => {})
      queue.updateJob(jobId, { videoKey })
      queue.setJobStatus(jobId, 'pending', 'Queued for processing', 5)

      await queue.addTranscriptionJob(jobId)
      res.status(201).json(queue.getJob(jobId))
    } catch (err: any) {
      res.status(500).json({ error: err.message || String(err) })
    }
  },
)

apiRouter.get('/jobs', requireApiKey, (req, res) => {
  res.json(queue.listJobs())
})

apiRouter.get('/jobs/:id', requireApiKey, (req, res) => {
  const job = queue.getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(job)
})

apiRouter.post('/jobs/:id/cancel', requireApiKey, async (req, res) => {
  const ok = await queue.cancelJob(req.params.id)
  if (!ok) return res.status(400).json({ error: 'Job cannot be cancelled' })
  res.json({ ok: true })
})

apiRouter.delete('/jobs/:id', requireApiKey, async (req, res) => {
  try {
    const jobId = req.params.id
    const job = queue.getJob(jobId)
    if (job && !['completed', 'failed', 'cancelled'].includes(job.status)) {
      await queue.cancelJob(jobId)
    }
    await queue.removeJob(jobId)
    await storage.deleteJobFiles(jobId)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) })
  }
})

// Local-storage-only maintenance endpoints: the job list above is backed by an
// in-memory Map that does not survive a process restart, so on 'local' storage
// a restart leaves prior job folders on disk with no way to see or delete them
// through the normal job list. These let that leftover data be found and reclaimed.
apiRouter.get('/storage/jobs', requireApiKey, async (req, res) => {
  try {
    const dirs = await storage.listLocalJobDirs()
    const known = new Set(queue.listJobs().map(j => j.id))
    res.json(dirs.map(d => ({ ...d, tracked: known.has(d.jobId) })))
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) })
  }
})

apiRouter.delete('/storage/jobs/:jobId', requireApiKey, async (req, res) => {
  try {
    const jobId = req.params.jobId
    await queue.removeJob(jobId)
    await storage.deleteJobFiles(jobId)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) })
  }
})

apiRouter.get('/files/:jobId/:name', async (req, res) => {
  try {
    const key = storage.keyPath(req.params.jobId, req.params.name)
    const buf = await downloadFile(key)
    const ext = req.params.name.split('.').pop()
    const ctype = ext === 'md' ? 'text/markdown' : ext === 'srt' ? 'text/srt' : ext === 'vtt' ? 'text/vtt' : ext === 'json' ? 'application/json' : 'application/octet-stream'
    res.setHeader('Content-Type', ctype)
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`)
    res.send(buf)
  } catch (err: any) {
    res.status(404).json({ error: 'File not found' })
  }
})
