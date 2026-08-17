import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
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
