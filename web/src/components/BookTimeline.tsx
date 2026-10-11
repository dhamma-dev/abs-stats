import { scaleTime } from 'd3-scale'
import { useMemo, useState } from 'react'
import type { TimelineBook, UserStats } from '../../../shared/types.ts'
import { date as fmtDate, duration, plural } from '../lib/format.ts'
import { Cover, Pills, useWidth } from './ui.tsx'

type Sort = 'started' | 'finished' | 'played'
const COLLAPSED = 15

/**
 * A waterfall of every book played in the period. Each lane spans from the first
 * day you played the book to the day you finished it (or last played it); each
 * day you listened is a tick whose height carries how long you listened.
 */
export function BookTimeline({ stats }: { stats: UserStats }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [sort, setSort] = useState<Sort>('started')
  const [expanded, setExpanded] = useState(false)
  const [podcasts, setPodcasts] = useState(false)
  const [tip, setTip] = useState<{ lane: number; x: number; title: string; lines: string[] } | null>(null)

  const hasPodcasts = stats.timeline.some((t) => t.book.kind === 'podcast')
  const lanes = useMemo(() => {
    const list = stats.timeline.filter((t) => podcasts || t.book.kind === 'book')
    const first = (t: TimelineBook) => t.days[0][0]
    if (sort === 'started') return list // server order: by first play in the period
    if (sort === 'played') return [...list].sort((a, b) => b.sec - a.sec)
    // finished: finished books in finish order, then the rest by when they were last played
    const end = (t: TimelineBook) => t.finished ?? t.days[t.days.length - 1][0]
    return [...list].sort((a, b) => Number(!a.finished) - Number(!b.finished) || end(a).localeCompare(end(b)) || first(a).localeCompare(first(b)))
  }, [stats.timeline, sort, podcasts])

  const shown = expanded ? lanes : lanes.slice(0, COLLAPSED)
  const label = Math.min(230, Math.max(130, width * 0.26))
  const lane = 34
  const top = 22
  const d = (s: string) => new Date(s + 'T12:00:00Z')
  const today = new Date().toLocaleDateString('en-CA')
  const end = stats.period.end < today ? stats.period.end : today
  // Axis runs from the very start of the first day to the end of the last, so Jan 1 gets its tick.
  const x = scaleTime()
    .domain([new Date(stats.period.start + 'T00:00:00Z'), new Date(stats.period.end + 'T23:59:59Z')])
    .range([label + 10, width - 12])
  const maxSec = Math.max(1, ...shown.flatMap((l) => l.days.map((dd) => dd[1])))
  const spanDays = (d(stats.period.end).getTime() - d(stats.period.start).getTime()) / 86_400_000
  const tickW = Math.max(1.5, Math.min(5, (width - label) / spanDays - 0.5))
  const months = x.ticks(Math.max(2, Math.floor((width - label) / 70)))
  const height = top + shown.length * lane + 6

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Pills
          label="Order books by"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'started', label: 'Started' },
            { value: 'finished', label: 'Finished' },
            { value: 'played', label: 'Most played' },
          ]}
        />
        {hasPodcasts && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={podcasts} onChange={(e) => setPodcasts(e.target.checked)} className="accent-[var(--accent)]" />
            Include podcasts
          </label>
        )}
        <span className="ml-auto text-[12px] text-muted">{plural(lanes.length, 'book')}</span>
      </div>

      <div className="scroll-x">
        <div ref={ref} className="relative min-w-[560px]" onMouseLeave={() => setTip(null)}>
          <svg width={width} height={height} role="img" aria-label={`When you played each of ${lanes.length} books`}>
            {months.map((m) => (
              <g key={m.toISOString()}>
                <line x1={x(m)} x2={x(m)} y1={top - 4} y2={height} stroke="var(--grid)" />
                <text x={x(m)} y={12} textAnchor="middle" className="fill-muted text-[11px]">
                  {m.toLocaleString('en-US', { month: 'short', timeZone: 'UTC', ...(stats.period.year ? {} : { year: '2-digit' }) })}
                </text>
              </g>
            ))}
            {end < stats.period.end && (
              <g>
                <line x1={x(d(end))} x2={x(d(end))} y1={top - 4} y2={height} stroke="var(--s2)" strokeWidth={1} />
                <text x={x(d(end))} y={12} textAnchor="middle" className="text-[11px] font-medium" style={{ fill: 'var(--ink-2)' }}>
                  Today
                </text>
              </g>
            )}
            {shown.map((l, i) => {
              const cy = top + i * lane + lane / 2
              const first = l.days[0][0]
              const last = l.days[l.days.length - 1][0]
              const x0 = l.startedBefore ? x.range()[0] : x(d(first))
              const x1 = l.continuesAfter ? x.range()[1] : x(d(l.finished ?? last))
              const color = l.stalled ? 'var(--muted)' : 'var(--s1)'
              const status = l.finished
                ? `Finished ${fmtDate(l.finished)}`
                : l.continuesAfter
                  ? 'Carried on after this period'
                  : l.stalled
                    ? `Left unfinished · last played ${fmtDate(last)}`
                    : 'In progress'
              const spanned = Math.round((d(l.finished ?? last).getTime() - d(first).getTime()) / 86_400_000) + 1
              const summary = {
                lane: i,
                title: l.book.title,
                lines: [
                  `${l.startedBefore ? 'Picked back up' : 'Started'} ${fmtDate(first)} · ${status}`,
                  `${duration(l.sec)} over ${plural(l.days.length, 'day')}${spanned > 1 ? ` across ${plural(spanned, 'calendar day')}` : ''}`,
                ],
              }
              return (
                <g key={l.book.id}>
                  {/* the span: a faint bar from start to finish */}
                  <rect
                    x={x0}
                    y={cy - 7}
                    width={Math.max(4, x1 - x0)}
                    height={14}
                    rx={7}
                    fill={color}
                    opacity={0.14}
                    onMouseMove={() => setTip({ ...summary, x: (x0 + x1) / 2 })}
                  />
                  {l.startedBefore && <path d={`M${x0 + 7},${cy - 4}l-4,4l4,4`} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
                  {l.continuesAfter && <path d={`M${x1 - 7},${cy - 4}l4,4l-4,4`} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
                  {l.days.map(([day, sec]) => {
                    const h = 5 + (sec / maxSec) * (lane - 12)
                    return (
                      <rect
                        key={day}
                        x={x(d(day)) - tickW / 2}
                        y={cy - h / 2}
                        width={tickW}
                        height={h}
                        rx={Math.min(2, tickW / 2)}
                        fill={color}
                        onMouseMove={() => setTip({ lane: i, x: x(d(day)), title: l.book.title, lines: [`${fmtDate(day, true)} · ${duration(sec)}`, status] })}
                      />
                    )
                  })}
                  {l.finished && <circle cx={x(d(l.finished))} cy={cy} r={5} fill="var(--s3)" stroke="var(--surface)" strokeWidth={2} />}
                </g>
              )
            })}
          </svg>

          {/* HTML labels so covers & truncation are easy */}
          {shown.map((l, i) => (
            <div key={l.book.id} className="absolute left-0 flex items-center gap-2" style={{ top: top + i * lane + 3, width: label - 4, height: lane - 6 }}>
              <Cover itemId={l.book.itemId} title={l.book.title} size={lane - 8} rounded={5} />
              <span className={`truncate text-[12px] font-medium ${l.stalled ? 'text-muted' : 'text-ink'}`} title={l.book.title}>
                {l.book.title}
              </span>
            </div>
          ))}

          {tip && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border hairline bg-surface px-3 py-2 text-[12px] shadow-xl"
              style={{ left: Math.min(width - 120, Math.max(label + 100, tip.x)), top: top + tip.lane * lane }}
            >
              <div className="font-semibold">{tip.title}</div>
              {tip.lines.map((line) => (
                <div key={line} className="text-ink-2">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-1 rounded-sm" style={{ background: 'var(--s1)' }} /> A day you listened (taller = longer)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--s3)' }} /> Finished
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full opacity-40" style={{ background: 'var(--muted)' }} /> Left unfinished
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="font-semibold text-ink">‹ ›</span> Carried over from / into another year
        </span>
        {lanes.length > COLLAPSED && (
          <button onClick={() => setExpanded((e) => !e)} className="ml-auto rounded-full border hairline bg-surface-2 px-3.5 py-1.5 text-[13px] font-medium text-ink hover:bg-surface">
            {expanded ? 'Show fewer' : `Show all ${lanes.length} books`}
          </button>
        )}
      </div>
    </div>
  )
}
