import { toPng } from 'html-to-image'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { FamilyStats, UserStats } from '../../../shared/types.ts'
import { useView } from '../lib/view.ts'
import { Cover } from '../components/ui.tsx'
import { useFamily } from '../lib/api.ts'
import { authors, date, duration, hourLabel, monthLong, monthShort, num, num1, plural, WEEKDAYS } from '../lib/format.ts'

const SLIDE_MS = 7000

// ---------------------------------------------------------------- bits

function useCountUp(target: number, ms = 1600, decimals = 0) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 4)
      setV(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return decimals ? v.toFixed(decimals) : num(v)
}

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
})

function Kicker({ children, delay = 0.1 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.p {...rise(delay)} className="text-[15px] font-semibold uppercase tracking-[0.14em] text-white/70">
      {children}
    </motion.p>
  )
}

function Big({ children, delay = 0.3, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div {...rise(delay)} className={`font-semibold leading-[0.95] tracking-tight text-white ${className}`}>
      {children}
    </motion.div>
  )
}

function Line({ children, delay = 0.8 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.p {...rise(delay)} className="max-w-[30ch] text-[19px] leading-snug text-white/85">
      {children}
    </motion.p>
  )
}

// ---------------------------------------------------------------- slides

interface Slide {
  key: string
  bg: string
  render: () => ReactNode
}

function CountHours({ sec }: { sec: number }) {
  const v = useCountUp(sec / 3600)
  return <>{v}</>
}

function buildSlides(s: UserStats, fam: FamilyStats | undefined, meId: string): Slide[] {
  const t = s.totals
  const year = s.period.label
  const slides: Slide[] = []
  // Book slides are about books; podcasts get a mention of their own.
  const topBooks = s.topBooks.filter((b) => b.book.kind === 'book')
  const topPodcast = s.topBooks.find((b) => b.book.kind === 'podcast')
  const bestMonth = s.monthly.reduce((a, m) => (m.sec > a.sec ? m : a), s.monthly[0])
  const maxMonth = Math.max(1, ...s.monthly.map((m) => m.sec))

  slides.push({
    key: 'intro',
    bg: 'radial-gradient(120% 80% at 20% 10%, #3b2ca8 0%, #1a1446 45%, #0b0b14 100%)',
    render: () => (
      <div className="flex flex-col gap-6">
        <Kicker>{s.user.username}</Kicker>
        <Big className="text-[64px] sm:text-[88px]">
          Your {year}
          <br />
          in audiobooks
        </Big>
        <Line delay={0.9}>{num(t.sessions)} sessions. {plural(t.booksTouched, 'book')}. Let's press play.</Line>
      </div>
    ),
  })

  slides.push({
    key: 'hours',
    bg: 'linear-gradient(160deg, #0f3b7a 0%, #1c5cab 40%, #0b1e3a 100%)',
    render: () => (
      <div className="flex flex-col gap-5">
        <Kicker>You listened for</Kicker>
        <Big className="text-[110px] sm:text-[150px]">
          <CountHours sec={t.listenSec} />
        </Big>
        <Big delay={0.5} className="text-[34px]">hours</Big>
        <Line delay={1.4}>
          That's {num1(s.equivalents.nonstopDays)} full days of stories — about {num(s.equivalents.pages)} pages if you'd read them instead.
        </Line>
        {topPodcast && (
          <Line delay={1.8}>
            Plus {duration(t.podcastSec)} of podcasts, mostly {topPodcast.book.title}.
          </Line>
        )}
        {s.previous && (
          <Line delay={2.2}>
            {t.listenSec >= s.previous.listenSec ? 'Up' : 'Down'} {Math.round(Math.abs(t.listenSec / Math.max(1, s.previous.listenSec) - 1) * 100)}% from {s.previous.label}.
          </Line>
        )}
      </div>
    ),
  })

  if (bestMonth?.sec)
    slides.push({
      key: 'month',
      bg: 'linear-gradient(170deg, #7a2e0e 0%, #c2410c 45%, #2a0f05 100%)',
      render: () => (
        <div className="flex flex-col gap-6">
          <Kicker>Your biggest month</Kicker>
          <Big className="text-[72px] sm:text-[96px]">{monthLong(bestMonth.month)}</Big>
          <div className="flex h-40 items-end gap-1.5">
            {s.monthly.map((m, i) => (
              <motion.div
                key={m.month}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(3, (m.sec / maxMonth) * 100)}%` }}
                transition={{ delay: 0.5 + i * 0.06, duration: 0.6, ease: 'easeOut' }}
                className="flex-1 rounded-t-md"
                style={{ background: m.month === bestMonth.month ? '#fff' : 'rgba(255,255,255,0.35)' }}
                title={`${monthShort(m.month)}: ${duration(m.sec)}`}
              />
            ))}
          </div>
          <Line delay={1.4}>
            {duration(bestMonth.sec)} of listening{bestMonth.booksFinished ? ` and ${plural(bestMonth.booksFinished, 'book')} finished` : ''}.
          </Line>
        </div>
      ),
    })

  slides.push({
    key: 'days',
    bg: 'linear-gradient(165deg, #064e3b 0%, #047857 45%, #022c22 100%)',
    render: () => (
      <div className="flex flex-col gap-6">
        <Kicker>You showed up on</Kicker>
        <Big className="text-[110px] sm:text-[140px]">{t.activeDays}</Big>
        <Big delay={0.5} className="text-[34px]">days</Big>
        <MiniCalendar s={s} />
        <Line delay={1.6}>
          Your longest streak: <b>{plural(s.streaks.longest.days, 'day')}</b> in a row
          {s.streaks.longest.start ? `, from ${date(s.streaks.longest.start)} to ${date(s.streaks.longest.end!)}` : ''}.
        </Line>
      </div>
    ),
  })

  if (s.chronotype) {
    const c = s.chronotype
    const hourly = Array.from({ length: 24 }, (_, h) => s.hourWeekday.reduce((a, r) => a + r[h], 0))
    const max = Math.max(1, ...hourly)
    slides.push({
      key: 'chrono',
      bg: c.key === 'night-owl' || c.key === 'evening' ? 'linear-gradient(170deg, #0b1026 0%, #1e1b4b 50%, #020617 100%)' : 'linear-gradient(170deg, #f59e0b 0%, #ea580c 45%, #431407 100%)',
      render: () => (
        <div className="flex flex-col gap-6">
          <Kicker>Your listening personality</Kicker>
          <Big className="text-[64px] sm:text-[84px]">{c.label}</Big>
          <Line delay={0.7}>{c.blurb}</Line>
          <div className="flex h-28 items-end gap-[3px]">
            {hourly.map((v, h) => (
              <motion.div
                key={h}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(3, (v / max) * 100)}%` }}
                transition={{ delay: 0.9 + h * 0.03, duration: 0.5 }}
                className="flex-1 rounded-t-sm"
                style={{ background: h === c.peakHour ? '#fff' : 'rgba(255,255,255,0.35)' }}
              />
            ))}
          </div>
          <div className="-mt-4 flex justify-between text-[12px] text-white/60">
            <span>12am</span>
            <span>6am</span>
            <span>noon</span>
            <span>6pm</span>
            <span>11pm</span>
          </div>
          <Line delay={1.6}>
            Peak hour: <b>{hourLabel(c.peakHour)}</b>. Favorite day: <b>{WEEKDAYS[c.peakWeekday]}</b>.
          </Line>
        </div>
      ),
    })
  }

  const top = topBooks[0]
  if (top)
    slides.push({
      key: 'topbook',
      bg: 'radial-gradient(100% 70% at 50% 0%, #4c1d95 0%, #2e1065 50%, #0c0618 100%)',
      render: () => (
        <div className="flex flex-col items-center gap-6 text-center">
          <Kicker>Your most played book</Kicker>
          <motion.div initial={{ opacity: 0, scale: 0.7, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 120, damping: 14 }}>
            <Cover itemId={top.book.itemId} title={top.book.title} size={240} rounded={18} className="shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]" />
          </motion.div>
          <Big delay={0.7} className="text-[36px] sm:text-[44px]">{top.book.title}</Big>
          <Line delay={1}>
            by {authors(top.book.authors)} — {duration(top.sec)} across {plural(top.sessions, 'session')}
            {top.finished ? '. Finished!' : '.'}
          </Line>
        </div>
      ),
    })

  if (topBooks.length >= 3)
    slides.push({
      key: 'top5',
      bg: 'linear-gradient(165deg, #831843 0%, #be185d 45%, #2a0614 100%)',
      render: () => (
        <div className="flex flex-col gap-6">
          <Kicker>Your top books</Kicker>
          <ol className="flex flex-col gap-3.5">
            {topBooks.slice(0, 5).map((b, i) => (
              <motion.li key={b.book.id} initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.18, duration: 0.5 }} className="flex items-center gap-4">
                <span className="w-8 text-[34px] font-semibold text-white/50">{i + 1}</span>
                <Cover itemId={b.book.itemId} title={b.book.title} size={64} rounded={10} />
                <div className="min-w-0">
                  <div className="truncate text-[19px] font-semibold text-white">{b.book.title}</div>
                  <div className="truncate text-[14px] text-white/70">{duration(b.sec)}</div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      ),
    })

  const author = s.topAuthors[0]
  if (author)
    slides.push({
      key: 'author',
      bg: 'linear-gradient(170deg, #134e4a 0%, #0f766e 45%, #042f2e 100%)',
      render: () => (
        <div className="flex flex-col gap-6">
          <Kicker>The voice in your head was written by</Kicker>
          <div className="relative h-44">
            {author.covers.slice(0, 4).map((c, i) => (
              <motion.div
                key={c}
                className="absolute top-0"
                style={{ left: i * 64 }}
                initial={{ opacity: 0, y: 40, rotate: 0 }}
                animate={{ opacity: 1, y: 0, rotate: (i - 1.5) * 6 }}
                transition={{ delay: 0.3 + i * 0.12, type: 'spring', stiffness: 140, damping: 15 }}
              >
                <Cover itemId={c} title={author.name} size={150} rounded={12} className="shadow-2xl" />
              </motion.div>
            ))}
          </div>
          <Big delay={0.8} className="text-[52px] sm:text-[68px]">{author.name}</Big>
          <Line delay={1.1}>
            {duration(author.sec)} across {plural(author.books, 'book')}.
            {s.topAuthors[1] && ` Runners-up: ${s.topAuthors.slice(1, 3).map((a) => a.name).join(' and ')}.`}
          </Line>
          {s.topNarrators[0] && (
            <Line delay={1.6}>
              Favorite narrator: <b>{s.topNarrators[0].name}</b>, who read to you for {duration(s.topNarrators[0].sec)}.
            </Line>
          )}
        </div>
      ),
    })

  if (s.topGenres.length >= 2) {
    const gmax = s.topGenres[0].sec
    slides.push({
      key: 'genres',
      bg: 'linear-gradient(160deg, #1e3a8a 0%, #7c3aed 55%, #1e1b4b 100%)',
      render: () => (
        <div className="flex flex-col gap-6">
          <Kicker>Your genre mix</Kicker>
          <div className="flex flex-wrap items-center gap-3">
            {s.topGenres.slice(0, 7).map((g, i) => (
              <motion.span
                key={g.name}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.12, type: 'spring', stiffness: 200, damping: 15 }}
                className="rounded-full bg-white/15 px-5 py-2.5 font-semibold text-white backdrop-blur"
                style={{ fontSize: 16 + (g.sec / gmax) * 26 }}
              >
                {g.name}
              </motion.span>
            ))}
          </div>
          <Line delay={1.4}>
            {s.topGenres[0].name} led the way with {duration(s.topGenres[0].sec)}.
          </Line>
        </div>
      ),
    })
  }

  if (t.booksFinished > 0)
    slides.push({
      key: 'finished',
      bg: 'linear-gradient(170deg, #14532d 0%, #15803d 45%, #052e16 100%)',
      render: () => (
        <div className="flex flex-col gap-6">
          <Kicker>You finished</Kicker>
          <Big className="text-[110px] sm:text-[140px]">{t.booksFinished}</Big>
          <Big delay={0.4} className="text-[34px]">{t.booksFinished === 1 ? 'book' : 'books'}</Big>
          <div className="flex flex-wrap gap-1.5">
            {s.finished.slice(0, 24).map((f, i) => (
              <motion.div key={f.book.id + i} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 + i * 0.05 }}>
                <Cover itemId={f.book.itemId} title={f.book.title} size={44} rounded={6} />
              </motion.div>
            ))}
          </div>
          {s.firstBook && <Line delay={1.8}>It all started with {s.finished[0]?.book.title ?? s.firstBook.title}.</Line>}
        </div>
      ),
    })

  // Most story hours per calendar day, among books long enough to count
  const pace = (f: (typeof s.finished)[number]) => f.book.duration / f.days!
  const binge = s.finished.filter((f) => f.days != null && f.book.duration > 5 * 3600).sort((a, b) => pace(b) - pace(a))[0]
  if (binge)
    slides.push({
      key: 'binge',
      bg: 'linear-gradient(165deg, #7f1d1d 0%, #dc2626 45%, #450a0a 100%)',
      render: () => (
        <div className="flex flex-col gap-6">
          <Kicker>Biggest binge</Kicker>
          <div className="flex items-center gap-5">
            <motion.div initial={{ opacity: 0, rotate: 8, scale: 0.8 }} animate={{ opacity: 1, rotate: -3, scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}>
              <Cover itemId={binge.book.itemId} title={binge.book.title} size={130} rounded={12} className="shadow-2xl" />
            </motion.div>
            <Big delay={0.5} className="text-[34px] sm:text-[42px]">{binge.book.title}</Big>
          </div>
          <Line delay={0.9}>
            {duration(binge.book.duration)} of story, devoured in <b>{plural(binge.days!, 'day')}</b>
            {binge.days! <= 3 ? '. Did you sleep?' : '.'}
          </Line>
        </div>
      ),
    })

  if (t.effectiveSpeed && t.timeSavedSec > 3600)
    slides.push({
      key: 'speed',
      bg: 'linear-gradient(160deg, #0c4a6e 0%, #0284c7 50%, #082f49 100%)',
      render: () => (
        <div className="flex flex-col gap-6">
          <Kicker>Your average speed</Kicker>
          <Big className="text-[120px] sm:text-[150px]">{t.effectiveSpeed!.toFixed(2)}×</Big>
          <Line delay={0.8}>
            Which bought you back <b>{duration(t.timeSavedSec)}</b> — enough for another {Math.max(1, Math.round(t.timeSavedSec / (11 * 3600)))} books.
          </Line>
        </div>
      ),
    })

  if (fam && fam.members.length > 1) {
    const rank = fam.members.findIndex((m) => m.user.id === s.user.id)
    const twin = fam.similarity.find((p) => p.a === s.user.id || p.b === s.user.id)
    const twinName = twin && fam.members.find((m) => m.user.id === (twin.a === s.user.id ? twin.b : twin.a))?.user.username
    if (rank >= 0)
      slides.push({
        key: 'family',
        bg: 'linear-gradient(165deg, #3f3f46 0%, #52525b 30%, #18181b 100%)',
        render: () => (
          <div className="flex flex-col gap-6">
            <Kicker>In your household</Kicker>
            <Big className="text-[96px] sm:text-[120px]">#{rank + 1}</Big>
            <Line delay={0.6}>
              of {fam.members.length} listeners by hours. Together you all listened for {num(fam.household.listenSec / 3600)} hours.
            </Line>
            <ol className="flex flex-col gap-2">
              {fam.members.map((m, i) => (
                <motion.li key={m.user.id} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 + i * 0.12 }} className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-[16px] ${m.user.id === s.user.id ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>
                  <span className="font-semibold">
                    {i + 1}. {m.user.username}
                  </span>
                  <span>{num(m.listenSec / 3600)}h</span>
                </motion.li>
              ))}
            </ol>
            {twinName && (
              <Line delay={1.8}>
                Your taste twin is <b>{twinName}</b> — {Math.round(twin!.score * 100)}% match.
              </Line>
            )}
          </div>
        ),
      })
  }

  slides.push({
    key: 'summary',
    bg: 'radial-gradient(120% 80% at 80% 0%, #1d4ed8 0%, #111827 55%, #030712 100%)',
    render: () => <Summary s={s} />,
  })

  void meId
  return slides
}

function MiniCalendar({ s }: { s: UserStats }) {
  const map = new Map(s.daily)
  const max = Math.max(1, ...s.daily.map((d) => d[1]))
  const year = s.period.year!
  const days: string[] = []
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10))
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[2px]" style={{ gridAutoColumns: 'minmax(0,1fr)' }}>
      {days.map((d, i) => {
        const v = map.get(d) ?? 0
        return (
          <motion.span
            key={d}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 + (i / days.length) * 0.9 }}
            className="aspect-square rounded-[2px]"
            style={{ background: v ? `rgba(255,255,255,${0.25 + 0.75 * Math.min(1, v / max)})` : 'rgba(255,255,255,0.08)' }}
          />
        )
      })}
    </div>
  )
}

function Summary({ s }: { s: UserStats }) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const t = s.totals
  const save = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!ref.current) return
    setBusy(true)
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true })
      const a = document.createElement('a')
      a.href = url
      a.download = `${s.user.username}-${s.period.label}-wrapped.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }
  const rows: [string, string][] = [
    ['Hours', num(t.listenSec / 3600)],
    ['Books finished', num(t.booksFinished)],
    ['Days listened', num(t.activeDays)],
    ['Best streak', `${s.streaks.longest.days} days`],
    ['Top author', s.topAuthors[0]?.name ?? '—'],
    ['Top genre', s.topGenres[0]?.name ?? '—'],
    ['Personality', s.chronotype?.label ?? '—'],
    ['Avg speed', t.effectiveSpeed ? `${t.effectiveSpeed.toFixed(2)}×` : '—'],
  ]
  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div {...rise(0.1)} ref={ref} className="w-full max-w-[380px] rounded-[28px] bg-gradient-to-br from-[#1e3a8a] via-[#312e81] to-[#0f172a] p-6 text-white shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60">
          <span>{s.user.username}</span>
          <span>{s.period.label} Wrapped</span>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {s.topBooks.filter((b) => b.book.kind === 'book').slice(0, 5).map((b) => (
            <Cover key={b.book.id} itemId={b.book.itemId} title={b.book.title} size="100%" rounded={8} className="aspect-square" />
          ))}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-white/55">{k}</dt>
              <dd className="truncate text-[18px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 text-[11px] text-white/45">Shelf Stats · Audiobookshelf</div>
      </motion.div>
      <motion.button {...rise(0.6)} onClick={save} disabled={busy} className="rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black transition-transform hover:scale-105 disabled:opacity-60">
        {busy ? 'Saving…' : 'Save as image'}
      </motion.button>
    </div>
  )
}

// ---------------------------------------------------------------- player

export function Wrapped() {
  const { stats, me, loading } = useView()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const fam = useFamily(stats?.period.year ?? null, me.familyVisible && !!stats?.period.year)
  const slides = useMemo(() => (stats && stats.period.year ? buildSlides(stats, fam.data, me.id) : []), [stats, fam.data, me.id])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const close = useCallback(() => navigate(`/${params.toString() ? `?${params}` : ''}`), [navigate, params])
  const go = useCallback(
    (d: number) => {
      setElapsed(0)
      setI((x) => Math.max(0, Math.min(slides.length - 1, x + d)))
    },
    [slides.length],
  )

  useEffect(() => {
    if (paused || !slides.length || i === slides.length - 1) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      setElapsed((e) => {
        const n = e + (t - last)
        if (n >= SLIDE_MS) {
          queueMicrotask(() => go(1))
          return SLIDE_MS
        }
        return n
      })
      last = t
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, i, slides.length, go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, close])

  if (!stats || loading && !slides.length) return <div className="flex min-h-dvh items-center justify-center bg-black text-white/70">Getting your year ready…</div>
  if (!stats.period.year || stats.totals.listenSec === 0)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
        <p>Wrapped needs a year with some listening in it.</p>
        <button onClick={close} className="rounded-full bg-white px-4 py-2 text-black">
          Back
        </button>
      </div>
    )

  const slide = slides[Math.min(i, slides.length - 1)]

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <motion.div
        key={slide.key + '-bg'}
        className="absolute inset-0"
        style={{ background: slide.bg }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />
      <div className="relative flex h-full w-full max-w-[560px] flex-col sm:h-[min(92dvh,900px)] sm:overflow-hidden sm:rounded-[32px] sm:border sm:border-white/10 sm:shadow-2xl">
        {/* progress */}
        <div className="z-10 flex gap-1 px-4 pt-4">
          {slides.map((sl, n) => (
            <div key={sl.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full bg-white" style={{ width: n < i ? '100%' : n === i ? `${(elapsed / SLIDE_MS) * 100}%` : '0%' }} />
            </div>
          ))}
        </div>
        <div className="z-10 flex items-center justify-between px-4 pt-3 text-white">
          <span className="text-[13px] font-semibold opacity-80">Shelf Stats · {stats.period.label}</span>
          <div className="flex gap-1">
            <button aria-label={paused ? 'Play' : 'Pause'} onClick={() => setPaused((p) => !p)} className="rounded-full px-3 py-1 text-[13px] opacity-80 hover:bg-white/15">
              {paused ? '▶' : '❚❚'}
            </button>
            <button aria-label="Close" onClick={close} className="rounded-full px-3 py-1 text-[16px] opacity-80 hover:bg-white/15">
              ✕
            </button>
          </div>
        </div>

        {/* tap zones */}
        <div className="absolute inset-0 top-16 z-[5] flex">
          <button aria-label="Previous" className="h-full w-1/3 cursor-w-resize" onClick={() => go(-1)} />
          <button aria-label="Next" className="h-full w-2/3 cursor-e-resize" onClick={() => go(1)} />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={slide.key}
            className="relative z-[6] flex flex-1 flex-col justify-center overflow-y-auto px-7 pb-10 sm:px-10 [&_button]:pointer-events-auto"
            style={{ pointerEvents: slide.key === 'summary' ? 'auto' : 'none' }}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.35 }}
          >
            {slide.render()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
