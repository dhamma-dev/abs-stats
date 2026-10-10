import { scaleTime } from 'd3-scale'
import { useState } from 'react'
import type { UserStats } from '../../../shared/types.ts'
import { date as fmtDate, duration } from '../lib/format.ts'
import { Cover, useWidth } from './ui.tsx'

/**
 * One lane per book. Each day the book was played is a tick; tick height carries
 * how long you listened that day. A ring marks the day it was finished.
 */
export function BookTimeline({ stats }: { stats: UserStats }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<{ lane: number; day: string; sec: number } | null>(null)
  const lanes = stats.timeline.filter((t) => t.days.length)
  const label = Math.min(220, Math.max(120, width * 0.28))
  const lane = 40
  const top = 22
  const d = (s: string) => new Date(s + 'T12:00:00Z')
  const start = stats.period.start
  const end = stats.period.end
  const x = scaleTime().domain([d(start), d(end)]).range([label + 8, width - 8])
  const maxSec = Math.max(1, ...lanes.flatMap((l) => l.days.map((dd) => dd[1])))
  const tickW = Math.max(1.5, Math.min(5, (width - label) / ((d(end).getTime() - d(start).getTime()) / 86_400_000) - 0.5))
  const months = x.ticks(Math.max(2, Math.floor((width - label) / 70)))

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={top + lanes.length * lane + 4} role="img" aria-label="When you listened to each of your top books">
        {months.map((m) => (
          <g key={m.toISOString()}>
            <line x1={x(m)} x2={x(m)} y1={top - 4} y2={top + lanes.length * lane} stroke="var(--grid)" />
            <text x={x(m)} y={12} textAnchor="middle" className="fill-muted text-[11px]">
              {m.toLocaleString('en-US', { month: 'short', timeZone: 'UTC', ...(stats.period.year ? {} : { year: '2-digit' }) })}
            </text>
          </g>
        ))}
        {lanes.map((l, i) => {
          const cy = top + i * lane + lane / 2
          const first = l.days[0][0]
          const last = l.days[l.days.length - 1][0]
          return (
            <g key={l.book.id} onMouseLeave={() => setHover(null)}>
              <line x1={x(d(first))} x2={x(d(l.finished ?? last))} y1={cy} y2={cy} stroke="var(--axis)" strokeWidth={1} />
              {l.days.map(([day, sec]) => {
                const h = 6 + (sec / maxSec) * (lane - 14)
                return (
                  <rect
                    key={day}
                    x={x(d(day)) - tickW / 2}
                    y={cy - h / 2}
                    width={tickW}
                    height={h}
                    rx={Math.min(2, tickW / 2)}
                    fill="var(--s1)"
                    opacity={hover && hover.lane === i && hover.day !== day ? 0.5 : 1}
                    onMouseEnter={() => setHover({ lane: i, day, sec })}
                  />
                )
              })}
              {l.finished && <circle cx={x(d(l.finished))} cy={cy} r={5} fill="var(--s3)" stroke="var(--surface)" strokeWidth={2} />}
              {/* wide invisible hit area for the lane */}
              <rect x={label} y={cy - lane / 2} width={width - label} height={lane} fill="transparent" style={{ pointerEvents: 'none' }} />
            </g>
          )
        })}
      </svg>
      {/* HTML labels so covers & truncation are easy */}
      {lanes.map((l, i) => (
        <div key={l.book.id} className="absolute left-0 flex items-center gap-2" style={{ top: top + i * lane + 4, width: label - 4, height: lane - 8 }}>
          <Cover itemId={l.book.itemId} title={l.book.title} size={lane - 10} rounded={6} />
          <span className="truncate text-[12px] font-medium text-ink" title={l.book.title}>
            {l.book.title}
          </span>
        </div>
      ))}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border hairline bg-surface px-3 py-2 text-[12px] shadow-xl"
          style={{ left: Math.min(width - 90, Math.max(90, x(d(hover.day)))), top: top + hover.lane * lane }}
        >
          <div className="font-semibold">{lanes[hover.lane].book.title}</div>
          <div className="text-ink-2">
            {fmtDate(hover.day, true)} · {duration(hover.sec)}
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-4 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-1 rounded-sm" style={{ background: 'var(--s1)' }} /> A day you listened (taller = longer)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--s3)' }} /> Finished
        </span>
      </div>
    </div>
  )
}
