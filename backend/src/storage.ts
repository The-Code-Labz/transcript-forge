import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { mkdir, writeFile, readFile, unlink, rm, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { config } from './config.js'

const s3Client = config.storageBackend !== 'local'
  ? new S3Client({
      endpoint: config.s3Endpoint || undefined,
      region: config.s3Region,
      credentials: {
        accessKeyId: config.s3AccessKey,
        secretAccessKey: config.s3SecretKey,
      },
      forcePathStyle: config.s3ForcePathStyle,
    })
  : null

export function keyPath(jobId: string, name: string) {
  return `${jobId}/${name}`
}

export async function uploadFile(localPath: string, key: string): Promise<void> {
  if (config.storageBackend === 'local') {
    const dest = join(resolve(config.localDataDir), key)
    await mkdir(dirname(dest), { recursive: true })
    const buf = await readFile(localPath)
    await writeFile(dest, buf)
    return
  }
  if (!s3Client) throw new Error('S3 client not initialized')
  await s3Client.send(new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
    Body: createReadStream(localPath),
  }))
}

export async function uploadBuffer(buf: Buffer, key: string): Promise<void> {
  if (config.storageBackend === 'local') {
    const dest = join(resolve(config.localDataDir), key)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, buf)
    return
  }
  if (!s3Client) throw new Error('S3 client not initialized')
  await s3Client.send(new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
    Body: buf,
  }))
}

export async function downloadFile(key: string): Promise<Buffer> {
  if (config.storageBackend === 'local') {
    return readFile(join(resolve(config.localDataDir), key))
  }
  if (!s3Client) throw new Error('S3 client not initialized')
  const resp = await s3Client.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }))
  return Buffer.from(await resp.Body!.transformToByteArray())
}

export async function deleteFile(key: string): Promise<void> {
  if (config.storageBackend === 'local') {
    const p = join(resolve(config.localDataDir), key)
    if (existsSync(p)) await unlink(p)
    return
  }
  if (!s3Client) throw new Error('S3 client not initialized')
  await s3Client.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: key }))
}

// Deletes everything stored for a job (input, chunks, transcript outputs).
// Used both for explicit user-triggered deletes and for cleaning up storage
// that has become orphaned by a jobStore restart (see listLocalJobDirs).
export async function deleteJobFiles(jobId: string): Promise<void> {
  if (config.storageBackend === 'local') {
    const dir = join(resolve(config.localDataDir), jobId)
    await rm(dir, { recursive: true, force: true })
    return
  }
  if (!s3Client) throw new Error('S3 client not initialized')
  const prefix = `${jobId}/`
  let continuationToken: string | undefined
  do {
    const listed = await s3Client.send(new ListObjectsV2Command({
      Bucket: config.s3Bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    const objects = (listed.Contents || []).filter(o => o.Key).map(o => ({ Key: o.Key! }))
    if (objects.length) {
      await s3Client.send(new DeleteObjectsCommand({ Bucket: config.s3Bucket, Delete: { Objects: objects } }))
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (continuationToken)
}

// Lists job folders present on local disk, including ones no longer tracked
// in the in-memory jobStore (e.g. after a process restart). Local-only: the
// jobStore is never persisted, so on the 'local' backend a restart orphans
// every prior job's files with no other way to discover or reclaim them.
export async function listLocalJobDirs(): Promise<Array<{ jobId: string; sizeBytes: number; updatedAt: string }>> {
  if (config.storageBackend !== 'local') return []
  const root = resolve(config.localDataDir)
  if (!existsSync(root)) return []
  const entries = await readdir(root, { withFileTypes: true })
  const results: Array<{ jobId: string; sizeBytes: number; updatedAt: string }> = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'uploads') continue
    const dirPath = join(root, entry.name)
    let sizeBytes = 0
    let newestMtimeMs = 0
    try {
      const files = await readdir(dirPath, { recursive: true, withFileTypes: true })
      for (const f of files) {
        if (!f.isFile()) continue
        const filePath = join((f as any).parentPath || (f as any).path || dirPath, f.name)
        const s = await stat(filePath)
        sizeBytes += s.size
        if (s.mtimeMs > newestMtimeMs) newestMtimeMs = s.mtimeMs
      }
    } catch {
      continue
    }
    results.push({
      jobId: entry.name,
      sizeBytes,
      updatedAt: new Date(newestMtimeMs || Date.now()).toISOString(),
    })
  }
  return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function publicUrl(key: string): string {
  if (config.storageBackend === 'local') return `/files/${key}`
  if (config.s3PublicUrl) return `${config.s3PublicUrl.replace(/\/$/, '')}/${key}`
  if (config.s3Endpoint) return `${config.s3Endpoint.replace(/\/$/, '')}/${config.s3Bucket}/${key}`
  return key
}

export async function ensureLocalDir(sub: string): Promise<string> {
  const dir = join(resolve(config.localDataDir), sub)
  await mkdir(dir, { recursive: true })
  return dir
}
