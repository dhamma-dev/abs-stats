import type {
  Book,
  Chronotype,
  FamilyMember,
  FamilyStats,
  FinishedBook,
  NamedStat,
  Period,
  Streak,
  TimelineBook,
  UserStats,
  UserSummary,
} from '../../shared/types.ts'
import { catalog, lite, type Catalog, type Progress, type Session } from './load.ts'
import { addDays, daysBetween, local, spreadByHour, today } from './time.ts'

// ---------------------------------------------------------------- helpers

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function bump<K>(m: Map<K, number>, k: K, v: number) {
  m.set(k, (m.get(k) ?? 0) + v)
}

export function availableYears(c: Catalog, userIds: string[]): number[] {
  const years = new Set<number>()
  for (const id of userIds) for (const s of c.sessionsByUser.get(id) ?? []) years.add(local(s.start).year)
  return [...years].sort((a, b) => b - a)
}

function makePeriod(year: number | null, years: number[]): Period {
  if (year != null) return { year, label: String(year), start: `${year}-01-01`, end: `${year}-12-31` }
  const first = years.length ? Math.min(...years) : new Date().getFullYear()
  return { year: null, label: 'All time', start: `${first}-01-01`, end: today() }
}

const inPeriod = (date: string, p: Period) => date >= p.start && date <= p.end

/** Effective playback speed of a session, if it can be trusted. */
function sessionSpeed(s: Session): number | null {
  if (s.kind !== 'book' || s.listenSec < 120 || s.advancedSec == null || s.advancedSec <= 0) return null
  const r = s.advancedSec / s.listenSec
  return r >= 0.5 && r <= 3.5 ? r : null
}

function streaksOf(dates: string[], endOfPeriod: string): { longest: Streak; current: Streak } {
  const sorted = [...new Set(dates)].sort()
  let longest: Streak = { days: 0, start: null, end: null }
  let run: Streak = { days: 0, start: null, end: null }
  let prev: string | null = null
  for (const d of sorted) {
    if (prev && daysBetween(prev, d) === 1) run = { days: run.days + 1, start: run.start, end: d }
    else run = { days: 1, start: d, end: d }
    if (run.days > longest.days) longest = { ...run }
    prev = d
  }
  // "Current" streak only means something if it reaches today (or yesterday) within the period.
  const t = today()
  const current = endOfPeriod >= t && run.end && daysBetween(run.end, t) <= 1 ? run : { days: 0, start: null, end: null }
  return { longest, current }
}

const CHRONO: Record<Chronotype['key'], { label: string; blurb: string }> = {
  'early-bird': { label: 'Early Bird', blurb: 'Your stories start before the coffee is done.' },
  'nine-to-five': { label: 'Daytime Listener', blurb: 'Books are your soundtrack to the working day.' },
  evening: { label: 'Evening Unwinder', blurb: 'You save the best chapters for after dinner.' },
  'night-owl': { label: 'Night Owl', blurb: 'Your best listening happens after dark.' },
  commuter: { label: 'Road Warrior', blurb: 'Rush hour is story hour.' },
  weekender: { label: 'Weekend Binger', blurb: 'Saturdays were made for audiobooks.' },
}

function chronotypeOf(hw: number[][]): Chronotype | null {
  const total = sum(hw.flat())
  if (total < 3600) return null
  const byHour = Array.from({ length: 24 }, (_, h) => sum(hw.map((row) => row[h])))
  const byDay = hw.map((row) => sum(row))
  const share = (hours: number[], days = [0, 1, 2, 3, 4, 5, 6]) =>
    sum(days.flatMap((d) => hours.map((h) => hw[d][h]))) / total
  const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => (a + i) % 24)

  const scores: [Chronotype['key'], number][] = [
    ['early-bird', share(range(4, 9)) * 2.2],
    ['nine-to-five', share(range(9, 17)) * 1.0],
    ['evening', share(range(17, 22)) * 1.4],
    ['night-owl', share(range(22, 28)) * 2.0],
    ['commuter', share([6, 7, 8, 16, 17, 18], [0, 1, 2, 3, 4]) * 1.9],
    ['weekender', ((byDay[5] + byDay[6]) / total) * 1.5],
  ]
  scores.sort((a, b) => b[1] - a[1])
  const key = scores[0][0]
  return {
    key,
    ...CHRONO[key],
    peakHour: byHour.indexOf(Math.max(...byHour)),
    peakWeekday: byDay.indexOf(Math.max(...byDay)),
  }
}

const SESSION_BUCKETS: [string, number][] = [
  ['< 5 min', 5 * 60],
  ['5–15 min', 15 * 60],
  ['15–30 min', 30 * 60],
  ['30–60 min', 60 * 60],
  ['1–2 hr', 2 * 3600],
  ['2–4 hr', 4 * 3600],
  ['4 hr +', Infinity],
]

const LENGTH_BUCKETS: [string, number][] = [
  ['< 5 hr', 5 * 3600],
  ['5–10 hr', 10 * 3600],
  ['10–15 hr', 15 * 3600],
  ['15–20 hr', 20 * 3600],
  ['20–30 hr', 30 * 3600],
  ['30 hr +', Infinity],
]

function topNamed(
  bookSec: Map<string, number>,
  books: Map<string, Book>,
  pick: (b: Book) => string[],
  limit = 10,
): NamedStat[] {
  const acc = new Map<string, { sec: number; books: Set<string>; covers: [string, number][] }>()
  for (const [id, sec] of bookSec) {
    const b = books.get(id)
    if (!b) continue
    for (const raw of new Set(pick(b))) {
      const name = raw?.trim()
      if (!name) continue
      const e = acc.get(name) ?? { sec: 0, books: new Set(), covers: [] }
      e.sec += sec
      e.books.add(id)
      if (b.itemId) e.covers.push([b.itemId, sec])
      acc.set(name, e)
    }
  }
  return [...acc.entries()]
    .map(([name, e]) => ({
      name,
      sec: Math.round(e.sec),
      books: e.books.size,
      covers: e.covers.sort((a, b) => b[1] - a[1]).slice(0, 4).map((c) => c[0]),
    }))
    .sort((a, b) => b.sec - a.sec)
    .slice(0, limit)
}

// ---------------------------------------------------------------- user stats

interface Core {
  sessions: Session[]
  progress: Progress[]
  bookSec: Map<string, number>
  dailySec: Map<string, number>
  hourWeekday: number[][]
  finished: Progress[]
}

function core(c: Catalog, userId: string, p: Period): Core {
  const all = c.sessionsByUser.get(userId) ?? []
  const progress = c.progressByUser.get(userId) ?? []
  const sessions: Session[] = []
  const bookSec = new Map<string, number>()
  const dailySec = new Map<string, number>()
  const hourWeekday = Array.from({ length: 7 }, () => Array<number>(24).fill(0))

  for (const s of all) {
    const chunks = spreadByHour(s.start, s.listenSec)
    let counted = false
    for (const { parts, sec } of chunks) {
      if (!inPeriod(parts.date, p)) continue
      counted = true
      bump(dailySec, parts.date, sec)
      hourWeekday[parts.weekday][parts.hour] += sec
      bump(bookSec, s.mediaId, sec)
    }
    if (counted) sessions.push(s)
  }
  const finished = progress.filter(
    (pr) => pr.isFinished && pr.kind === 'book' && pr.finishedAt != null && inPeriod(local(pr.finishedAt).date, p),
  )
  return { sessions, progress, bookSec, dailySec, hourWeekday, finished }
}

export function userStats(userId: string, year: number | null): UserStats {
  const c = catalog()
  const user = c.users.find((u) => u.id === userId)
  if (!user) throw new Error('Unknown user')
  const years = availableYears(c, [userId])
  const period = makePeriod(year, years)
  const k = core(c, userId, period)
  const allSessions = c.sessionsByUser.get(userId) ?? []
  const book = (id: string) => c.books.get(id)!

  // ---- totals
  const listenSec = sum([...k.dailySec.values()])
  const podcastSec = sum([...k.bookSec].filter(([id]) => book(id)?.kind === 'podcast').map(([, s]) => s))
  const activeDays = k.dailySec.size
  let speedNum = 0
  let speedDen = 0
  for (const s of k.sessions) {
    const r = sessionSpeed(s)
    if (r != null) {
      speedNum += r * s.listenSec
      speedDen += s.listenSec
    }
  }
  const effectiveSpeed = speedDen > 3600 ? speedNum / speedDen : null
  const bookListen = listenSec - podcastSec
  const contentCoveredSec = effectiveSpeed ? bookListen * effectiveSpeed + podcastSec : listenSec
  const periodEnd = period.end < today() ? period.end : today()
  const daysInPeriod = daysBetween(period.start, periodEnd) + 1

  // ---- first/last listen of each book (all-time), and where it finished
  const firstListen = new Map<string, number>()
  const lastListen = new Map<string, number>()
  const allTimeSec = new Map<string, number>()
  for (const s of allSessions) {
    if (!firstListen.has(s.mediaId)) firstListen.set(s.mediaId, s.start)
    lastListen.set(s.mediaId, s.start)
    bump(allTimeSec, s.mediaId, s.listenSec)
  }
  const progressOf = new Map(k.progress.map((p) => [p.mediaId, p]))

  // ---- finished books
  const finished: FinishedBook[] = k.finished
    .map((pr) => {
      const b = book(pr.mediaId)
      if (!b) return null
      const fin = local(pr.finishedAt!).date
      const first = firstListen.get(pr.mediaId)
      const startedAt = first != null ? local(first).date : null
      const ls = allTimeSec.get(pr.mediaId) ?? 0
      const dur = b.duration || pr.duration
      const sp = ls > 600 && dur > 0 ? dur / ls : null
      return {
        book: b,
        finishedAt: fin,
        startedAt,
        days: startedAt ? Math.max(0, daysBetween(startedAt, fin)) + 1 : null,
        listenSec: Math.round(ls),
        speed: sp && sp >= 0.5 && sp <= 4 ? sp : null,
      }
    })
    .filter((x): x is FinishedBook => x != null)
    .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))

  // ---- abandoned ("left behind")
  const staleBefore = addDays(periodEnd, -45)
  const abandoned = k.progress
    .filter((pr) => pr.kind === 'book' && !pr.isFinished && k.bookSec.has(pr.mediaId))
    .map((pr) => {
      const b = book(pr.mediaId)
      const dur = pr.duration || b?.duration || 0
      const progress = dur > 0 ? pr.currentTime / dur : 0
      const last = lastListen.get(pr.mediaId)
      return { b, progress, lastDate: last != null ? local(last).date : '' }
    })
    .filter((x) => x.b && x.progress > 0.02 && x.progress < 0.9 && x.lastDate && x.lastDate < staleBefore)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 12)
    .map((x) => ({ book: x.b!, lastDate: x.lastDate, progress: x.progress }))

  // ---- longest session / biggest day
  let longestSession: UserStats['longestSession'] = null
  for (const s of k.sessions) {
    if (!longestSession || s.listenSec > longestSession.sec) {
      longestSession = { sec: s.listenSec, date: local(s.start).date, book: lite(book(s.mediaId)) }
    }
  }
  let biggestDay: UserStats['biggestDay'] = null
  for (const [date, sec] of k.dailySec) if (!biggestDay || sec > biggestDay.sec) biggestDay = { date, sec, books: [] }
  if (biggestDay) {
    const ids = new Set(k.sessions.filter((s) => local(s.start).date === biggestDay!.date).map((s) => s.mediaId))
    biggestDay.books = [...ids].map((id) => lite(book(id)))
  }

  // ---- monthly
  const monthSec = new Map<string, number>()
  for (const [d, s] of k.dailySec) bump(monthSec, d.slice(0, 7), s)
  const monthFinished = new Map<string, number>()
  for (const f of finished) bump(monthFinished, f.finishedAt.slice(0, 7), 1)
  const months: string[] = []
  for (let m = period.start.slice(0, 7); m <= periodEnd.slice(0, 7); ) {
    months.push(m)
    const [y, mo] = m.split('-').map(Number)
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  }
  const monthly = months.map((month) => ({
    month,
    sec: Math.round(monthSec.get(month) ?? 0),
    booksFinished: monthFinished.get(month) ?? 0,
  }))

  // ---- session lengths & devices
  const sessionLengths = SESSION_BUCKETS.map(([label]) => ({ label, count: 0, sec: 0 }))
  const deviceSec = new Map<string, { sec: number; sessions: number }>()
  for (const s of k.sessions) {
    const i = SESSION_BUCKETS.findIndex(([, max]) => s.listenSec < max)
    sessionLengths[i].count++
    sessionLengths[i].sec += s.listenSec
    const d = deviceSec.get(s.device) ?? { sec: 0, sessions: 0 }
    d.sec += s.listenSec
    d.sessions++
    deviceSec.set(s.device, d)
  }
  const devices = [...deviceSec]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 8)

  // ---- top books
  const sessionsPerBook = new Map<string, Session[]>()
  for (const s of k.sessions) {
    const list = sessionsPerBook.get(s.mediaId) ?? []
    list.push(s)
    sessionsPerBook.set(s.mediaId, list)
  }
  const topBooks = [...k.bookSec]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id, sec]) => {
      const ss = sessionsPerBook.get(id) ?? []
      const pr = progressOf.get(id)
      const dur = pr?.duration || book(id).duration
      return {
        book: book(id),
        sec: Math.round(sec),
        sessions: ss.length,
        firstDate: ss.length ? local(ss[0].start).date : period.start,
        lastDate: ss.length ? local(ss[ss.length - 1].start).date : period.start,
        finished: !!pr?.isFinished,
        progress: pr && dur ? Math.min(1, pr.currentTime / dur) : null,
      }
    })

  // ---- taste (books only for narrators/series/decades)
  const onlyBooks = new Map([...k.bookSec].filter(([id]) => book(id)?.kind === 'book'))
  const topAuthors = topNamed(onlyBooks, c.books, (b) => b.authors)
  const topNarrators = topNamed(onlyBooks, c.books, (b) => b.narrators)
  const topGenres = topNamed(k.bookSec, c.books, (b) => b.genres)
  const topSeries = topNamed(onlyBooks, c.books, (b) => b.series.map((s) => s.name))

  const decadeAcc = new Map<number, { sec: number; books: number }>()
  for (const [id, sec] of onlyBooks) {
    const y = book(id).publishedYear
    if (!y || y < 1000) continue
    const d = Math.floor(y / 10) * 10
    const e = decadeAcc.get(d) ?? { sec: 0, books: 0 }
    e.sec += sec
    e.books++
    decadeAcc.set(d, e)
  }
  const decades = [...decadeAcc]
    .map(([decade, v]) => ({ decade, sec: Math.round(v.sec), books: v.books }))
    .sort((a, b) => a.decade - b.decade)

  const lengths = LENGTH_BUCKETS.map(([label]) => ({ label, books: 0 }))
  for (const id of onlyBooks.keys()) {
    const dur = book(id).duration
    if (!dur) continue
    lengths[LENGTH_BUCKETS.findIndex(([, max]) => dur < max)].books++
  }

  // ---- timeline: every book played in the period, day by day, in the order you started them
  const timeline: TimelineBook[] = [...sessionsPerBook]
    .map(([id, ss]) => {
      const days = new Map<string, number>()
      for (const s of ss)
        for (const { parts, sec } of spreadByHour(s.start, s.listenSec))
          if (inPeriod(parts.date, period)) bump(days, parts.date, sec)
      const fin = finished.find((f) => f.book.id === id)
      const sorted = [...days].sort((a, b) => a[0].localeCompare(b[0]))
      const lastDay = sorted.length ? sorted[sorted.length - 1][0] : period.start
      const pr = progressOf.get(id)
      return {
        book: lite(book(id)),
        sec: Math.round(k.bookSec.get(id) ?? 0),
        finished: fin?.finishedAt ?? null,
        stalled: !fin && !pr?.isFinished && local(lastListen.get(id)!).date < staleBefore,
        startedBefore: local(firstListen.get(id)!).date < period.start,
        continuesAfter: !fin && local(lastListen.get(id)!).date > period.end,
        days: sorted.map(([d, sec]) => [d, Math.round(sec)] as [string, number]),
        _first: sorted[0]?.[0] ?? lastDay,
      }
    })
    .filter((t) => t.days.length)
    .sort((a, b) => a._first.localeCompare(b._first) || b.sec - a.sec)
    .map(({ _first, ...t }) => t)

  // ---- milestones
  const milestones: { date: string; label: string }[] = []
  const hourMarks = [10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000]
  let cum = 0
  let mi = 0
  for (const [date, sec] of [...k.dailySec].sort((a, b) => a[0].localeCompare(b[0]))) {
    cum += sec
    while (mi < hourMarks.length && cum >= hourMarks[mi] * 3600) {
      milestones.push({ date, label: `${hourMarks[mi]} hours listened` })
      mi++
    }
  }
  const bookMarks = new Set([1, 5, 10, 25, 50, 75, 100, 150, 200])
  finished.forEach((f, i) => {
    if (bookMarks.has(i + 1))
      milestones.push({ date: f.finishedAt, label: i === 0 ? `First finish: ${f.book.title}` : `Book #${i + 1}: ${f.book.title}` })
  })
  milestones.sort((a, b) => a.date.localeCompare(b.date))

  // ---- previous period for deltas
  let previous: UserStats['previous'] = null
  if (year != null && years.includes(year - 1)) {
    const pp = makePeriod(year - 1, years)
    // A year still in progress is compared with the same stretch of last year.
    const partial = periodEnd < period.end
    if (partial) pp.end = `${year - 1}${periodEnd.slice(4)}`
    const pk = core(c, userId, pp)
    previous = {
      label: partial ? `same dates in ${year - 1}` : String(year - 1),
      listenSec: Math.round(sum([...pk.dailySec.values()])),
      booksFinished: pk.finished.length,
      activeDays: pk.dailySec.size,
    }
  }

  const bookSessions = k.sessions.filter((s) => s.kind === 'book')
  const contentHours = contentCoveredSec / 3600

  return {
    user,
    period,
    availableYears: years,
    generatedAt: new Date().toISOString(),
    totals: {
      listenSec: Math.round(listenSec),
      bookSec: Math.round(bookListen),
      podcastSec: Math.round(podcastSec),
      sessions: k.sessions.length,
      activeDays,
      daysInPeriod,
      booksTouched: [...k.bookSec.keys()].filter((id) => book(id)?.kind === 'book').length,
      booksFinished: finished.length,
      avgPerActiveDaySec: activeDays ? Math.round(listenSec / activeDays) : 0,
      avgSessionSec: k.sessions.length ? Math.round(listenSec / k.sessions.length) : 0,
      contentCoveredSec: Math.round(contentCoveredSec),
      effectiveSpeed,
      timeSavedSec: Math.max(0, Math.round(contentCoveredSec - listenSec)),
    },
    previous,
    longestSession,
    biggestDay: biggestDay && { ...biggestDay, sec: Math.round(biggestDay.sec) },
    streaks: streaksOf([...k.dailySec.keys()], periodEnd),
    daily: [...k.dailySec].sort((a, b) => a[0].localeCompare(b[0])).map(([d, s]) => [d, Math.round(s)]),
    monthly,
    hourWeekday: k.hourWeekday.map((row) => row.map(Math.round)),
    chronotype: chronotypeOf(k.hourWeekday),
    sessionLengths,
    devices,
    topBooks,
    topAuthors,
    topNarrators,
    topGenres,
    topSeries,
    decades,
    lengths,
    finished,
    abandoned,
    timeline,
    milestones,
    firstBook: bookSessions.length ? lite(book(bookSessions[0].mediaId)) : null,
    lastBook: bookSessions.length ? lite(book(bookSessions[bookSessions.length - 1].mediaId)) : null,
    equivalents: {
      nonstopDays: listenSec / 86400,
      // ~9,300 words per audiobook hour at 1x, ~300 words per printed page
      pages: Math.round(contentHours * 31),
      // a coast-to-coast US drive is roughly 42 hours behind the wheel
      roadTrips: contentHours / 42,
    },
  }
}

// ---------------------------------------------------------------- family

export function familyStats(year: number | null): FamilyStats {
  const c = catalog()
  const ids = c.users.map((u) => u.id).filter((id) => (c.sessionsByUser.get(id)?.length ?? 0) > 0)
  const years = availableYears(c, ids)
  const period = makePeriod(year, years)

  const cores = new Map(ids.map((id) => [id, core(c, id, period)]))
  const members: FamilyMember[] = []
  for (const id of ids) {
    const k = cores.get(id)!
    const listenSec = sum([...k.dailySec.values()])
    if (listenSec <= 0) continue
    const user = c.users.find((u) => u.id === id)!
    let num = 0
    let den = 0
    for (const s of k.sessions) {
      const r = sessionSpeed(s)
      if (r != null) {
        num += r * s.listenSec
        den += s.listenSec
      }
    }
    const books = new Map([...k.bookSec].filter(([b]) => c.books.get(b)?.kind === 'book'))
    const monthSec = new Map<string, number>()
    for (const [d, s] of k.dailySec) bump(monthSec, d.slice(0, 7), s)
    members.push({
      user,
      listenSec: Math.round(listenSec),
      booksFinished: k.finished.length,
      activeDays: k.dailySec.size,
      longestStreak: streaksOf([...k.dailySec.keys()], period.end).longest.days,
      effectiveSpeed: den > 3600 ? num / den : null,
      topAuthor: topNamed(books, c.books, (b) => b.authors, 1)[0]?.name ?? null,
      topGenre: topNamed(k.bookSec, c.books, (b) => b.genres, 1)[0]?.name ?? null,
      chronotype: chronotypeOf(k.hourWeekday),
      monthly: [...monthSec].sort((a, b) => a[0].localeCompare(b[0])).map(([month, sec]) => ({ month, sec: Math.round(sec) })),
      hourly: Array.from({ length: 24 }, (_, h) => Math.round(sum(k.hourWeekday.map((r) => r[h])))),
    })
  }
  members.sort((a, b) => b.listenSec - a.listenSec)
  const active = members.map((m) => m.user.id)

  // ---- household totals
  const householdDays = new Set<string>()
  const householdBooks = new Set<string>()
  let sessions = 0
  for (const id of active) {
    const k = cores.get(id)!
    for (const d of k.dailySec.keys()) householdDays.add(d)
    for (const b of k.bookSec.keys()) if (c.books.get(b)?.kind === 'book') householdBooks.add(b)
    sessions += k.sessions.length
  }

  // ---- shared books
  const listeners = new Map<string, { userId: string; sec: number; finished: boolean }[]>()
  for (const id of active) {
    const k = cores.get(id)!
    const fin = new Set((c.progressByUser.get(id) ?? []).filter((p) => p.isFinished).map((p) => p.mediaId))
    for (const [b, sec] of k.bookSec) {
      if (c.books.get(b)?.kind !== 'book' || sec < 600) continue
      const list = listeners.get(b) ?? []
      list.push({ userId: id, sec: Math.round(sec), finished: fin.has(b) })
      listeners.set(b, list)
    }
  }
  const sharedBooks = [...listeners]
    .filter(([, l]) => l.length > 1)
    .sort((a, b) => b[1].length - a[1].length || sum(b[1].map((x) => x.sec)) - sum(a[1].map((x) => x.sec)))
    .slice(0, 24)
    .map(([id, l]) => ({ book: c.books.get(id)!, listeners: l.sort((a, b) => b.sec - a.sec) }))

  // ---- taste similarity: cosine over (all-time) author listening vectors
  const vectors = new Map<string, Map<string, number>>()
  for (const id of active) {
    const v = new Map<string, number>()
    for (const s of c.sessionsByUser.get(id) ?? []) {
      const b = c.books.get(s.mediaId)
      if (b?.kind !== 'book') continue
      for (const a of b.authors) bump(v, a, s.listenSec)
      for (const g of b.genres) bump(v, `genre:${g}`, s.listenSec * 0.5)
    }
    vectors.set(id, v)
  }
  const norm = (v: Map<string, number>) => Math.sqrt(sum([...v.values()].map((x) => x * x)))
  const similarity: FamilyStats['similarity'] = []
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = vectors.get(active[i])!
      const b = vectors.get(active[j])!
      let dot = 0
      const shared: [string, number][] = []
      for (const [key, x] of a) {
        const y = b.get(key)
        if (y) {
          dot += x * y
          if (!key.startsWith('genre:')) shared.push([key, Math.min(x, y)])
        }
      }
      const score = dot / ((norm(a) * norm(b)) || 1)
      similarity.push({
        a: active[i],
        b: active[j],
        score,
        shared: shared.sort((p, q) => q[1] - p[1]).slice(0, 5).map((s) => s[0]),
      })
    }
  similarity.sort((a, b) => b.score - a.score)

  // ---- recommendations: books others finished (all-time) that you've never touched
  const finishedBy = new Map<string, string[]>()
  for (const id of active)
    for (const p of c.progressByUser.get(id) ?? [])
      if (p.isFinished && p.kind === 'book' && c.books.get(p.mediaId)?.itemId) {
        const list = finishedBy.get(p.mediaId) ?? []
        list.push(id)
        finishedBy.set(p.mediaId, list)
      }
  const recommendations: FamilyStats['recommendations'] = []
  for (const id of active) {
    const touched = new Set((c.sessionsByUser.get(id) ?? []).map((s) => s.mediaId))
    for (const p of c.progressByUser.get(id) ?? []) touched.add(p.mediaId)
    const mine = vectors.get(id)!
    const candidates = [...finishedBy]
      .filter(([b, who]) => !touched.has(b) && who.some((w) => w !== id))
      .map(([b, who]) => {
        const book = c.books.get(b)!
        const affinity = sum(book.authors.map((a) => mine.get(a) ?? 0)) + sum(book.genres.map((g) => mine.get(`genre:${g}`) ?? 0))
        return { book, from: who.filter((w) => w !== id), score: who.length * 3600 + affinity }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
    for (const cnd of candidates) recommendations.push({ forUser: id, book: cnd.book, from: cnd.from })
  }

  return {
    period,
    availableYears: years,
    members,
    household: {
      listenSec: sum(members.map((m) => m.listenSec)),
      booksFinished: sum(members.map((m) => m.booksFinished)),
      activeDays: householdDays.size,
      sessions,
      booksTouched: householdBooks.size,
    },
    sharedBooks,
    similarity,
    recommendations,
  }
}

export function listUsers(): UserSummary[] {
  return catalog().users
}
