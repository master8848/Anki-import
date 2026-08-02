/**
 * Retry and async utilities.
 */

export interface RetryOptions {
  retries?: number;
  backoffMs?: number;
  /** Return true to stop retrying for this error. */
  shouldAbort?: (err: unknown) => boolean;
}

export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 100;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (opts.shouldAbort?.(err)) throw err;
      if (attempt < retries) {
        const delay = backoffMs * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/** Split an array into chunks of at most `size` elements. */
export function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
