import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import { mkdirSync, unlink } from 'node:fs'
import { join, resolve } from 'node:path'
import { config } from './config.js'
import * as storage from './storage.js'
import * as queue from './queue.js'
import { downloadFile } from './storage.js'

const upload = multer({ dest: 'data/uploads/', limits: { fileSize: config.maxFileSizeBytes } })
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

apiRouter.post(
  '/jobs',
  requireApiKey,
  upload.single('video'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No video file provided' })
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
