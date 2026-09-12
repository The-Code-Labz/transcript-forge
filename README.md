# TranscriptForge

Self-hosted async video/audio transcription web app powered by the VoidAI API.

## What it does

- Upload long videos or audio files (1–2+ hours) — mp4, mov, mkv, avi, webm, mp3, wav, m4a, aac, flac, ogg, opus, wma
- ffmpeg extracts audio and splits it into 10-minute chunks
- Chunks are transcribed in parallel via VoidAI (`gpt-4o-transcribe`)
- Results are stitched back together with timestamps
- Download as `.md`, `.srt`, `.vtt`, or `.json`
- Live progress via WebSocket

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Queue:** BullMQ + Redis
- **Media:** ffmpeg
- **Transcription:** VoidAI (OpenAI-compatible API)
- **Storage:** Local filesystem or MinIO/S3

## Quick start

```bash
git clone https://github.com/The-Code-Labz/transcript-forge.git
cd transcript-forge
cp .env.example .env
# Edit .env with your VOIDAI_API_KEY and TRANSCRIPT_FORGE_API_KEY
docker compose up -d
```

Open http://localhost:4050.

## Optional: Traefik reverse proxy

`docker-compose.traefik.yml` is an override that adds Traefik routing labels to
the `api` service. It's opt-in — plain `docker compose up` still runs standalone,
no Traefik required.

```bash
# one-time: create the shared external network if it doesn't exist
docker network create traefik-public

# set DOMAIN (and optionally CERT_RESOLVER) in .env, then:
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
```

Requires a Traefik instance already attached to `traefik-public` with
`web`/`websecure` entrypoints and a certresolver configured.

## Local development

```bash
npm run install:all
npm run dev
```

Backend runs on http://localhost:4050, frontend on http://localhost:5173.

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/jobs` | Upload video or audio directly (multipart/form-data, field `video`). Used by the UI for files ≤20MB |
| POST | `/api/uploads/init` | Start a chunked upload session: `{ originalName, fileSize }` → `{ uploadId, chunkSize, totalChunks }` |
| POST | `/api/uploads/:uploadId/chunk/:index` | Upload one chunk (multipart/form-data, field `chunk`) |
| POST | `/api/uploads/:uploadId/complete` | Assemble all received chunks and create the job (same response shape as `POST /api/jobs`) |
| DELETE | `/api/uploads/:uploadId` | Abort a chunked upload session and discard any chunks received so far |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/:id` | Get job status |
| POST | `/api/jobs/:id/cancel` | Cancel a job |
| GET | `/api/files/:jobId/transcript.md` | Download Markdown transcript |
| GET | `/api/files/:jobId/transcript.srt` | Download SRT subtitles |
| GET | `/api/files/:jobId/transcript.vtt` | Download VTT subtitles |
| GET | `/api/files/:jobId/transcript.json` | Download JSON with word timestamps |
| DELETE | `/api/jobs/:id` | Cancel (if running) and permanently delete a job's files |
| GET | `/api/storage/jobs` | (local storage only) List job folders on disk, including ones no longer tracked in memory |
| DELETE | `/api/storage/jobs/:jobId` | (local storage only) Delete a job folder by ID, tracked or not |

All API endpoints except `/api/health` require the header `x-api-key: $TRANSCRIPT_FORGE_API_KEY`.

## Environment variables

See `.env.example` for all options.

## Notes

- Redis is required for the background job queue.
- A 2-hour video will typically be split into ~12 chunks; each chunk is transcribed in parallel up to worker concurrency.
- Output files are kept in storage until deleted manually — use the Delete button in the UI (or `DELETE /api/jobs/:id`) to remove a job and its files.
- The job list is in-memory only and does not survive a backend restart. On the `local` storage backend this can orphan old job folders on disk; the UI's "Orphaned files" panel (backed by `GET/DELETE /api/storage/jobs`) surfaces and reclaims these.
- The UI automatically chunk-uploads files larger than 20MB (20MB chunks, `/api/uploads/*`), so large videos aren't blocked by edge-proxy request-body limits (e.g. Cloudflare caps single requests at 100MB on Free/Pro plans). Files at/under 20MB still use the simpler direct `POST /api/jobs` upload.
