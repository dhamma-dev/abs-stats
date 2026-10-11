import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import type { Me } from '../shared/types.ts'
import { HttpError, login, logout, requireUser, type SessionUser } from './auth.ts'
import { config, oidcEnabled } from './config.ts'
import { getCover } from './covers.ts'
import { finishOidc, startOidc } from './oidc.ts'
import { clearLoginAttempts, clientIp, takeLoginAttempt } from './ratelimit.ts'
import { ensureFresh, initSnapshot, snapshotStatus, snapshotVersion } from './db.ts'
import { familyStats, listUsers, userStats } from './stats/compute.ts'

const app = new Hono<{ Variables: { user: SessionUser } }>()

app.use('*', secureHeaders({ strictTransportSecurity: false }))

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Something went wrong' }, 500)
})

// ---- small result cache, keyed on the snapshot version so it clears itself on refresh
const results = new Map<string, unknown>()
function cached<T>(key: string, fn: () => T): T {
  const k = `${snapshotVersion()}:${key}`
  if (results.has(k)) return results.get(k) as T
  if (results.size > 200) results.clear()
  const v = fn()
  results.set(k, v)
  return v
}

const parseYear = (v: string | undefined) => (v && /^\d{4}$/.test(v) ? Number(v) : null)

// ---------------------------------------------------------------- public

// Public, so it leaves out lastError (which can contain filesystem paths).
app.get('/api/health', (c) => {
  const { ready, lastRefresh } = snapshotStatus()
  return c.json({ ok: true, snapshot: { ready, lastRefresh }, authMode: config.authMode })
})

app.get('/api/auth/mode', (c) =>
  c.json({
    mode: config.authMode,
    users: config.authMode === 'demo' ? listUsers().map((u) => u.username) : [],
    local: config.authMode === 'demo' || config.localLogin,
    oidc: config.authMode !== 'demo' && oidcEnabled() ? { label: config.oidc.buttonText } : null,
  }),
)

// Browser redirects, so failures go back to the login page instead of returning JSON.
const oidcRoute = (fn: typeof startOidc) => async (c: Parameters<typeof startOidc>[0]) => {
  if (!oidcEnabled()) return c.redirect('/login?error=' + encodeURIComponent('SSO is not configured'))
  try {
    return await fn(c)
  } catch (err) {
    console.warn('[oidc]', (err as Error).message)
    return c.redirect('/login?error=' + encodeURIComponent((err as Error).message))
  }
}
app.get('/api/auth/oidc/start', oidcRoute(startOidc))
app.get('/api/auth/oidc/callback', oidcRoute(finishOidc))

app.post('/api/auth/login', async (c) => {
  // A cross-site form can't send application/json, so this blocks login CSRF.
  if (!c.req.header('content-type')?.startsWith('application/json')) throw new HttpError(400, 'Expected JSON')
  const { username, password } = await c.req.json<{ username?: string; password?: string }>()
  if (!username) throw new HttpError(400, 'Username is required')
  const ip = clientIp(c)
  takeLoginAttempt(ip)
  const user = await login(c, username.trim(), password ?? '')
  clearLoginAttempts(ip)
  return c.json({ ok: true, user })
})

app.post('/api/auth/logout', (c) => {
  logout(c)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- signed in

app.use('/api/*', requireUser)
// Refresh the snapshot on demand (covers don't need fresh stats)
app.use('/api/*', async (c, next) => {
  if (!c.req.path.startsWith('/api/cover/')) await ensureFresh()
  await next()
})

app.get('/api/me', (c) => {
  const u = c.get('user')
  const me: Me = { id: u.id, username: u.username, type: u.type, isAdmin: u.isAdmin, familyVisible: config.familyVisible || u.isAdmin }
  return c.json(me)
})

/** Admins may look at anyone; everyone else only at themselves. */
function resolveUserId(viewer: SessionUser, requested: string | undefined) {
  if (!requested || requested === viewer.id) return viewer.id
  if (!viewer.isAdmin) throw new HttpError(403, "You can only view your own stats")
  return requested
}

app.get('/api/users', (c) => {
  const viewer = c.get('user')
  const users = listUsers()
  return c.json(viewer.isAdmin || config.familyVisible ? users : users.filter((u) => u.id === viewer.id))
})

app.get('/api/stats', (c) => {
  const userId = resolveUserId(c.get('user'), c.req.query('user'))
  const year = parseYear(c.req.query('year'))
  return c.json(cached(`u:${userId}:${year}`, () => userStats(userId, year)))
})

app.get('/api/family', (c) => {
  const viewer = c.get('user')
  if (!config.familyVisible && !viewer.isAdmin) throw new HttpError(403, 'The family page is turned off')
  const year = parseYear(c.req.query('year'))
  return c.json(cached(`f:${year}`, () => familyStats(year)))
})

app.get('/api/cover/:itemId', async (c) => {
  const { body, type } = await getCover(c.req.param('itemId'))
  return c.body(body as ArrayBuffer, 200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' })
})

// ---------------------------------------------------------------- web app

if (fs.existsSync(config.webDir)) {
  const root = path.relative(process.cwd(), config.webDir)
  app.use('/*', serveStatic({ root }))
  const index = fs.readFileSync(path.join(config.webDir, 'index.html'), 'utf8')
  app.get('*', (c) => c.html(index))
}

await initSnapshot()
serve({ fetch: app.fetch, port: config.port }, (info) => {
  const s = snapshotStatus()
  console.log(`ABS Stats listening on http://localhost:${info.port}`)
  console.log(`  database: ${config.absDbPath} (${s.ready ? 'snapshot ready' : 'NOT READY: ' + s.lastError})`)
  console.log(`  auth: ${config.authMode}${config.authMode === 'abs' ? ` via ${config.absUrl || '(ABS_URL missing!)'}` : ''}`)
  if (config.authMode === 'abs') {
    console.log(`  password login: ${config.localLogin ? 'on' : 'off'}`)
    console.log(`  SSO: ${oidcEnabled() ? `${config.oidc.issuer} (redirect URI ${config.publicUrl}/api/auth/oidc/callback)` : config.oidc.issuer ? 'NOT ACTIVE - set PUBLIC_URL and OIDC_CLIENT_ID' : 'off'}`)
  }
  console.log(`  timezone: ${config.timeZone}`)
})
