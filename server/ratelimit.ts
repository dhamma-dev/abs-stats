import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { HttpError } from './auth.ts'
import { config } from './config.ts'

/**
 * Password sign-in limit, per client address. Every attempt reaches ABS from this
 * container's one address, so without this a single guesser trips ABS's own limiter
 * for the whole household.
 *
 * Attempts are counted before ABS answers, so firing many requests in parallel
 * doesn't get around the limit. A successful sign-in clears the count.
 */

const MAX_FAILURES = 10
const WINDOW_MS = 15 * 60_000
const MAX_TRACKED = 10_000

const attempts = new Map<string, { count: number; resetAt: number }>()

/** Behind a proxy, the last X-Forwarded-For entry is the one the proxy added, so clients can't spoof it. */
export function clientIp(c: Context): string {
  if (config.trustProxy) {
    const last = c.req.header('x-forwarded-for')?.split(',').pop()?.trim()
    if (last) return last
  }
  return getConnInfo(c).remote.address ?? 'unknown'
}

/** Records an attempt, or throws 429 if this address has used up its window. */
export function takeLoginAttempt(ip: string) {
  const now = Date.now()
  let entry = attempts.get(ip)
  if (!entry || entry.resetAt <= now) {
    if (attempts.size >= MAX_TRACKED) prune(now)
    entry = { count: 0, resetAt: now + WINDOW_MS }
    attempts.set(ip, entry)
  }
  if (entry.count >= MAX_FAILURES) {
    const minutes = Math.ceil((entry.resetAt - now) / 60_000)
    throw new HttpError(429, `Too many sign-in attempts - try again in ${minutes} minute${minutes === 1 ? '' : 's'}`)
  }
  entry.count++
}

export function clearLoginAttempts(ip: string) {
  attempts.delete(ip)
}

function prune(now: number) {
  for (const [ip, e] of attempts) if (e.resetAt <= now) attempts.delete(ip)
  // Still full means a flood of distinct addresses; drop the oldest rather than grow.
  while (attempts.size >= MAX_TRACKED) attempts.delete(attempts.keys().next().value!)
}
