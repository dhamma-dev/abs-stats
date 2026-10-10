import { useState } from 'react'
import type { NamedStat } from '../../../shared/types.ts'
import { useView } from '../lib/view.ts'
import { BarList, ColumnChart } from '../components/charts.tsx'
import { Card, Cover, Empty, Pills, ProgressBar } from '../components/ui.tsx'
import { authors, date, duration, pct, plural } from '../lib/format.ts'

const covers = (n: NamedStat) => (
  <div className="flex -space-x-5">
    {n.covers.slice(0, 3).map((c, i) => (
      <Cover key={c} itemId={c} title={n.name} size={40} rounded={6} className="ring-2 ring-[var(--surface)]" />
    )).reverse()}
    {n.covers.length === 0 && <div className="h-10 w-10 rounded-md bg-surface-2" />}
  </div>
)

export function Taste() {
  const s = useView().stats!
  const [tab, setTab] = useState<'authors' | 'narrators' | 'series' | 'genres'>('authors')
  const lists = { authors: s.topAuthors, narrators: s.topNarrators, series: s.topSeries, genres: s.topGenres }
  const list = lists[tab]
  const totalBookSec = Math.max(1, s.totals.bookSec)

  return (
    <div className="grid gap-4">
      {/* headline trio */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Top author', item: s.topAuthors[0] },
          { label: 'Top narrator', item: s.topNarrators[0] },
          { label: 'Top genre', item: s.topGenres[0] },
        ].map(({ label, item }) =>
          item ? (
            <div key={label} className="card flex items-center gap-4 p-5">
              {covers(item)}
              <div className="min-w-0">
                <div className="text-[13px] text-muted">{label}</div>
                <div className="truncate text-[20px] font-semibold tracking-tight">{item.name}</div>
                <div className="text-[12px] text-ink-2">
                  {duration(item.sec)} · {plural(item.books, 'book')}
                </div>
              </div>
            </div>
          ) : null,
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="Your favorites"
          subtitle="Ranked by time spent listening"
          action={
            <Pills
              label="Ranking"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'authors', label: 'Authors' },
                { value: 'narrators', label: 'Narrators' },
                { value: 'series', label: 'Series' },
                { value: 'genres', label: 'Genres' },
              ]}
            />
          }
        >
          {list.length ? (
            <BarList
              items={list.map((n) => ({
                key: n.name,
                label: n.name,
                value: n.sec,
                display: duration(n.sec),
                sub: `${plural(n.books, 'book')}${tab !== 'genres' ? ` · ${pct(n.sec / totalBookSec)} of book time` : ''}`,
                leading: covers(n),
              }))}
            />
          ) : (
            <Empty>No {tab} data — add metadata to your books in Audiobookshelf to fill this in.</Empty>
          )}
        </Card>
        <div className="grid gap-4 lg:col-span-2">
          <Card title="When your books were written" subtitle="Listening time by publication decade">
            {s.decades.length ? (
              <ColumnChart
                height={190}
                color="var(--s2)"
                data={s.decades.map((d) => ({
                  key: String(d.decade),
                  label: d.decade < 1900 ? `${d.decade}` : `’${String(d.decade).slice(2)}s`,
                  value: d.sec,
                  tip: <><div className="font-semibold">{d.decade}s</div><div className="text-ink-2">{plural(d.books, 'book')} · {duration(d.sec)}</div></>,
                }))}
              />
            ) : (
              <Empty>No publication years in your metadata.</Empty>
            )}
          </Card>
          <Card title="Book lengths you pick" subtitle="Books played, by runtime">
            <ColumnChart
              height={170}
              color="var(--s3)"
              axisFormat={(v) => String(v)}
              format={(v) => plural(v, 'book')}
              data={s.lengths.map((l) => ({ key: l.label, label: l.label, value: l.books }))}
            />
          </Card>
        </div>
      </div>

      <Card title="Left on the shelf" subtitle="Started, not touched in 45+ days, and not finished">
        {s.abandoned.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.abandoned.map((a) => (
              <div key={a.book.id} className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-3">
                <Cover itemId={a.book.itemId} title={a.book.title} size={52} rounded={8} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{a.book.title}</div>
                  <div className="truncate text-[12px] text-muted">{authors(a.book.authors)}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar value={a.progress} />
                    <span className="tnum text-[11px] text-ink-2">{pct(a.progress)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">last played {date(a.lastDate, true)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing abandoned. You finish what you start.</Empty>
        )}
      </Card>
    </div>
  )
}
