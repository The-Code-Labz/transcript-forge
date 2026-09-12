import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import { mkdirSync, unlink } from 'node:fs'
import { join, resolve } from 'node:path'
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

function requireApiKey(req: Request, res: Response, next: () => void) {
  const key = req.headers['x-api-key'] || req.query.api_key
  if (!config.apiKey || key === config.apiKey) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

export const apiRouter = Router()

apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', voidaiConfigured: !!config.voidaiApiKey, storage: config.storageBackend })
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
