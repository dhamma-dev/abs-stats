import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'
import { config } from './config.ts'

/**
 * We never query Audiobookshelf's live database directly. We copy it (SQLite online
 * backup, opened read-only) into our own data dir and run all the heavy analytics
 * against that snapshot, so ABS is never slowed or locked.
 *
 * Copies happen on demand: when someone uses the app and the snapshot is older than
 * SNAPSHOT_MINUTES, we check whether ABS's database file has changed (a cheap stat)
 * and only copy it if it has. Nobody looking means no copies at all.
 */

let current: DatabaseSync | null = null
let version = 0
let lastRefresh: Date | null = null
/** When we last confirmed the snapshot matches the ABS file */
let lastChecked = 0
/** ABS file size + mtime at the moment of the last copy */
let sourceStamp = ''
let lastError: string | null = null
let refreshing: Promise<void> | null = null

const snapshotPath = () => path.join(config.dataDir, 'abs-snapshot.sqlite')

async function doRefresh() {
  fs.mkdirSync(config.dataDir, { recursive: true })
  if (!fs.existsSync(config.absDbPath)) {
    throw new Error(`ABS database not found at ${config.absDbPath}`)
  }
  const stamp = stampOf(config.absDbPath)
  const tmp = snapshotPath() + '.tmp'
  fs.rmSync(tmp, { force: true })
  const src = new DatabaseSync(config.absDbPath, { readOnly: true })
  try {
    await backup(src, tmp)
  } finally {
    src.close()
  }
  current?.close()
  fs.renameSync(tmp, snapshotPath())
  current = new DatabaseSync(snapshotPath(), { readOnly: true })
  version++
  lastRefresh = new Date()
  lastChecked = Date.now()
  sourceStamp = stamp
  fs.writeFileSync(stampPath(), stamp)
  lastError = null
  console.log(`[snapshot] copied ABS database (v${version})`)
}

/** Size + mtime of the ABS database (and its WAL file, if it runs in WAL mode). */
function stampOf(file: string) {
  const st = fs.statSync(file)
  let stamp = `${st.size}:${st.mtimeMs}`
  try {
    const wal = fs.statSync(file + '-wal')
    stamp += `|${wal.size}:${wal.mtimeMs}`
  } catch {
    // no WAL file - the usual case for ABS
  }
  return stamp
}

const stampPath = () => snapshotPath() + '.stamp'

export async function refreshSnapshot() {
  if (!refreshing) {
    refreshing = doRefresh()
      .catch((err) => {
        lastError = String(err?.message ?? err)
        console.error('[snapshot] refresh failed:', lastError)
        // Fall back to the previous snapshot on disk if we have one.
        if (!current && fs.existsSync(snapshotPath())) {
          current = new DatabaseSync(snapshotPath(), { readOnly: true })
          version++
        }
      })
      .finally(() => (refreshing = null))
  }
  return refreshing
}

/**
 * Makes sure the snapshot is no older than SNAPSHOT_MINUTES, copying only if ABS's
 * database actually changed. Requests wait for it, so what people see is current.
 */
export async function ensureFresh() {
  if (current && Date.now() - lastChecked < Math.max(0, config.snapshotMinutes) * 60_000) return
  try {
    if (current && sourceStamp && stampOf(config.absDbPath) === sourceStamp) {
      lastChecked = Date.now()
      return
    }
  } catch {
    // can't stat the source right now - fall through and let refresh report it
  }
  await refreshSnapshot()
}

/** On startup reuse the snapshot from last run if there is one, so we start instantly. */
export async function initSnapshot() {
  if (fs.existsSync(snapshotPath())) {
    current = new DatabaseSync(snapshotPath(), { readOnly: true })
    version++
    // lastChecked stays 0, so the first request checks ABS for changes - and only
    // copies if the file differs from what this snapshot was taken from.
    try {
      sourceStamp = fs.readFileSync(stampPath(), 'utf8').trim()
    } catch {
      sourceStamp = ''
    }
    return
  }
  await refreshSnapshot()
}

export function db(): DatabaseSync {
  if (!current) throw new Error(lastError ?? 'Database snapshot not ready yet')
  return current
}

export const snapshotVersion = () => version
export const snapshotStatus = () => ({ version, lastRefresh, lastChecked: lastChecked ? new Date(lastChecked) : null, lastError, ready: !!current })

export function all<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T[] {
  return db().prepare(sql).all(...params) as T[]
}

export function get<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined
}

/** Sequelize stores dates in SQLite as "2024-01-15 10:23:45.123 +00:00". */
export function parseDbDate(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  const s = String(v).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})?$/)
  const t = m ? Date.parse(`${m[1]}T${m[2]}${m[3] ?? 'Z'}`) : Date.parse(s)
  return Number.isNaN(t) ? null : t
}

export function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback
  if (typeof v !== 'string') return v as T
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}
