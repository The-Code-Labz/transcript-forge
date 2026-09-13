export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  onRetry?: (err: unknown, attempt: number) => void
}

/**
 * Retries `fn` up to `attempts` times with linear backoff (baseDelayMs * attempt).
 * Provider-agnostic: used to survive transient network/DNS blips against any
 * transcription backend without losing the whole (potentially hours-long) job.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 2000
  let lastErr: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === attempts) break
      opts.onRetry?.(err, attempt)
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt))
    }
  }

  throw lastErr
}
