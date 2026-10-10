import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/ui.tsx'
import { api } from '../lib/api.ts'

export function Login() {
  const mode = useQuery({ queryKey: ['auth-mode'], queryFn: () => api<{ mode: 'abs' | 'demo'; users: string[] }>('/api/auth/mode') })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  async function signIn(name: string, pw: string) {
    setBusy(true)
    setError(null)
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: name, password: pw }) })
      await qc.resetQueries()
      navigate((location.state as { from?: string })?.from ?? '/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void signIn(username, password)
  }

  return (
    <div className="app-glow flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="mb-4 h-14 w-14" />
          <h1 className="text-[28px] font-semibold tracking-tight">Shelf Stats</h1>
          <p className="mt-1 text-[14px] text-ink-2">Your Audiobookshelf listening, in depth.</p>
        </div>

        {mode.data?.mode === 'demo' ? (
          <div className="card p-6">
            <p className="mb-4 text-[13px] text-ink-2">Demo mode: pick a family member.</p>
            <div className="grid grid-cols-2 gap-2">
              {mode.data.users.map((u) => (
                <button key={u} disabled={busy} onClick={() => signIn(u, '')} className="flex items-center gap-2.5 rounded-xl border hairline bg-surface-2/40 px-3 py-3 text-left text-[14px] font-medium transition-colors hover:bg-surface-2">
                  <Avatar name={u} index={[...mode.data!.users].sort((a, b) => a.localeCompare(b)).indexOf(u)} size={28} />
                  {u}
                </button>
              ))}
            </div>
            {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
          </div>
        ) : (
          <form onSubmit={submit} className="card flex flex-col gap-4 p-6">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Username
              <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="rounded-xl border hairline bg-page px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-accent" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl border hairline bg-page px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-accent" />
            </label>
            {error && <p className="text-[13px] text-bad">{error}</p>}
            <button disabled={busy || !username} className="mt-1 rounded-xl bg-accent px-4 py-2.5 text-[15px] font-semibold text-white transition-opacity disabled:opacity-50">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-center text-[12px] text-muted">Use your Audiobookshelf username and password. They go straight to your ABS server and aren't stored here.</p>
          </form>
        )}
      </div>
    </div>
  )
}
