import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT || 4050),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: process.env.TRANSCRIPT_FORGE_API_KEY || 'dev-key',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // VoidAI / OpenAI-compatible
  voidaiBaseUrl: process.env.VOIDAI_BASE_URL || 'https://api.voidai.app/v1',
  voidaiApiKey: process.env.VOIDAI_API_KEY || '',
  transcribeModel: process.env.TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
  chunkMinutes: Number(process.env.CHUNK_MINUTES || 10),
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_BYTES || 5 * 1024 * 1024 * 1024), // 5GB

  // Redis / BullMQ
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Storage: local | minio | s3
  storageBackend: (process.env.STORAGE_BACKEND || 'local') as 'local' | 'minio' | 's3',
  localDataDir: process.env.LOCAL_DATA_DIR || './data',

  // MinIO / S3
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3Region: process.env.S3_REGION || 'us-east-1',
  s3AccessKey: process.env.S3_ACCESS_KEY_ID || '',
  s3SecretKey: process.env.S3_SECRET_ACCESS_KEY || '',
  s3Bucket: process.env.S3_BUCKET || 'transcript-forge',
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  s3PublicUrl: process.env.S3_PUBLIC_URL || '',
}
