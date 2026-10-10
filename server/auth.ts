import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { SignJWT, jwtVerify } from 'jose'
import type { UserType } from '../shared/types.ts'
import { config } from './config.ts'
import { catalog } from './stats/load.ts'

const COOKIE = 'abs_stats_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export interface SessionUser {
  id: string
  username: string
  type: UserType
  isAdmin: boolean
}

let secret: Uint8Array | null = null
function getSecret() {
  if (secret) return secret
  if (config.sessionSecret) return (secret = new TextEncoder().encode(config.sessionSecret))
  // Generate once and keep it in the data dir so logins survive restarts.
  const file = path.join(config.dataDir, 'session-secret')
  fs.mkdirSync(config.dataDir, { recursive: true })
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('base64'), { mode: 0o600 })
  return (secret = new TextEncoder().encode(fs.readFileSync(file, 'utf8').trim()))
}

const isAdminType = (t: string) => t === 'root' || t === 'admin'

/**
 * Verifies credentials against Audiobookshelf itself. We never see or store
 * password hashes - ABS answers yes/no and tells us who the user is.
 */
async function verifyWithAbs(username: string, password: string): Promise<SessionUser> {
  if (!config.absUrl) throw new HttpError(500, 'ABS_URL is not configured')
  let res: Response
  try {
    res = await fetch(`${config.absUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new HttpError(502, `Couldn't reach Audiobookshelf at ${config.absUrl}`)
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(401, 'Wrong username or password')
  if (res.status === 429) throw new HttpError(429, 'Too many attempts - wait a minute and try again')
  if (!res.ok) throw new HttpError(502, `Audiobookshelf answered ${res.status}`)
  const body = (await res.json()) as { user?: { id: string; username: string; type: UserType } }
  if (!body.user?.id) throw new HttpError(502, 'Unexpected login response from Audiobookshelf')
  const { id, username: name, type } = body.user
  return { id, username: name, type, isAdmin: isAdminType(type) }
}

function verifyDemo(username: string): SessionUser {
  const u = catalog().users.find((x) => x.username.toLowerCase() === username.toLowerCase())
  if (!u) throw new HttpError(401, 'No such user in the demo database')
  return { ...u, isAdmin: isAdminType(u.type) }
}

export async function login(c: Context, username: string, password: string) {
  const user = config.authMode === 'demo' ? verifyDemo(username) : await verifyWithAbs(username, password)
  const token = await new SignJWT({ u: user.username, t: user.type })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret())
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE,
    secure: c.req.url.startsWith('https:'),
  })
  return user
}

export function logout(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' })
}

export const requireUser: MiddlewareHandler<{ Variables: { user: SessionUser } }> = async (c, next) => {
  const token = getCookie(c, COOKIE)
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const type = String(payload.t) as UserType
    c.set('user', { id: String(payload.sub), username: String(payload.u), type, isAdmin: isAdminType(type) })
  } catch {
    logout(c)
    return c.json({ error: 'Session expired' }, 401)
  }
  await next()
}

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 429 | 500 | 502,
    message: string,
  ) {
    super(message)
  }
}
