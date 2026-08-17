# TranscriptForge

Self-hosted async video transcription web app powered by the VoidAI API.

## What it does

- Upload long videos (1–2+ hours)
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
| POST | `/api/jobs` | Upload video (multipart/form-data, field `video`) |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/:id` | Get job status |
| POST | `/api/jobs/:id/cancel` | Cancel a job |
| GET | `/api/files/:jobId/transcript.md` | Download Markdown transcript |
| GET | `/api/files/:jobId/transcript.srt` | Download SRT subtitles |
| GET | `/api/files/:jobId/transcript.vtt` | Download VTT subtitles |
| GET | `/api/files/:jobId/transcript.json` | Download JSON with word timestamps |

All API endpoints except `/api/health` require the header `x-api-key: $TRANSCRIPT_FORGE_API_KEY`.

## Environment variables

See `.env.example` for all options.

## Notes

- Redis is required for the background job queue.
- A 2-hour video will typically be split into ~12 chunks; each chunk is transcribed in parallel up to worker concurrency.
- Output files are kept in storage until deleted manually.
