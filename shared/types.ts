// Types shared by the API server and the web client.

export type UserType = 'root' | 'admin' | 'user' | 'guest'

export interface UserSummary {
  id: string
  username: string
  type: UserType
}

export interface Me extends UserSummary {
  isAdmin: boolean
  familyVisible: boolean
}

export interface BookLite {
  id: string
  /** libraryItem id, used for cover art */
  itemId: string | null
  title: string
  authors: string[]
  kind: 'book' | 'podcast'
}

export interface Book extends BookLite {
  narrators: string[]
  series: { name: string; sequence: string | null }[]
  genres: string[]
  publishedYear: number | null
  /** seconds */
  duration: number
}

export interface NamedStat {
  name: string
  sec: number
  books: number
  /** a few itemIds to draw covers for */
  covers: string[]
}

export interface Period {
  year: number | null
  label: string
  /** YYYY-MM-DD, inclusive */
  start: string
  end: string
}

export interface Streak {
  days: number
  start: string | null
  end: string | null
}

export interface Chronotype {
  key: 'early-bird' | 'nine-to-five' | 'evening' | 'night-owl' | 'commuter' | 'weekender'
  label: string
  blurb: string
  peakHour: number
  peakWeekday: number
}

export interface FinishedBook {
  book: Book
  finishedAt: string
  startedAt: string | null
  /** calendar days from first listen to finish */
  days: number | null
  listenSec: number
  speed: number | null
}

export interface UserStats {
  user: UserSummary
  period: Period
  availableYears: number[]
  generatedAt: string
  totals: {
    listenSec: number
    bookSec: number
    podcastSec: number
    sessions: number
    activeDays: number
    daysInPeriod: number
    booksTouched: number
    booksFinished: number
    avgPerActiveDaySec: number
    avgSessionSec: number
    contentCoveredSec: number
    effectiveSpeed: number | null
    timeSavedSec: number
  }
  previous: { label: string; listenSec: number; booksFinished: number; activeDays: number } | null
  longestSession: { sec: number; date: string; book: BookLite } | null
  biggestDay: { date: string; sec: number; books: BookLite[] } | null
  streaks: { longest: Streak; current: Streak }
  /** [YYYY-MM-DD, seconds] for every day with listening */
  daily: [string, number][]
  monthly: { month: string; sec: number; booksFinished: number }[]
  /** [weekday 0=Mon..6=Sun][hour 0..23] seconds */
  hourWeekday: number[][]
  chronotype: Chronotype | null
  sessionLengths: { label: string; count: number; sec: number }[]
  devices: { name: string; sec: number; sessions: number }[]
  topBooks: { book: Book; sec: number; sessions: number; firstDate: string; lastDate: string; finished: boolean; progress: number | null }[]
  topAuthors: NamedStat[]
  topNarrators: NamedStat[]
  topGenres: NamedStat[]
  topSeries: NamedStat[]
  decades: { decade: number; sec: number; books: number }[]
  lengths: { label: string; books: number }[]
  finished: FinishedBook[]
  abandoned: { book: Book; lastDate: string; progress: number }[]
  /** Every book played in the period, ordered by when you first played it in the period */
  timeline: TimelineBook[]
  milestones: { date: string; label: string }[]
  firstBook: BookLite | null
  lastBook: BookLite | null
  equivalents: { nonstopDays: number; pages: number; roadTrips: number }
}

export interface TimelineBook {
  book: BookLite
  /** total listening in the period, seconds */
  sec: number
  /** finish date, if it was finished within the period */
  finished: string | null
  /** never finished and not played for 45+ days */
  stalled: boolean
  /** first played before the period started */
  startedBefore: boolean
  /** still being played after the period ended */
  continuesAfter: boolean
  /** [YYYY-MM-DD, seconds] for each day it was played */
  days: [string, number][]
}

export interface FamilyMember {
  user: UserSummary
  listenSec: number
  booksFinished: number
  activeDays: number
  longestStreak: number
  effectiveSpeed: number | null
  topAuthor: string | null
  topGenre: string | null
  chronotype: Chronotype | null
  monthly: { month: string; sec: number }[]
  hourly: number[]
}

export interface FamilyStats {
  period: Period
  availableYears: number[]
  members: FamilyMember[]
  household: { listenSec: number; booksFinished: number; activeDays: number; sessions: number; booksTouched: number }
  sharedBooks: { book: Book; listeners: { userId: string; sec: number; finished: boolean }[] }[]
  similarity: { a: string; b: string; score: number; shared: string[] }[]
  recommendations: { forUser: string; book: Book; from: string[] }[]
}
