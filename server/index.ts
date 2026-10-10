import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Me } from '../shared/types.ts'
import { HttpError, login, logout, requireUser, type SessionUser } from './auth.ts'
import { config } from './config.ts'
import { getCover } from './covers.ts'
import { snapshotStatus, snapshotVersion, startSnapshotLoop } from './db.ts'
import { familyStats, listUsers, userStats } from './stats/compute.ts'

const app = new Hono<{ Variables: { user: SessionUser } }>()

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: err.message || 'Something went wrong' }, 500)
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

app.get('/api/health', (c) => c.json({ ok: true, snapshot: snapshotStatus(), authMode: config.authMode }))

app.get('/api/auth/mode', (c) =>
  c.json({ mode: config.authMode, users: config.authMode === 'demo' ? listUsers().map((u) => u.username) : [] }),
)

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json<{ username?: string; password?: string }>()
  if (!username) throw new HttpError(400, 'Username is required')
  const user = await login(c, username.trim(), password ?? '')
  return c.json({ ok: true, user })
})

app.post('/api/auth/logout', (c) => {
  logout(c)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- signed in

app.use('/api/*', requireUser)

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

await startSnapshotLoop()
serve({ fetch: app.fetch, port: config.port }, (info) => {
  const s = snapshotStatus()
  console.log(`ABS Stats listening on http://localhost:${info.port}`)
  console.log(`  database: ${config.absDbPath} (${s.ready ? 'snapshot ready' : 'NOT READY: ' + s.lastError})`)
  console.log(`  auth: ${config.authMode}${config.authMode === 'abs' ? ` via ${config.absUrl || '(ABS_URL missing!)'}` : ''}`)
  console.log(`  timezone: ${config.timeZone}`)
})
