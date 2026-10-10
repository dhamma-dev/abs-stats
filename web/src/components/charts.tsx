import { scaleBand, scaleLinear, scaleTime } from 'd3-scale'
import { line as d3line, curveMonotoneX } from 'd3-shape'
import { useMemo, useState, type ReactNode } from 'react'
import { date as fmtDate, duration, hourLabel, WD, weekdayOf } from '../lib/format.ts'
import { useWidth } from './ui.tsx'

// ---------------------------------------------------------------- tooltip

interface Tip {
  x: number
  y: number
  content: ReactNode
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x, 90), width - 90)
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border hairline bg-surface px-3 py-2 text-[12px] leading-snug text-ink shadow-xl"
      style={{ left, top: tip.y - 10 }}
    >
      {tip.content}
    </div>
  )
}

const TipTitle = ({ children }: { children: ReactNode }) => <div className="font-semibold">{children}</div>
const TipRow = ({ children }: { children: ReactNode }) => <div className="text-ink-2">{children}</div>

/** Clean, round tick values */
function niceTicks(max: number, count = 4) {
  return scaleLinear().domain([0, max]).nice(count).ticks(count)
}

/** Rounded-top bar path: 4px radius at the data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return ''
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

// ---------------------------------------------------------------- column chart

export interface Column {
  key: string
  label: string
  value: number
  tip?: ReactNode
}

export function ColumnChart({
  data,
  height = 220,
  format = duration,
  axisFormat = (v: number) => `${Math.round(v / 3600)}h`,
  color = 'var(--s1)',
  labelMax = true,
}: {
  data: Column[]
  height?: number
  format?: (v: number) => string
  axisFormat?: (v: number) => string
  color?: string
  labelMax?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const m = { top: 22, right: 4, bottom: 26, left: 40 }
  const max = Math.max(1, ...data.map((d) => d.value))
  const ticks = niceTicks(max)
  const y = scaleLinear().domain([0, ticks[ticks.length - 1] || max]).range([height - m.bottom, m.top])
  const x = scaleBand<string>().domain(data.map((d) => d.key)).range([m.left, width - m.right]).paddingInner(0.25).paddingOuter(0.1)
  const bw = Math.min(24, x.bandwidth())
  const maxKey = data.reduce((a, d) => (d.value > (a?.value ?? -1) ? d : a), data[0])?.key
  const every = Math.ceil(data.length / Math.max(1, Math.floor((width - m.left) / 38)))

  return (
    <div ref={ref} className="relative" onMouseLeave={() => (setTip(null), setHover(null))}>
      <svg width={width} height={height} role="img" aria-label="Column chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
            <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-muted text-[11px]">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = x(d.key)! + x.bandwidth() / 2
          const h = y(0) - y(d.value)
          const dim = hover && hover !== d.key
          return (
            <g key={d.key}>
              <path d={barPath(cx - bw / 2, y(d.value), bw, h)} fill={color} opacity={dim ? 0.45 : 1} />
              {i % every === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
                  {d.label}
                </text>
              )}
              {labelMax && d.key === maxKey && d.value > 0 && (
                <text x={cx} y={y(d.value) - 6} textAnchor="middle" className="tnum fill-ink-2 text-[11px] font-medium" style={{ fill: 'var(--ink-2)' }}>
                  {format(d.value)}
                </text>
              )}
              {/* hit target: the full band, taller than the bar */}
              <rect
                x={x(d.key)!}
                y={m.top}
                width={x.bandwidth()}
                height={height - m.top - m.bottom}
                fill="transparent"
                onMouseMove={() => {
                  setHover(d.key)
                  setTip({ x: cx, y: y(d.value), content: d.tip ?? (<><TipTitle>{d.label}</TipTitle><TipRow>{format(d.value)}</TipRow></>) })
                }}
              />
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

// ---------------------------------------------------------------- sequential helpers

const SEQ = ['var(--q1)', 'var(--q2)', 'var(--q3)', 'var(--q4)', 'var(--q5)', 'var(--q6)', 'var(--q7)']

/** Minutes-per-day buckets for the calendar */
const CAL_STEPS = [15, 30, 60, 90, 120, 180] // minutes
function calColor(sec: number) {
  if (!sec) return 'var(--q0)'
  const m = sec / 60
  const i = CAL_STEPS.findIndex((s) => m < s)
  return SEQ[i === -1 ? SEQ.length - 1 : i]
}

export function SeqLegend({ labels }: { labels: [string, string] }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted">
      <span>{labels[0]}</span>
      {['var(--q0)', ...SEQ].map((c) => (
        <span key={c} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />
      ))}
      <span>{labels[1]}</span>
    </div>
  )
}

// ---------------------------------------------------------------- calendar

export function CalendarHeatmap({ daily, year }: { daily: [string, number][]; year: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const map = useMemo(() => new Map(daily), [daily])
  const start = new Date(Date.UTC(year, 0, 1))
  const startDow = (start.getUTCDay() + 6) % 7 // Monday = 0
  const days = (Date.UTC(year + 1, 0, 1) - start.getTime()) / 86_400_000
  const weeks = Math.ceil((days + startDow) / 7)
  const left = 30
  const gap = 3
  const cell = Math.max(6, Math.min(22, Math.floor((width - left) / weeks) - gap))
  const step = cell + gap
  const height = 18 + step * 7

  const todayIso = new Date().toLocaleDateString('en-CA')
  const cells = []
  const monthLabels: { x: number; label: string }[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000)
    const iso = d.toISOString().slice(0, 10)
    const idx = i + startDow
    const col = Math.floor(idx / 7)
    const row = idx % 7
    if (d.getUTCDate() === 1) monthLabels.push({ x: left + col * step, label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) })
    const sec = map.get(iso) ?? 0
    const future = iso > todayIso
    cells.push(
      <rect
        key={iso}
        x={left + col * step}
        y={18 + row * step}
        width={cell}
        height={cell}
        rx={Math.min(3, cell / 4)}
        fill={future ? 'none' : calColor(sec)}
        stroke={future ? 'var(--grid)' : undefined}
        onMouseEnter={() =>
          setTip({
            x: left + col * step + cell / 2,
            y: 18 + row * step,
            content: (
              <>
                <TipTitle>
                  {weekdayOf(iso)}, {fmtDate(iso, true)}
                </TipTitle>
                <TipRow>{sec ? duration(sec) + ' listened' : 'No listening'}</TipRow>
              </>
            ),
          })
        }
      />,
    )
  }

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label={`Daily listening calendar for ${year}`}>
        {monthLabels.map((m) => (
          <text key={m.label} x={m.x} y={10} className="fill-muted text-[11px]">
            {m.label}
          </text>
        ))}
        {[0, 2, 4].map((r) => (
          <text key={r} x={0} y={18 + r * step + cell / 2} dy="0.32em" className="fill-muted text-[10px]">
            {WD[r]}
          </text>
        ))}
        {cells}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

// ---------------------------------------------------------------- hour x weekday

export function HourHeatmap({ grid }: { grid: number[][] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const left = 36
  const top = 4
  const gap = 3
  const cw = Math.max(8, (width - left) / 24 - gap)
  const ch = Math.min(28, Math.max(14, cw))
  const height = top + 7 * (ch + gap) + 20
  const max = Math.max(1, ...grid.flat())
  const color = (v: number) => (v <= 0 ? 'var(--q0)' : SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * SEQ.length))])
  const total = grid.flat().reduce((a, b) => a + b, 0) || 1

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Listening by hour and weekday">
        {grid.map((row, d) => (
          <g key={d}>
            <text x={0} y={top + d * (ch + gap) + ch / 2} dy="0.32em" className="fill-muted text-[11px]">
              {WD[d]}
            </text>
            {row.map((v, h) => (
              <rect
                key={h}
                x={left + h * (cw + gap)}
                y={top + d * (ch + gap)}
                width={cw}
                height={ch}
                rx={3}
                fill={color(v)}
                onMouseEnter={() =>
                  setTip({
                    x: left + h * (cw + gap) + cw / 2,
                    y: top + d * (ch + gap),
                    content: (
                      <>
                        <TipTitle>
                          {WD[d]} · {hourLabel(h)}–{hourLabel((h + 1) % 24)}
                        </TipTitle>
                        <TipRow>
                          {duration(v)} · {((v / total) * 100).toFixed(1)}% of listening
                        </TipRow>
                      </>
                    ),
                  })
                }
              />
            ))}
          </g>
        ))}
        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={left + h * (cw + gap)} y={height - 4} className="fill-muted text-[11px]">
            {hourLabel(h)}
          </text>
        ))}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

// ---------------------------------------------------------------- 24h clock

export function ListeningClock({ hourly, size = 280 }: { hourly: number[]; size?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...hourly)
  const total = hourly.reduce((a, b) => a + b, 0) || 1
  const c = size / 2
  const r0 = size * 0.2
  const r1 = size / 2 - 22
  const r = scaleLinear().domain([0, max]).range([r0 + 2, r1])
  const peak = hourly.indexOf(max)
  const arc = (h: number, rad: number) => {
    const a0 = ((h / 24) * 360 - 90 + 1.6) * (Math.PI / 180)
    const a1 = (((h + 1) / 24) * 360 - 90 - 1.6) * (Math.PI / 180)
    const p = (a: number, rr: number) => `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`
    return `M${p(a0, r0)}L${p(a0, rad)}A${rad},${rad} 0 0 1 ${p(a1, rad)}L${p(a1, r0)}A${r0},${r0} 0 0 0 ${p(a0, r0)}Z`
  }
  const shown = hover ?? peak
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[320px]" role="img" aria-label="Listening by hour of day" onMouseLeave={() => setHover(null)}>
      <circle cx={c} cy={c} r={r1} fill="none" stroke="var(--grid)" />
      <circle cx={c} cy={c} r={r0} fill="none" stroke="var(--grid)" />
      {hourly.map((v, h) => (
        <path key={h} d={arc(h, v ? r(v) : r0 + 2)} fill={h === shown ? 'var(--s2)' : 'var(--s1)'} opacity={hover != null && hover !== h ? 0.5 : 1} onMouseEnter={() => setHover(h)}>
          <title>
            {hourLabel(h)}: {duration(v)}
          </title>
        </path>
      ))}
      {[0, 6, 12, 18].map((h) => {
        const a = ((h / 24) * 360 - 90) * (Math.PI / 180)
        return (
          <text key={h} x={c + (r1 + 12) * Math.cos(a)} y={c + (r1 + 12) * Math.sin(a)} textAnchor="middle" dy="0.32em" className="fill-muted text-[11px]">
            {hourLabel(h)}
          </text>
        )
      })}
      <text x={c} y={c - 6} textAnchor="middle" className="fill-ink text-[18px] font-semibold" style={{ fill: 'var(--ink)' }}>
        {hourLabel(shown)}
      </text>
      <text x={c} y={c + 14} textAnchor="middle" className="fill-muted text-[11px]">
        {((hourly[shown] / total) * 100).toFixed(1)}% of time
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------- bar list (horizontal, HTML)

export interface BarItem {
  key: string
  label: ReactNode
  value: number
  display: string
  sub?: ReactNode
  leading?: ReactNode
}

export function BarList({ items, color = 'var(--s1)' }: { items: BarItem[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ol className="flex flex-col gap-3">
      {items.map((it, i) => (
        <li key={it.key} className="group flex items-center gap-3">
          <span className="tnum w-5 shrink-0 text-right text-[12px] text-muted">{i + 1}</span>
          {it.leading}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[14px] font-medium text-ink">{it.label}</span>
              <span className="tnum shrink-0 text-[13px] text-ink-2">{it.display}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-2">
              <div className="h-full rounded-full transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(1.5, (it.value / max) * 100)}%`, background: color }} />
            </div>
            {it.sub && <div className="mt-1 truncate text-[12px] text-muted">{it.sub}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------- multi-line (family)

export interface LineSeries {
  key: string
  name: string
  color: string
  points: { x: string; y: number }[]
}

export function MultiLine({ series, height = 260, xLabel }: { series: LineSeries[]; height?: number; xLabel: (x: string) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hx, setHx] = useState<string | null>(null)
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort()
  const m = { top: 12, right: 80, bottom: 26, left: 40 }
  if (!xs.length) return null
  const toDate = (x: string) => new Date(x + '-15T00:00:00Z')
  const x = scaleTime().domain([toDate(xs[0]), toDate(xs[xs.length - 1])]).range([m.left, width - m.right])
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y)))
  const ticks = niceTicks(max)
  const y = scaleLinear().domain([0, ticks[ticks.length - 1]]).range([height - m.bottom, m.top])
  const full = (s: LineSeries) => xs.map((xx) => ({ x: xx, y: s.points.find((p) => p.x === xx)?.y ?? 0 }))
  const path = d3line<{ x: string; y: number }>()
    .x((p) => x(toDate(p.x)))
    .y((p) => y(p.y))
    .curve(curveMonotoneX)
  const every = Math.ceil(xs.length / Math.max(2, Math.floor((width - m.left - m.right) / 56)))

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Monthly listening per family member"
        onMouseMove={(e) => {
          const bx = e.currentTarget.getBoundingClientRect().left
          const px = e.clientX - bx
          let best = xs[0]
          for (const xx of xs) if (Math.abs(x(toDate(xx)) - px) < Math.abs(x(toDate(best)) - px)) best = xx
          setHx(best)
        }}
        onMouseLeave={() => setHx(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
            <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-muted text-[11px]">
              {Math.round(t / 3600)}h
            </text>
          </g>
        ))}
        {xs.map((xx, i) =>
          i % every === 0 ? (
            <text key={xx} x={x(toDate(xx))} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {xLabel(xx)}
            </text>
          ) : null,
        )}
        {hx && <line x1={x(toDate(hx))} x2={x(toDate(hx))} y1={m.top} y2={height - m.bottom} stroke="var(--axis)" />}
        {series.map((s) => {
          const pts = full(s)
          const last = pts[pts.length - 1]
          return (
            <g key={s.key}>
              <path d={path(pts) ?? ''} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(toDate(last.x))} cy={y(last.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              {hx && <circle cx={x(toDate(hx))} cy={y(pts.find((p) => p.x === hx)!.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
            </g>
          )
        })}
        {/* direct end labels, pushed apart so they don't collide */}
        {(() => {
          const ends = series
            .map((s) => {
              const pts = full(s)
              return { s, y: y(pts[pts.length - 1].y) }
            })
            .sort((a, b) => a.y - b.y)
          for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14
          return ends.map((e) => (
            <text key={e.s.key} x={width - m.right + 10} y={e.y} dy="0.32em" className="fill-ink-2 text-[12px]" style={{ fill: 'var(--ink-2)' }}>
              {e.s.name}
            </text>
          ))
        })()}
      </svg>
      {hx && (
        <Tooltip
          width={width}
          tip={{
            x: x(toDate(hx)),
            y: m.top + 10,
            content: (
              <>
                <TipTitle>{xLabel(hx)} {hx.slice(0, 4)}</TipTitle>
                {series
                  .map((s) => ({ s, v: s.points.find((p) => p.x === hx)?.y ?? 0 }))
                  .sort((a, b) => b.v - a.v)
                  .map(({ s, v }) => (
                    <div key={s.key} className="flex items-center gap-2 text-ink-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      <span className="flex-1">{s.name}</span>
                      <span className="tnum">{duration(v)}</span>
                    </div>
                  ))}
              </>
            ),
          }}
        />
      )}
    </div>
  )
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  )
}
