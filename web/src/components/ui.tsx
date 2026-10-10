import { useEffect, useRef, useState, type ReactNode } from 'react'
import { coverUrl } from '../lib/api.ts'
import { pct } from '../lib/format.ts'

export function Card({ title, subtitle, action, children, className = '' }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function StatTile({ label, value, unit, delta, deltaLabel, hint }: { label: string; value: ReactNode; unit?: string; delta?: number | null; deltaLabel?: string; hint?: ReactNode }) {
  return (
    <div className="card flex flex-col justify-between gap-3 p-5">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[30px] font-semibold leading-none tracking-tight text-ink">{value}</span>
          {unit && <span className="text-[14px] text-muted">{unit}</span>}
        </div>
        {delta != null && Number.isFinite(delta) ? (
          <div className={`mt-2 text-[12px] font-medium ${delta >= 0 ? 'text-good' : 'text-bad'}`}>
            <span aria-hidden>{delta >= 0 ? '▲' : '▼'}</span> {pct(Math.abs(delta))} <span className="font-normal text-muted">vs {deltaLabel}</span>
          </div>
        ) : hint ? (
          <div className="mt-2 text-[12px] text-muted">{hint}</div>
        ) : null}
      </div>
    </div>
  )
}

export function Cover({ itemId, title, size = 56, className = '', rounded = 10 }: { itemId: string | null; title: string; size?: number | string; className?: string; rounded?: number }) {
  const [failed, setFailed] = useState(false)
  const src = coverUrl(itemId)
  const style = { width: size, height: size, borderRadius: rounded }
  if (!src || failed)
    return (
      <div style={style} className={`flex shrink-0 items-center justify-center bg-surface-2 p-1 text-center text-[10px] leading-tight text-muted ${className}`}>
        {title.slice(0, 40)}
      </div>
    )
  return <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} style={style} className={`shrink-0 bg-surface-2 object-cover shadow-[0_1px_0_var(--border)] ${className}`} />
}

export function Pills<T extends string | number | null>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border hairline bg-surface p-1">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${on ? 'bg-ink text-page' : 'text-ink-2 hover:bg-surface-2'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Same fixed order as chart series, so a person's avatar matches their line. */
export const PERSON_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)']
export function Avatar({ name, index = 0, size = 32 }: { name: string; index?: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: PERSON_COLORS[index % PERSON_COLORS.length], fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed hairline p-6 text-center text-[13px] text-muted">{children}</div>
}

/** Width of an element, kept up to date. */
export function useWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, value * 100)}%` }} />
    </div>
  )
}
