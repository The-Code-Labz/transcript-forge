import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import type { ProgressEvent } from './types.js'
import * as queue from './queue.js'

const clients = new Map<WebSocket, Set<string>>()

export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws) => {
    clients.set(ws, new Set())
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'subscribe' && msg.jobId) {
          clients.get(ws)?.add(msg.jobId)
          // Send current state immediately
          const job = queue.getJob(msg.jobId)
          if (job) ws.send(JSON.stringify(toProgressEvent(job)))
        }
      } catch {}
    })
    ws.on('close', () => clients.delete(ws))
  })
}

function toProgressEvent(job: ReturnType<typeof queue.getJob>): ProgressEvent {
  return {
    jobId: job!.id,
    status: job!.status,
    progress: job!.progress,
    stage: job!.stage,
    error: job!.error,
    outputs: job!.outputs,
  }
}

export async function broadcastProgress(jobId: string): Promise<void> {
  const job = queue.getJob(jobId)
  if (!job) return
  const event = toProgressEvent(job)
  const payload = JSON.stringify(event)
  for (const [ws, subs] of clients.entries()) {
    if (subs.has(jobId) && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}
