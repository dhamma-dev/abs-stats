import { useState } from 'react'
import { useView } from '../lib/view.ts'
import { BookTimeline } from '../components/BookTimeline.tsx'
import { Card, Cover, Empty, Pills } from '../components/ui.tsx'
import { authors, date, duration, plural } from '../lib/format.ts'

type Sort = 'recent' | 'fastest' | 'longest' | 'binge'

export function Books() {
  const s = useView().stats!
  const [sort, setSort] = useState<Sort>('recent')
  const finished = [...s.finished]
  if (sort === 'recent') finished.reverse()
  if (sort === 'fastest') finished.sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9))
  if (sort === 'longest') finished.sort((a, b) => b.book.duration - a.book.duration)
  // "binge" = story hours per calendar day
  if (sort === 'binge') finished.sort((a, b) => b.book.duration / (b.days ?? 1e9) - a.book.duration / (a.days ?? 1e9))

  const totalStory = s.finished.reduce((a, f) => a + f.book.duration, 0)
  const avgDays = s.finished.filter((f) => f.days != null)
  const meanDays = avgDays.length ? avgDays.reduce((a, f) => a + f.days!, 0) / avgDays.length : null

  return (
    <div className="grid gap-4">
      <Card title="Your year in books" subtitle="Each lane is one of your most-played books">
        {s.timeline.length ? <div className="scroll-x"><div className="min-w-[560px]"><BookTimeline stats={s} /></div></div> : <Empty>No books yet.</Empty>}
      </Card>

      <Card
        title={`Finished · ${s.finished.length}`}
        subtitle={s.finished.length ? `${duration(totalStory)} of story${meanDays ? ` · ${Math.round(meanDays)} days per book on average` : ''}` : undefined}
        action={
          s.finished.length > 1 ? (
            <Pills
              label="Sort finished books"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'recent', label: 'Recent' },
                { value: 'fastest', label: 'Fastest' },
                { value: 'binge', label: 'Binged' },
                { value: 'longest', label: 'Longest' },
              ]}
            />
          ) : undefined
        }
      >
        {finished.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {finished.map((f) => (
              <figure key={f.book.id + f.finishedAt} className="group min-w-0">
                <div className="relative aspect-square w-full">
                  <Cover itemId={f.book.itemId} title={f.book.title} size="100%" rounded={12} className="transition-transform group-hover:-translate-y-0.5" />
                  {f.days != null && (
                    <span className="tnum absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                      {plural(f.days, 'day')}
                    </span>
                  )}
                </div>
                <figcaption className="mt-2">
                  <div className="truncate text-[13px] font-medium" title={f.book.title}>
                    {f.book.title}
                  </div>
                  <div className="truncate text-[12px] text-muted">{authors(f.book.authors)}</div>
                  <div className="tnum mt-0.5 text-[11px] text-ink-2">
                    {date(f.finishedAt, !s.period.year)} · {duration(f.book.duration)}
                    {f.speed && f.speed > 1.05 ? ` · ${f.speed.toFixed(1)}×` : ''}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <Empty>No books finished in {s.period.label} yet.</Empty>
        )}
      </Card>

      <Card title="All the books you played" subtitle="Top 20 by listening time">
        <div className="scroll-x">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-[12px] text-muted">
              <tr className="border-b hairline">
                <th className="py-2 pr-3 font-medium">Book</th>
                <th className="py-2 pr-3 font-medium">Listened</th>
                <th className="py-2 pr-3 font-medium">Sessions</th>
                <th className="py-2 pr-3 font-medium">First → last play</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {s.topBooks.map((b) => (
                <tr key={b.book.id} className="border-b hairline last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <Cover itemId={b.book.itemId} title={b.book.title} size={32} rounded={5} />
                      <div className="min-w-0">
                        <div className="max-w-[260px] truncate font-medium">{b.book.title}</div>
                        <div className="max-w-[260px] truncate text-[12px] text-muted">{authors(b.book.authors)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">{duration(b.sec)}</td>
                  <td className="py-2.5 pr-3">{b.sessions}</td>
                  <td className="py-2.5 pr-3 text-ink-2">
                    {date(b.firstDate)} → {date(b.lastDate)}
                  </td>
                  <td className="py-2.5">
                    {b.finished ? <span className="text-good">✓ Finished</span> : b.progress != null ? <span className="text-ink-2">{Math.round(b.progress * 100)}%</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
