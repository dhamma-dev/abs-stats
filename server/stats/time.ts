import { config } from '../config.ts'

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: config.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
})

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

export interface LocalParts {
  date: string // YYYY-MM-DD
  year: number
  month: string // YYYY-MM
  hour: number
  minute: number
  weekday: number // 0 = Monday
}

function format(ms: number): LocalParts {
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    year: Number(p.year),
    month: `${p.year}-${p.month}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAYS[p.weekday] ?? 0,
  }
}

// Intl formatting is slow and we call it a lot, so memoize per 15-minute slot
// (every real-world UTC offset is a multiple of 15 minutes).
const QUARTER = 15 * 60_000
const memo = new Map<number, LocalParts>()

/** Breaks an instant into wall-clock parts in the configured timezone. */
export function local(ms: number): LocalParts {
  const q = Math.floor(ms / QUARTER)
  let base = memo.get(q)
  if (!base) {
    if (memo.size > 500_000) memo.clear()
    base = format(q * QUARTER)
    memo.set(q, base)
  }
  const extra = Math.floor((ms - q * QUARTER) / 60_000)
  return extra ? { ...base, minute: base.minute + extra } : base
}

/** Splits a listening span into per-hour chunks (seconds), walking forward from its start. */
export function spreadByHour(startMs: number, listenSec: number): { parts: LocalParts; sec: number }[] {
  const out: { parts: LocalParts; sec: number }[] = []
  let t = startMs
  let left = listenSec
  // Guard against absurd sessions (clock bugs) - cap at 48h of chunks
  let guard = 48
  while (left > 0 && guard-- > 0) {
    const parts = local(t)
    const secToNextHour = (60 - parts.minute) * 60 - (Math.floor(t / 1000) % 60)
    const chunk = Math.min(left, Math.max(1, secToNextHour))
    out.push({ parts, sec: chunk })
    left -= chunk
    t += chunk * 1000
  }
  return out
}

export const dayMs = 86_400_000

/** Days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / dayMs)
}

export function addDays(date: string, n: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * dayMs).toISOString().slice(0, 10)
}

export const today = () => local(Date.now()).date
