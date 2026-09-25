import type { TranscriptChunk } from './types.js'

export function formatTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function formatVttTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function generateSrt(chunks: TranscriptChunk[]): string {
  let counter = 1
  const lines: string[] = []
  for (const chunk of chunks) {
    if (!chunk.text.trim()) continue
    lines.push(String(counter++))
    lines.push(`${formatTimestamp(chunk.startSec)} --> ${formatTimestamp(chunk.endSec)}`)
    lines.push(chunk.text.trim())
    lines.push('')
  }
  return lines.join('\n')
}

export function generateVtt(chunks: TranscriptChunk[]): string {
  const lines = ['WEBVTT', '']
  for (const chunk of chunks) {
    if (!chunk.text.trim()) continue
    lines.push(`${formatVttTimestamp(chunk.startSec)} --> ${formatVttTimestamp(chunk.endSec)}`)
    lines.push(chunk.text.trim())
    lines.push('')
  }
  return lines.join('\n')
}

export function generateMarkdown(chunks: TranscriptChunk[], title: string): string {
  const lines = [`# ${title}`, '']
  for (const chunk of chunks) {
    const ts = formatTimestamp(chunk.startSec).replace(',', '.')
    lines.push(`**[${ts}]** ${chunk.text.trim()}`)
  }
  return lines.join('\n')
}

export function generateJson(chunks: TranscriptChunk[], metadata: object): string {
  return JSON.stringify({ chunks, ...metadata }, null, 2)
}

// Plain reading text with no per-line timestamps — companion to generateMarkdown's
// timestamped version, for users who just want the words.
export function generatePlainText(chunks: TranscriptChunk[]): string {
  return chunks
    .map(c => c.text.trim())
    .filter(Boolean)
    .join(' ')
}
