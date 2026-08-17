import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { mkdir, writeFile, unlink, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Worker } from 'bullmq'
import { config } from './config.js'
import * as storage from './storage.js'
import * as queue from './queue.js'
import { transcribeAudio, buildChunksFromWords, textToChunks } from './transcribe.js'
import { generateMarkdown, generateSrt, generateVtt, generateJson } from './utils.js'
import type { TranscriptChunk, TranscriptResult } from './types.js'
import { broadcastProgress } from './websocket.js'

ffmpeg.setFfmpegPath((ffmpegStatic as unknown as string) || 'ffmpeg')

async function getDuration(mediaPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(mediaPath, (err, meta) => {
      if (err) return reject(err)
      resolve(meta.format.duration || 0)
    })
  })
}

async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioFrequency(16000)
      .audioChannels(1)
      .format('mp3')
      .on('end', () => resolve())
      .on('error', reject)
      .save(audioPath)
  })
}

async function splitAudio(audioPath: string, outputDir: string, chunkDurationSec: number): Promise<{ path: string; start: number; end: number }[]> {
  await mkdir(outputDir, { recursive: true })
  const duration = await getDuration(audioPath)

  const chunks: { path: string; start: number; end: number }[] = []
  for (let start = 0; start < duration; start += chunkDurationSec) {
    const end = Math.min(start + chunkDurationSec, duration)
    const out = join(outputDir, `chunk_${String(chunks.length).padStart(4, '0')}.mp3`)
    chunks.push({ path: out, start, end })
    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(start)
        .setDuration(end - start)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioFrequency(16000)
        .audioChannels(1)
        .format('mp3')
        .on('end', () => resolve())
        .on('error', reject)
        .save(out)
    })
  }
  return chunks
}

async function processJob(jobId: string): Promise<void> {
  const job = queue.getJob(jobId)
  if (!job) throw new Error(`Job ${jobId} not found`)

  const localDir = await storage.ensureLocalDir(jobId)
  const ext = job.originalName.includes('.') ? '.' + job.originalName.split('.').pop() : '.mp4'
  const videoLocalPath = join(localDir, `input${ext}`)
  const audioLocalPath = join(localDir, 'audio.mp3')
  const chunkDir = join(localDir, 'chunks')

  try {
    queue.setJobStatus(jobId, 'uploading', 'Downloading video', 3)
    await broadcastProgress(jobId)

    const videoBuf = await storage.downloadFile(job.videoKey!)
    await writeFile(videoLocalPath, videoBuf)

    queue.setJobStatus(jobId, 'extracting_audio', 'Extracting audio', 10)
    await broadcastProgress(jobId)
    await extractAudio(videoLocalPath, audioLocalPath)

    const duration = await getDuration(videoLocalPath)
    queue.updateJob(jobId, { metadata: { durationSec: duration } })

    queue.setJobStatus(jobId, 'splitting_chunks', 'Splitting into chunks', 15)
    await broadcastProgress(jobId)
    const chunks = await splitAudio(audioLocalPath, chunkDir, config.chunkMinutes * 60)
    queue.updateJob(jobId, { metadata: { durationSec: duration, chunkCount: chunks.length } })

    const chunkKeys: string[] = []
    for (const c of chunks) {
      const key = storage.keyPath(jobId, `chunks/chunk_${String(chunkKeys.length).padStart(4, '0')}.mp3`)
      await storage.uploadFile(c.path, key)
      chunkKeys.push(key)
    }
    queue.updateJob(jobId, { chunkKeys })

    const allChunks: TranscriptChunk[] = []
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      const progress = 20 + Math.floor(((i + 1) / chunks.length) * 60)
      queue.setJobStatus(jobId, 'transcribing', `Transcribing chunk ${i + 1}/${chunks.length}`, progress)
      await broadcastProgress(jobId)

      const result = await transcribeAudio(c.path)
      if (result.words?.length) {
        const built = buildChunksFromWords(result.words, c.start)
        allChunks.push(...built)
      } else {
        allChunks.push(...textToChunks(result.text, c.start, c.end))
      }
    }

    queue.setJobStatus(jobId, 'stitching', 'Stitching transcript', 85)
    await broadcastProgress(jobId)

    const result: TranscriptResult = { text: allChunks.map(c => c.text).join(' '), chunks: allChunks }

    queue.setJobStatus(jobId, 'generating_outputs', 'Generating output files', 90)
    await broadcastProgress(jobId)

    const md = generateMarkdown(allChunks, job.originalName)
    const srt = generateSrt(allChunks)
    const vtt = generateVtt(allChunks)
    const json = generateJson(allChunks, { duration, model: config.transcribeModel, originalName: job.originalName })

    const mdKey = storage.keyPath(jobId, 'transcript.md')
    const srtKey = storage.keyPath(jobId, 'transcript.srt')
    const vttKey = storage.keyPath(jobId, 'transcript.vtt')
    const jsonKey = storage.keyPath(jobId, 'transcript.json')

    await Promise.all([
      storage.uploadBuffer(Buffer.from(md, 'utf8'), mdKey),
      storage.uploadBuffer(Buffer.from(srt, 'utf8'), srtKey),
      storage.uploadBuffer(Buffer.from(vtt, 'utf8'), vttKey),
      storage.uploadBuffer(Buffer.from(json, 'utf8'), jsonKey),
    ])

    queue.updateJob(jobId, {
      outputs: {
        md: storage.publicUrl(mdKey),
        srt: storage.publicUrl(srtKey),
        vtt: storage.publicUrl(vttKey),
        json: storage.publicUrl(jsonKey),
      },
      completedAt: new Date().toISOString(),
    })

    queue.setJobStatus(jobId, 'completed', 'Completed', 100)
    await broadcastProgress(jobId)
  } catch (err: any) {
    queue.updateJob(jobId, { error: err.message || String(err) })
    queue.setJobStatus(jobId, 'failed', err.message || 'Failed')
    await broadcastProgress(jobId)
    throw err
  } finally {
    try {
      const files = await readdir(localDir).catch(() => [])
      for (const f of files) {
        if (['transcript.md', 'transcript.srt', 'transcript.vtt', 'transcript.json'].includes(f)) continue
        await unlink(join(localDir, f)).catch(() => {})
      }
    } catch {}
  }
}

export const transcriptionWorker = new Worker<{ jobId: string }>(
  'transcription',
  async (bullJob) => {
    await processJob(bullJob.data.jobId)
  },
  { connection: { url: config.redisUrl }, concurrency: 1 },
)

transcriptionWorker.on('failed', (job, err) => {
  if (job) {
    queue.updateJob(job.data.jobId, { error: err.message })
    queue.setJobStatus(job.data.jobId, 'failed', err.message)
    broadcastProgress(job.data.jobId).catch(() => {})
  }
})
