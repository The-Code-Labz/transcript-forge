import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { config } from './config.js'
import { apiRouter } from './routes.js'
import { initWebSocket } from './websocket.js'
import './worker.js'

const app = express()
const server = createServer(app)
// Node's default requestTimeout (5 min) covers the whole request including
// body upload — large video/audio files on a slow link can easily take
// longer than that and get killed mid-transfer, which looks like a hang on
// the client. Disable it (0 = no timeout) since this endpoint is meant to
// accept multi-hundred-MB uploads.
server.requestTimeout = 0
server.headersTimeout = 60_000

app.use(cors({ origin: config.corsOrigin }))
app.use(express.json())
app.use('/api', apiRouter)

// Serve frontend static files in production
if (config.nodeEnv === 'production') {
  app.use(express.static(join(process.cwd(), 'public')))
  app.get('*', (req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'index.html'))
  })
}

initWebSocket(server)

server.listen(config.port, () => {
  console.log(`TranscriptForge API running on http://localhost:${config.port}`)
})
