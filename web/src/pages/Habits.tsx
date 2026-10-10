import { useView } from '../lib/view.ts'
import { BarList, ColumnChart, HourHeatmap, ListeningClock, SeqLegend } from '../components/charts.tsx'
import { Card } from '../components/ui.tsx'
import { duration, hourLabel, pct, plural, WD, WEEKDAYS } from '../lib/format.ts'

export function Habits() {
  const s = useView().stats!
  const hourly = Array.from({ length: 24 }, (_, h) => s.hourWeekday.reduce((a, row) => a + row[h], 0))
  const byDay = s.hourWeekday.map((row) => row.reduce((a, b) => a + b, 0))
  const total = byDay.reduce((a, b) => a + b, 0) || 1
  const weekendShare = (byDay[5] + byDay[6]) / total
  const night = hourly.slice(22).concat(hourly.slice(0, 5)).reduce((a, b) => a + b, 0) / total
  const morning = hourly.slice(5, 12).reduce((a, b) => a + b, 0) / total
  const typical = s.sessionLengths.reduce((a, b) => (b.count > a.count ? b : a), s.sessionLengths[0])

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Your listening clock" subtitle="Share of listening by hour of day — hover a slice">
          <ListeningClock hourly={hourly} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px]">
            <div className="rounded-xl bg-surface-2 p-2.5">
              <div className="text-[16px] font-semibold text-ink">{pct(morning)}</div>
              <div className="text-muted">mornings</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5">
              <div className="text-[16px] font-semibold text-ink">{pct(night)}</div>
              <div className="text-muted">late night</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5">
              <div className="text-[16px] font-semibold text-ink">{pct(weekendShare)}</div>
              <div className="text-muted">weekends</div>
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2" title="When you listen" subtitle="Hour of day × day of week" action={<SeqLegend labels={['Less', 'More']} />}>
          <HourHeatmap grid={s.hourWeekday} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Day of the week" subtitle={`${WEEKDAYS[byDay.indexOf(Math.max(...byDay))]}s are your big day`}>
          <ColumnChart
            height={200}
            data={byDay.map((v, i) => ({ key: WD[i], label: WD[i], value: v, tip: <><div className="font-semibold">{WEEKDAYS[i]}s</div><div className="text-ink-2">{duration(v)} · {pct(v / total)} of listening</div></> }))}
          />
        </Card>
        <Card title="How long you listen in one go" subtitle={`Most sessions run ${typical.label}`}>
          <ColumnChart
            height={200}
            color="var(--s3)"
            axisFormat={(v) => String(v)}
            format={(v) => plural(v, 'session')}
            data={s.sessionLengths.map((b) => ({
              key: b.label,
              label: b.label,
              value: b.count,
              tip: <><div className="font-semibold">{b.label}</div><div className="text-ink-2">{plural(b.count, 'session')} · {duration(b.sec)} total</div></>,
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Where you listen" subtitle="Devices and apps, by listening time">
          <BarList
            color="var(--s7)"
            items={s.devices.map((d) => ({ key: d.name, label: d.name, value: d.sec, display: duration(d.sec), sub: plural(d.sessions, 'session') }))}
          />
        </Card>
        <Card title="Pace" subtitle="Speed is measured from how far each session moved through the book">
          <dl className="grid grid-cols-2 gap-5 text-[14px]">
            <div>
              <dt className="text-[13px] text-muted">Average speed</dt>
              <dd className="mt-1 text-[28px] font-semibold tracking-tight">{s.totals.effectiveSpeed ? `${s.totals.effectiveSpeed.toFixed(2)}×` : '—'}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Time saved by speed</dt>
              <dd className="mt-1 text-[28px] font-semibold tracking-tight">{duration(s.totals.timeSavedSec)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Story time covered</dt>
              <dd className="mt-1 text-[20px] font-semibold">{duration(s.totals.contentCoveredSec)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Peak hour</dt>
              <dd className="mt-1 text-[20px] font-semibold">{hourLabel(hourly.indexOf(Math.max(...hourly)))}</dd>
            </div>
            {s.totals.podcastSec > 0 && (
              <div className="col-span-2 text-[13px] text-ink-2">
                Includes {duration(s.totals.podcastSec)} of podcasts ({pct(s.totals.podcastSec / s.totals.listenSec)} of your time).
              </div>
            )}
          </dl>
        </Card>
      </div>
    </div>
  )
}
