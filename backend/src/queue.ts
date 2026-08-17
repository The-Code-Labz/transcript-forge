import { Queue, Job } from 'bullmq'
import { config } from './config.js'
import type { TranscriptJob, JobStatus } from './types.js'

export const transcriptionQueue = new Queue<{ jobId: string }>('transcription', {
  connection: { url: config.redisUrl },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
})

const jobStore = new Map<string, TranscriptJob>()

export function createJob(id: string, originalName: string): TranscriptJob {
  const job: TranscriptJob = {
    id,
    originalName,
    status: 'pending',
    progress: 0,
    stage: 'Queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  jobStore.set(id, job)
  return job
}

export function updateJob(id: string, patch: Partial<TranscriptJob>): TranscriptJob | undefined {
  const job = jobStore.get(id)
  if (!job) return undefined
  Object.assign(job, patch, { updatedAt: new Date().toISOString() })
  jobStore.set(id, job)
  return job
}

export function setJobStatus(id: string, status: JobStatus, stage?: string, progress?: number): TranscriptJob | undefined {
  return updateJob(id, {
    status,
    stage: stage ?? jobStore.get(id)?.stage,
    progress: progress ?? jobStore.get(id)?.progress,
  })
}

export function getJob(id: string): TranscriptJob | undefined {
  return jobStore.get(id)
}

export function listJobs(): TranscriptJob[] {
  return Array.from(jobStore.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function addTranscriptionJob(jobId: string): Promise<Job> {
  return transcriptionQueue.add('transcribe', { jobId }, { jobId })
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const bullJobs = await transcriptionQueue.getJobs(['waiting', 'active', 'delayed'])
  const target = bullJobs.find(j => j.data.jobId === jobId)
  if (target) {
    try {
      await target.remove()
    } catch {}
  }
  const job = jobStore.get(jobId)
  if (job && !['completed', 'failed'].includes(job.status)) {
    setJobStatus(jobId, 'cancelled', 'Cancelled by user', job.progress)
    return true
  }
  return false
}
