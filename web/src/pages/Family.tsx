import { useSearchParams } from 'react-router-dom'
import type { FamilyMember } from '../../../shared/types.ts'
import { useView } from '../lib/view.ts'
import { Legend, MultiLine } from '../components/charts.tsx'
import { Avatar, Card, Cover, Empty, PERSON_COLORS, Pills, StatTile } from '../components/ui.tsx'
import { useFamily, usePersonIndex } from '../lib/api.ts'
import { authors, duration, hours, monthShort, num, pct, plural, speed } from '../lib/format.ts'


export function Family() {
  const { me } = useView()
  const [params, setParams] = useSearchParams()
  const yearParam = params.get('year')
  const year = yearParam === 'all' || !yearParam ? null : Number(yearParam)
  const fam = useFamily(year)
  const idx = usePersonIndex()
  const f = fam.data

  if (fam.error) return <div className="card p-8 text-center text-bad">{(fam.error as Error).message}</div>
  if (!f) return <div className="card mt-6 h-[60vh] animate-pulse" />

  // Color follows the person (their slot in the full user list), never their rank.
  const colorOf = (id: string) => PERSON_COLORS[idx(id) % PERSON_COLORS.length]
  const name = (id: string) => f.members.find((m) => m.user.id === id)?.user.username ?? 'someone'

  const awards = buildAwards(f.members)
  const mine = f.recommendations.filter((r) => r.forUser === me.id)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">The household</p>
          <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]">{f.period.label}</h1>
        </div>
        <Pills
          label="Period"
          value={year}
          onChange={(v) => setParams((p) => (p.set('year', v == null ? 'all' : String(v)), p))}
          options={[...f.availableYears.map((y) => ({ value: y as number | null, label: String(y) })), { value: null, label: 'All time' }]}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Hours together" value={hours(f.household.listenSec)} hint={`across ${plural(f.members.length, 'listener')}`} />
        <StatTile label="Books finished" value={num(f.household.booksFinished)} hint={`${num(f.household.booksTouched)} different books played`} />
        <StatTile label="Days someone listened" value={num(f.household.activeDays)} />
        <StatTile label="Sessions" value={num(f.household.sessions)} />
      </div>

      {/* leaderboard */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {f.members.map((m, rank) => (
          <div key={m.user.id} className={`card relative overflow-hidden p-5 ${m.user.id === me.id ? 'ring-2 ring-[var(--accent)]' : ''}`}>
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: colorOf(m.user.id) }} />
            <div className="flex items-center gap-3">
              <Avatar name={m.user.username} index={idx(m.user.id)} size={40} />
              <div className="min-w-0">
                <div className="truncate text-[16px] font-semibold">{m.user.username}</div>
                <div className="text-[12px] text-muted">{m.chronotype?.label ?? 'Listener'}</div>
              </div>
              <div className="tnum ml-auto text-[28px] font-semibold text-muted/60">#{rank + 1}</div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <Stat label="Hours" value={hours(m.listenSec)} />
              <Stat label="Finished" value={num(m.booksFinished)} />
              <Stat label="Best streak" value={`${m.longestStreak}d`} />
              <Stat label="Speed" value={speed(m.effectiveSpeed)} />
            </dl>
            {m.topAuthor && <div className="mt-3 truncate text-[12px] text-ink-2">Loves <b className="text-ink">{m.topAuthor}</b>{m.topGenre ? ` · ${m.topGenre}` : ''}</div>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {awards
                .filter((a) => a.winner === m.user.id)
                .map((a) => (
                  <span key={a.title} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-2">
                    {a.icon} {a.title}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      <Card title="Month by month" subtitle="Hours listened per person" action={<Legend items={f.members.map((m) => ({ name: m.user.username, color: colorOf(m.user.id) }))} />}>
        <MultiLine
          xLabel={monthShort}
          series={f.members.map((m) => ({ key: m.user.id, name: m.user.username, color: colorOf(m.user.id), points: m.monthly.map((p) => ({ x: p.month, y: p.sec })) }))}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Taste twins" subtitle="How alike your listening is, based on authors and genres">
          {f.similarity.length ? (
            <ol className="flex flex-col gap-4">
              {f.similarity.slice(0, 6).map((p) => (
                <li key={p.a + p.b} className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <Avatar name={name(p.a)} index={idx(p.a)} size={30} />
                    <Avatar name={name(p.b)} index={idx(p.b)} size={30} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-medium">
                        {name(p.a)} & {name(p.b)}
                      </span>
                      <span className="tnum text-[13px] font-semibold">{pct(p.score)} match</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, p.score * 100)}%`, background: 'var(--s5)' }} />
                    </div>
                    <div className="mt-1 truncate text-[12px] text-muted">{p.shared.length ? `Both into ${p.shared.slice(0, 3).join(', ')}` : 'Totally different shelves'}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Needs at least two listeners.</Empty>
          )}
        </Card>
        <Card title={mine.length ? 'Picked for you' : 'Family picks'} subtitle="Finished by someone in the family, never started by you">
          {(mine.length ? mine : f.recommendations.slice(0, 6)).length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {(mine.length ? mine : f.recommendations.slice(0, 6)).map((r) => (
                <li key={r.forUser + r.book.id} className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-2.5">
                  <Cover itemId={r.book.itemId} title={r.book.title} size={52} rounded={8} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{r.book.title}</div>
                    <div className="truncate text-[12px] text-muted">{authors(r.book.authors)}</div>
                    <div className="mt-1 truncate text-[11px] text-ink-2">
                      {mine.length ? '' : `for ${name(r.forUser)} · `}finished by {r.from.map(name).join(' & ')}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Once someone finishes a book you haven't tried, it shows up here.</Empty>
          )}
        </Card>
      </div>

      <Card title="Shared shelf" subtitle="Books more than one of you played">
        {f.sharedBooks.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {f.sharedBooks.slice(0, 12).map((b) => (
              <figure key={b.book.id} className="min-w-0">
                <Cover itemId={b.book.itemId} title={b.book.title} size="100%" rounded={12} className="aspect-square" />
                <figcaption className="mt-2">
                  <div className="truncate text-[13px] font-medium">{b.book.title}</div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {b.listeners.map((l) => (
                      <div key={l.userId} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: colorOf(l.userId) }} />
                        <span className="truncate">{name(l.userId)}</span>
                        <span className="tnum ml-auto">{l.finished ? '✓' : duration(l.sec)}</span>
                      </div>
                    ))}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <Empty>No overlap yet — time for a family book club?</Empty>
        )}
      </Card>
    </div>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="tnum text-[16px] font-semibold">{value}</dd>
  </div>
)

function buildAwards(members: FamilyMember[]) {
  if (members.length < 2) return []
  const best = (score: (m: FamilyMember) => number | null) => {
    let win: FamilyMember | null = null
    for (const m of members) {
      const v = score(m)
      if (v != null && v > 0 && (!win || v > score(win)!)) win = m
    }
    return win?.user.id ?? null
  }
  const lateShare = (m: FamilyMember) => {
    const t = m.hourly.reduce((a, b) => a + b, 0)
    return t ? (m.hourly.slice(22).reduce((a, b) => a + b, 0) + m.hourly.slice(0, 4).reduce((a, b) => a + b, 0)) / t : null
  }
  const earlyShare = (m: FamilyMember) => {
    const t = m.hourly.reduce((a, b) => a + b, 0)
    return t ? m.hourly.slice(4, 8).reduce((a, b) => a + b, 0) / t : null
  }
  return [
    { icon: '🎧', title: 'Most hours', winner: best((m) => m.listenSec) },
    { icon: '📚', title: 'Most finished', winner: best((m) => m.booksFinished) },
    { icon: '🔥', title: 'Longest streak', winner: best((m) => m.longestStreak) },
    { icon: '⚡', title: 'Speed demon', winner: best((m) => m.effectiveSpeed) },
    { icon: '🦉', title: 'Latest nights', winner: best(lateShare) },
    { icon: '🌅', title: 'Earliest mornings', winner: best(earlyShare) },
    { icon: '📅', title: 'Most consistent', winner: best((m) => m.activeDays) },
  ].filter((a) => a.winner)
}
