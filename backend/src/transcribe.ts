import { createReadStream } from 'node:fs'
import OpenAI from 'openai'
import { config } from './config.js'
import type { TranscriptChunk } from './types.js'

const openai = new OpenAI({
  apiKey: config.voidaiApiKey,
  baseURL: config.voidaiBaseUrl,
})

export interface TranscribeAudioResult {
  text: string
  words?: Array<{ word: string; start: number; end: number }>
}

export async function transcribeAudio(
  audioPath: string,
  language?: string,
): Promise<TranscribeAudioResult> {
  const resp = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath) as any,
    model: config.transcribeModel,
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    language,
  } as any)

  const text = (resp as any).text || ''
  const words = ((resp as any).words || []).map((w: any) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }))

  return { text, words }
}

export function buildChunksFromWords(
  words: Array<{ word: string; start: number; end: number }>,
  chunkStartSec: number,
): TranscriptChunk[] {
  if (!words.length) return []
  const lines: TranscriptChunk[] = []
  let current: string[] = []
  let start = chunkStartSec + words[0].start
  let end = chunkStartSec + words[0].end

  for (const w of words) {
    current.push(w.word)
    end = chunkStartSec + w.end
    if (current.length >= 30 || /[.!?]$/.test(w.word)) {
      lines.push({
        index: lines.length,
        startSec: start,
        endSec: end,
        text: current.join(' '),
        words: words.slice(0).filter(x => x.start >= start - chunkStartSec && x.end <= end - chunkStartSec),
      })
      current = []
      start = chunkStartSec + w.end
    }
  }

  if (current.length) {
    lines.push({
      index: lines.length,
      startSec: start,
      endSec: end,
      text: current.join(' '),
      words: words.filter(x => x.start >= start - chunkStartSec),
    })
  }

  return lines
}

export function textToChunks(text: string, chunkStartSec: number, chunkEndSec: number): TranscriptChunk[] {
  return [{
    index: 0,
    startSec: chunkStartSec,
    endSec: chunkEndSec,
    text,
  }]
}
