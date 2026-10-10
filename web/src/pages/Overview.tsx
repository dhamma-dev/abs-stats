import { useView } from '../lib/view.ts'
import { CalendarHeatmap, ColumnChart, SeqLegend } from '../components/charts.tsx'
import { Card, Cover, ProgressBar, StatTile } from '../components/ui.tsx'
import { authors, date, delta, duration, hours, monthLong, monthShort, num, num1, pct, plural, speed } from '../lib/format.ts'

export function Overview() {
  const s = useView().stats!
  const t = s.totals
  const prev = s.previous
  const bestMonth = s.monthly.reduce((a, m) => (m.sec > a.sec ? m : a), s.monthly[0])
  const years = s.period.year ? [s.period.year] : [...s.availableYears].sort((a, b) => b - a)

  return (
    <div className="grid gap-4">
      {/* ---- hero */}
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--glow),transparent_70%)]" />
        <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
          <div>
            <div className="text-[13px] text-ink-2">Time listened</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[64px] font-semibold leading-none tracking-tight sm:text-[84px]">{hours(t.listenSec)}</span>
              <span className="text-[20px] text-muted">hours</span>
            </div>
            {prev && delta(t.listenSec, prev.listenSec) != null && (
              <div className={`mt-2 text-[13px] font-medium ${t.listenSec >= prev.listenSec ? 'text-good' : 'text-bad'}`}>
                <span aria-hidden>{t.listenSec >= prev.listenSec ? '▲' : '▼'}</span> {pct(Math.abs(delta(t.listenSec, prev.listenSec)!))}{' '}
                <span className="font-normal text-muted">vs {prev.label}</span>
              </div>
            )}
          </div>
          <p className="max-w-[520px] pb-1 text-[15px] leading-relaxed text-ink-2">
            That's <b className="text-ink">{num1(s.equivalents.nonstopDays)} days</b> of nonstop listening across {plural(t.sessions, 'session')} on{' '}
            {plural(t.activeDays, 'day')}. At your pace you covered about <b className="text-ink">{num(s.equivalents.pages)} pages</b> — or{' '}
            {num1(s.equivalents.roadTrips)} coast-to-coast road trips.
          </p>
        </div>
      </section>

      {/* ---- tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Books finished" value={num(t.booksFinished)} delta={delta(t.booksFinished, prev?.booksFinished)} deltaLabel={prev?.label} hint={`${t.booksTouched} books played`} />
        <StatTile label="Listening days" value={num(t.activeDays)} unit={`/ ${t.daysInPeriod}`} delta={delta(t.activeDays, prev?.activeDays)} deltaLabel={prev?.label} hint={`${pct(t.activeDays / Math.max(1, t.daysInPeriod))} of days`} />
        <StatTile
          label="Longest streak"
          value={num(s.streaks.longest.days)}
          unit="days"
          hint={s.streaks.current.days > 1 ? `🔥 ${s.streaks.current.days}-day streak going now` : s.streaks.longest.start ? `${date(s.streaks.longest.start)} – ${date(s.streaks.longest.end!)}` : undefined}
        />
        <StatTile label="Per listening day" value={duration(t.avgPerActiveDaySec)} hint={`${duration(t.avgSessionSec)} per session`} />
        <StatTile label="Average speed" value={speed(t.effectiveSpeed)} hint={t.timeSavedSec > 3600 ? `saved ${duration(t.timeSavedSec)} of listening` : 'measured from progress'} />
      </div>

      {/* ---- months + calendar */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="Month by month"
          subtitle={bestMonth?.sec ? `Your biggest month was ${monthLong(bestMonth.month)}${s.period.year ? '' : ' ' + bestMonth.month.slice(0, 4)} with ${duration(bestMonth.sec)}` : undefined}
        >
          <ColumnChart
            data={s.monthly.map((m) => ({
              key: m.month,
              label: s.period.year ? monthShort(m.month) : `${monthShort(m.month)} ’${m.month.slice(2, 4)}`,
              value: m.sec,
              tip: (
                <>
                  <div className="font-semibold">
                    {monthLong(m.month)} {m.month.slice(0, 4)}
                  </div>
                  <div className="text-ink-2">{duration(m.sec)} listened</div>
                  <div className="text-ink-2">{plural(m.booksFinished, 'book')} finished</div>
                </>
              ),
            }))}
          />
        </Card>
        <Card className="lg:col-span-2" title="Most played" subtitle="By time spent listening">
          <ol className="flex flex-col gap-3">
            {s.topBooks.slice(0, 5).map((b, i) => (
              <li key={b.book.id} className="flex items-center gap-3">
                <span className="tnum w-4 text-right text-[12px] text-muted">{i + 1}</span>
                <Cover itemId={b.book.itemId} title={b.book.title} size={48} rounded={8} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{b.book.title}</div>
                  <div className="truncate text-[12px] text-muted">
                    {b.book.kind === 'podcast' ? 'Podcast · ' : ''}
                    {authors(b.book.authors)}
                  </div>
                  {b.book.kind === 'book' && b.progress != null && !b.finished && (
                    <div className="mt-1.5 w-28">
                      <ProgressBar value={b.progress} />
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="tnum text-[13px] text-ink-2">{duration(b.sec)}</div>
                  {b.finished && <div className="text-[11px] font-medium text-good">✓ Finished</div>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="Every day you listened" subtitle={`${plural(t.activeDays, 'day')} with listening`} action={<SeqLegend labels={['Less', 'More']} />}>
        <div className="flex flex-col gap-6">
          {years.map((y) => (
            <div key={y}>
              {years.length > 1 && <div className="mb-1 text-[12px] font-semibold text-ink-2">{y}</div>}
              <div className="scroll-x">
                <div className="min-w-[620px]">
                  <CalendarHeatmap year={y} daily={s.daily} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {s.chronotype && (
          <Card title="Your listening personality">
            <div className="text-[28px] font-semibold tracking-tight">{s.chronotype.label}</div>
            <p className="mt-1 text-[14px] text-ink-2">{s.chronotype.blurb}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <dt className="text-muted">Peak hour</dt>
                <dd className="mt-0.5 font-medium">{s.chronotype.peakHour % 12 || 12}{s.chronotype.peakHour < 12 ? 'am' : 'pm'}</dd>
              </div>
              <div>
                <dt className="text-muted">Favorite day</dt>
                <dd className="mt-0.5 font-medium">{['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'][s.chronotype.peakWeekday]}</dd>
              </div>
            </dl>
          </Card>
        )}
        <Card title="Record breakers">
          <dl className="flex flex-col gap-4 text-[14px]">
            {s.biggestDay && (
              <div>
                <dt className="text-[13px] text-muted">Biggest day</dt>
                <dd className="mt-0.5">
                  <b>{duration(s.biggestDay.sec)}</b> on {date(s.biggestDay.date, true)}
                  <div className="truncate text-[12px] text-muted">{s.biggestDay.books.map((b) => b.title).join(', ')}</div>
                </dd>
              </div>
            )}
            {s.longestSession && (
              <div>
                <dt className="text-[13px] text-muted">Longest single session</dt>
                <dd className="mt-0.5">
                  <b>{duration(s.longestSession.sec)}</b> of {s.longestSession.book.title}
                  <div className="text-[12px] text-muted">{date(s.longestSession.date, true)}</div>
                </dd>
              </div>
            )}
            {s.finished.length > 0 && (() => {
              const fastest = [...s.finished].filter((f) => f.days != null && f.book.duration > 4 * 3600).sort((a, b) => a.days! - b.days!)[0]
              return fastest ? (
                <div>
                  <dt className="text-[13px] text-muted">Fastest finish</dt>
                  <dd className="mt-0.5">
                    <b>{fastest.book.title}</b> in {plural(fastest.days!, 'day')}
                    <div className="text-[12px] text-muted">{duration(fastest.book.duration)} long</div>
                  </dd>
                </div>
              ) : null
            })()}
          </dl>
        </Card>
        <Card title="Milestones">
          {s.milestones.length ? (
            <ol className="relative flex flex-col gap-3 border-l hairline pl-4">
              {s.milestones.slice(-7).map((m) => (
                <li key={m.date + m.label} className="relative text-[13px]">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-[var(--surface)]" />
                  <div className="truncate font-medium">{m.label}</div>
                  <div className="text-[12px] text-muted">{date(m.date, !s.period.year)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted">Keep listening — milestones appear at 10, 25, 50, 100 hours and beyond.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
