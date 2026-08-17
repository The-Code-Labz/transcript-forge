export type JobStatus =
  | 'pending'
  | 'uploading'
  | 'extracting_audio'
  | 'splitting_chunks'
  | 'transcribing'
  | 'stitching'
  | 'generating_outputs'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface TranscriptJob {
  id: string
  originalName: string
  status: JobStatus
  progress: number
  stage: string
  error?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  outputs?: {
    md?: string
    srt?: string
    vtt?: string
    json?: string
  }
  metadata?: {
    durationSec?: number
    chunkCount?: number
    model?: string
  }
}
