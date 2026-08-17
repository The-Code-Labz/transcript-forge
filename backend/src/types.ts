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
  videoKey?: string
  audioKey?: string
  chunkKeys?: string[]
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

export interface TranscriptChunk {
  index: number
  startSec: number
  endSec: number
  text: string
  words?: Array<{
    word: string
    start: number
    end: number
  }>
}

export interface TranscriptResult {
  text: string
  chunks: TranscriptChunk[]
  words?: TranscriptResult['chunks'][number]['words']
}

export interface ProgressEvent {
  jobId: string
  status: JobStatus
  progress: number
  stage: string
  error?: string
  outputs?: TranscriptJob['outputs']
}
