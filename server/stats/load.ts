import type { Book, BookLite, UserSummary, UserType } from '../../shared/types.ts'
import { all, parseDbDate, parseJson, snapshotVersion } from '../db.ts'

export interface Session {
  id: string
  userId: string
  mediaId: string
  kind: 'book' | 'podcast'
  /** epoch ms the session started */
  start: number
  /** epoch ms of the last sync */
  end: number
  /** seconds actually listened */
  listenSec: number
  /** content seconds advanced (for speed) */
  advancedSec: number | null
  device: string
}

export interface Progress {
  userId: string
  mediaId: string
  kind: 'book' | 'podcast'
  currentTime: number
  duration: number
  isFinished: boolean
  finishedAt: number | null
  updatedAt: number | null
}

export interface Catalog {
  version: number
  users: UserSummary[]
  books: Map<string, Book>
  sessionsByUser: Map<string, Session[]>
  progressByUser: Map<string, Progress[]>
}

let cache: Catalog | null = null

export function lite(b: Book): BookLite {
  return { id: b.id, itemId: b.itemId, title: b.title, authors: b.authors, kind: b.kind }
}

function yearOf(v: unknown): number | null {
  const m = String(v ?? '').match(/\d{4}/)
  return m ? Number(m[0]) : null
}

export function catalog(): Catalog {
  const version = snapshotVersion()
  if (cache && cache.version === version) return cache

  const users: UserSummary[] = all<{ id: string; username: string; type: UserType }>(
    `SELECT id, username, type FROM users ORDER BY createdAt`,
  )

  // ---- Books
  const books = new Map<string, Book>()
  const itemByMedia = new Map<string, string>()
  for (const r of all<{ id: string; mediaId: string }>(`SELECT id, mediaId FROM libraryItems`)) itemByMedia.set(r.mediaId, r.id)

  const authorsByBook = new Map<string, string[]>()
  for (const r of all<{ bookId: string; name: string }>(
    `SELECT ba.bookId, a.name FROM bookAuthors ba JOIN authors a ON a.id = ba.authorId ORDER BY ba.createdAt`,
  )) {
    const list = authorsByBook.get(r.bookId) ?? []
    list.push(r.name)
    authorsByBook.set(r.bookId, list)
  }
  const seriesByBook = new Map<string, { name: string; sequence: string | null }[]>()
  for (const r of all<{ bookId: string; name: string; sequence: string | null }>(
    `SELECT bs.bookId, s.name, bs.sequence FROM bookSeries bs JOIN series s ON s.id = bs.seriesId`,
  )) {
    const list = seriesByBook.get(r.bookId) ?? []
    list.push({ name: r.name, sequence: r.sequence })
    seriesByBook.set(r.bookId, list)
  }

  for (const r of all<Record<string, unknown>>(
    `SELECT id, title, publishedYear, duration, narrators, genres FROM books`,
  )) {
    const id = String(r.id)
    books.set(id, {
      id,
      itemId: itemByMedia.get(id) ?? null,
      title: String(r.title ?? 'Untitled'),
      authors: authorsByBook.get(id) ?? [],
      narrators: parseJson<string[]>(r.narrators, []),
      series: seriesByBook.get(id) ?? [],
      genres: parseJson<string[]>(r.genres, []),
      publishedYear: yearOf(r.publishedYear),
      duration: Number(r.duration ?? 0),
      kind: 'book',
    })
  }

  // ---- Podcasts: we treat each show (not each episode) as one "book"-like entity
  const episodeShow = new Map<string, string>()
  try {
    for (const p of all<Record<string, unknown>>(`SELECT id, title, author, genres FROM podcasts`)) {
      const id = String(p.id)
      books.set(id, {
        id,
        itemId: itemByMedia.get(id) ?? null,
        title: String(p.title ?? 'Podcast'),
        authors: p.author ? [String(p.author)] : [],
        narrators: [],
        series: [],
        genres: parseJson<string[]>(p.genres, []),
        publishedYear: null,
        duration: 0,
        kind: 'podcast',
      })
    }
    for (const e of all<{ id: string; podcastId: string }>(`SELECT id, podcastId FROM podcastEpisodes`)) {
      episodeShow.set(e.id, e.podcastId)
    }
  } catch {
    // Older/odd databases without podcast tables - fine.
  }

  // ---- Devices
  const deviceName = new Map<string, string>()
  for (const d of all<Record<string, unknown>>(`SELECT id, clientName, deviceName FROM devices`)) {
    const client = String(d.clientName ?? '').replace(/^Abs\s*/i, 'ABS ')
    const name = String(d.deviceName ?? '').trim()
    deviceName.set(String(d.id), [name, client && `(${client})`].filter(Boolean).join(' ') || 'Unknown device')
  }

  // ---- Sessions
  const sessionsByUser = new Map<string, Session[]>()
  for (const r of all<Record<string, unknown>>(
    `SELECT id, userId, mediaItemId, mediaItemType, displayTitle, displayAuthor, duration, startTime, currentTime,
            timeListening, mediaMetadata, deviceId, mediaPlayer, createdAt, updatedAt
       FROM playbackSessions
      WHERE timeListening > 0`,
  )) {
    const isPodcast = r.mediaItemType === 'podcastEpisode'
      const mediaId = isPodcast ? episodeShow.get(String(r.mediaItemId)) ?? `ep:${r.mediaItemId}` : String(r.mediaItemId)

    // Book was deleted from the library? Rebuild what we can from the session's metadata copy.
    if (!books.has(mediaId)) {
      const meta = parseJson<Record<string, any>>(r.mediaMetadata, {})
      books.set(mediaId, {
        id: mediaId,
        itemId: null,
        title: String(r.displayTitle ?? meta.title ?? 'Unknown title'),
        authors: Array.isArray(meta.authors)
          ? meta.authors.map((a: any) => a?.name ?? String(a))
          : r.displayAuthor
            ? [String(r.displayAuthor)]
            : [],
        narrators: Array.isArray(meta.narrators) ? meta.narrators : [],
        series: Array.isArray(meta.series) ? meta.series.map((s: any) => ({ name: s.name, sequence: s.sequence ?? null })) : [],
        genres: Array.isArray(meta.genres) ? meta.genres : [],
        publishedYear: yearOf(meta.publishedYear),
        duration: isPodcast ? 0 : Number(r.duration ?? 0),
        kind: isPodcast ? 'podcast' : 'book',
      })
    }

    const start = parseDbDate(r.createdAt)
    if (start == null) continue
    const listenSec = Number(r.timeListening ?? 0)
    const end = parseDbDate(r.updatedAt) ?? start + listenSec * 1000
    const advanced = Number(r.currentTime ?? 0) - Number(r.startTime ?? 0)

    const s: Session = {
      id: String(r.id),
      userId: String(r.userId),
      mediaId,
      kind: isPodcast ? 'podcast' : 'book',
      start,
      end,
      listenSec,
      advancedSec: Number.isFinite(advanced) ? advanced : null,
      device: (r.deviceId ? deviceName.get(String(r.deviceId)) : undefined) ?? String(r.mediaPlayer ?? 'Unknown device'),
    }
    const list = sessionsByUser.get(s.userId) ?? []
    list.push(s)
    sessionsByUser.set(s.userId, list)
  }
  for (const list of sessionsByUser.values()) list.sort((a, b) => a.start - b.start)

  // ---- Progress
  const progressByUser = new Map<string, Progress[]>()
  for (const r of all<Record<string, unknown>>(
    `SELECT userId, mediaItemId, mediaItemType, currentTime, duration, isFinished, finishedAt, updatedAt FROM mediaProgresses`,
  )) {
    const isPodcast = r.mediaItemType === 'podcastEpisode'
    const p: Progress = {
      userId: String(r.userId),
      mediaId: isPodcast ? episodeShow.get(String(r.mediaItemId)) ?? `ep:${r.mediaItemId}` : String(r.mediaItemId),
      kind: isPodcast ? 'podcast' : 'book',
      currentTime: Number(r.currentTime ?? 0),
      duration: Number(r.duration ?? 0),
      isFinished: Boolean(r.isFinished),
      finishedAt: parseDbDate(r.finishedAt),
      updatedAt: parseDbDate(r.updatedAt),
    }
    const list = progressByUser.get(p.userId) ?? []
    list.push(p)
    progressByUser.set(p.userId, list)
  }

  cache = { version, users, books, sessionsByUser, progressByUser }
  return cache
}
