import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
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

// Only whisper-1 supports verbose_json + word-level timestamp_granularities on the
// OpenAI (and VoidAI-proxied) transcription API. gpt-4o-transcribe / gpt-4o-mini-transcribe
// only accept response_format 'json' or 'text' and reject timestamp_granularities outright -
// requesting it gets a blanket "upstream provider rejected the request" 400 from VoidAI.
const SUPPORTS_WORD_TIMESTAMPS = /^whisper/i.test(config.transcribeModel)

async function transcribeWithVoidAI(audioPath: string, language?: string): Promise<TranscribeAudioResult> {
  const resp = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath) as any,
    model: config.transcribeModel,
    ...(SUPPORTS_WORD_TIMESTAMPS
      ? { response_format: 'verbose_json', timestamp_granularities: ['word'] }
      : { response_format: 'json' }),
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

// All audio chunks produced by worker.ts's ffmpeg pipeline are always mp3
// (audioCodec libmp3lame / format mp3), so the Content-Type is fixed here.
async function transcribeWithDeepgram(audioPath: string, language?: string): Promise<TranscribeAudioResult> {
  if (!config.deepgramApiKey) {
    throw new Error('DEEPGRAM_API_KEY is not set but TRANSCRIBE_PROVIDER=deepgram')
  }

  const audio = await readFile(audioPath)
  const params = new URLSearchParams({
    model: config.deepgramModel,
    smart_format: 'true',
    punctuate: 'true',
    ...(language ? { language } : {}),
  })

  const resp = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${config.deepgramApiKey}`,
      'Content-Type': 'audio/mpeg',
    },
    body: audio,
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Deepgram request failed (${resp.status} ${resp.statusText}): ${body}`)
  }

  const data: any = await resp.json()
  const alt = data?.results?.channels?.[0]?.alternatives?.[0]
  const text = alt?.transcript || ''
  const words = (alt?.words || []).map((w: any) => ({
    word: w.punctuated_word || w.word,
    start: w.start,
    end: w.end,
  }))

  return { text, words }
}

export async function transcribeAudio(
  audioPath: string,
  language?: string,
): Promise<TranscribeAudioResult> {
  if (config.transcribeProvider === 'deepgram') {
    return transcribeWithDeepgram(audioPath, language)
  }
  return transcribeWithVoidAI(audioPath, language)
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
