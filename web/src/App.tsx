import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { Me } from '../../shared/types.ts'
import { Avatar, Pills } from './components/ui.tsx'
import { ViewCtx, useView } from './lib/view.ts'
import { api, ApiError, useMe, usePersonIndex, useStats, useUsers } from './lib/api.ts'
import { Books } from './pages/Books.tsx'
import { Family } from './pages/Family.tsx'
import { Habits } from './pages/Habits.tsx'
import { Login } from './pages/Login.tsx'
import { Overview } from './pages/Overview.tsx'
import { Taste } from './pages/Taste.tsx'
import { Wrapped } from './pages/Wrapped.tsx'

export function App() {
  const me = useMe()
  const location = useLocation()

  if (me.isLoading) return <Splash />
  if (me.error instanceof ApiError && me.error.status === 401) {
    return location.pathname === '/login' ? <Login /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (me.error || !me.data) return <Splash message={(me.error as Error)?.message ?? 'Could not reach the server'} />
  if (location.pathname === '/login') return <Navigate to="/" replace />
  return <Shell me={me.data} />
}

function Splash({ message }: { message?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center text-[14px] text-ink-2">
      {message ?? <span className="animate-pulse">Loading your listening…</span>}
    </div>
  )
}

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/habits', label: 'Habits' },
  { to: '/taste', label: 'Taste' },
  { to: '/books', label: 'Books' },
]

function Shell({ me }: { me: Me }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const users = useUsers(me.isAdmin)
  const personIndex = usePersonIndex(me.isAdmin)
  const userId = (me.isAdmin && params.get('user')) || me.id
  const yearParam = params.get('year')
  const year = yearParam === 'all' ? null : yearParam ? Number(yearParam) : null
  const stats = useStats(userId, year)

  // Default to the most recent year once we know which years exist.
  const years = stats.data?.availableYears ?? []
  const latest = years[0]
  useEffect(() => {
    if (!yearParam && latest) setParams((p) => (p.set('year', String(latest)), p), { replace: true })
  }, [yearParam, latest, setParams])

  const set = (k: string, v: string | null) =>
    setParams((p) => {
      if (v == null) p.delete(k)
      else p.set(k, v)
      return p
    })

  const viewing = users.data?.find((u) => u.id === userId)?.username ?? me.username
  const nav = me.familyVisible ? [...NAV, { to: '/family', label: 'Family' }] : NAV
  const search = params.toString() ? `?${params}` : ''

  if (location.pathname.startsWith('/wrapped'))
    return (
      <ViewCtx.Provider value={{ me, userId, year, stats: stats.data, loading: stats.isFetching, error: stats.error }}>
        <Wrapped />
      </ViewCtx.Provider>
    )

  return (
    <ViewCtx.Provider value={{ me, userId, year, stats: stats.data, loading: stats.isFetching, error: stats.error }}>
      <div className="app-glow min-h-dvh">
        <header className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-3 px-4 pb-2 pt-5 sm:px-6">
          <NavLink to={`/${search}`} className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="text-[17px] font-semibold tracking-tight">Shelf Stats</span>
          </NavLink>
          <nav className="no-scrollbar order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to + search}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me.isAdmin && users.data && users.data.length > 1 && (
              <label className="flex items-center gap-2 rounded-full border hairline bg-surface py-1 pl-1 pr-2 text-[13px]">
                <Avatar name={viewing} index={personIndex(userId)} size={24} />
                <span className="sr-only">Viewing stats for</span>
                <select
                  value={userId}
                  onChange={(e) => set('user', e.target.value === me.id ? null : e.target.value)}
                  className="cursor-pointer bg-transparent font-medium text-ink outline-none"
                >
                  {users.data.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              onClick={async () => {
                await api('/api/auth/logout', { method: 'POST' })
                qc.clear()
                navigate('/login')
              }}
              className="rounded-full px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </header>

        {!location.pathname.startsWith('/family') && (
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-end justify-between gap-4 px-4 pb-2 pt-6 sm:px-6">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">{userId === me.id ? 'Your listening' : `${viewing}'s listening`}</p>
              <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]">{stats.data?.period.label ?? ' '}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {years.length > 0 && (
                <Pills
                  label="Period"
                  value={year}
                  onChange={(v) => set('year', v == null ? 'all' : String(v))}
                  options={[...years.map((y) => ({ value: y as number | null, label: String(y) })), { value: null, label: 'All time' }]}
                />
              )}
              {year != null && (
                <NavLink
                  to={`/wrapped${search}`}
                  className="rounded-full bg-gradient-to-r from-[#3987e5] to-[#9085e9] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_6px_24px_-6px_rgba(57,135,229,0.6)] transition-transform hover:scale-[1.03]"
                >
                  ▶ Play {year} Wrapped
                </NavLink>
              )}
            </div>
          </div>
        )}

        <main className={`mx-auto max-w-[1240px] px-4 pb-16 pt-4 transition-opacity sm:px-6 ${stats.isFetching ? 'opacity-70' : ''}`}>
          <Routes>
            <Route path="/" element={<Page><Overview /></Page>} />
            <Route path="/habits" element={<Page><Habits /></Page>} />
            <Route path="/taste" element={<Page><Taste /></Page>} />
            <Route path="/books" element={<Page><Books /></Page>} />
            {me.familyVisible && <Route path="/family" element={<Family />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="pb-8 text-center text-[12px] text-muted">
          Data from your Audiobookshelf server{stats.data ? ` · updated ${new Date(stats.data.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
        </footer>
      </div>
    </ViewCtx.Provider>
  )
}

/** Shows loading / error / empty states around a stats page. */
function Page({ children }: { children: ReactNode }) {
  const { stats, error } = useView()
  if (error && !stats) return <div className="card p-8 text-center text-[14px] text-bad">{(error as Error).message}</div>
  if (!stats) return <div className="card h-[60vh] animate-pulse" />
  if (stats.totals.listenSec === 0)
    return (
      <div className="card flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="text-[20px] font-semibold">No listening in {stats.period.label}</div>
        <p className="max-w-md text-[14px] text-ink-2">Pick another year above, or press play on something in Audiobookshelf and come back later.</p>
      </div>
    )
  return <>{children}</>
}
