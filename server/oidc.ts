import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { jwtVerify, SignJWT } from 'jose'
import * as oidc from 'openid-client'
import type { UserType } from '../shared/types.ts'
import { HttpError, getSecret, isAdminType, isHttps, issueSession, type SessionUser } from './auth.ts'
import { config } from './config.ts'
import { all, parseJson, refreshSnapshot } from './db.ts'

/**
 * Sign in through the same OpenID Connect provider Audiobookshelf uses.
 *
 * ABS records each OIDC user's provider id (`sub`) in users.extraData.authOpenIDSub
 * the first time they log in there. We run our own authorization-code + PKCE flow
 * against that provider and look the ABS user up by the same `sub`, falling back to
 * a verified email for people who haven't been linked yet.
 */

const FLOW_COOKIE = 'abs_stats_oidc'
const redirectUri = () => `${config.publicUrl}/api/auth/oidc/callback`

let discovered: Promise<oidc.Configuration> | null = null
function client() {
  discovered ??= oidc
    .discovery(
      new URL(config.oidc.issuer),
      config.oidc.clientId,
      config.oidc.clientSecret || undefined,
      undefined,
      // Home-lab providers are often reached over plain http on the LAN.
      config.oidc.issuer.startsWith('http:') ? { execute: [oidc.allowInsecureRequests] } : undefined,
    )
    .catch((err) => {
      discovered = null // retry next time
      throw new HttpError(502, `Couldn't reach the OIDC provider: ${err.message}`)
    })
  return discovered
}

export async function startOidc(c: Context) {
  const cfg = await client()
  const verifier = oidc.randomPKCECodeVerifier()
  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const url = oidc.buildAuthorizationUrl(cfg, {
    redirect_uri: redirectUri(),
    scope: config.oidc.scopes,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  })
  // Keep the flow secrets in a short-lived signed cookie rather than server memory.
  const flow = await new SignJWT({ verifier, state, nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(getSecret())
  setCookie(c, FLOW_COOKIE, flow, { httpOnly: true, sameSite: 'Lax', path: '/api/auth/oidc', maxAge: 600, secure: isHttps(c) })
  return c.redirect(url.href)
}

export async function finishOidc(c: Context) {
  const flowToken = getCookie(c, FLOW_COOKIE)
  deleteCookie(c, FLOW_COOKIE, { path: '/api/auth/oidc' })
  if (!flowToken) throw new HttpError(400, 'Sign-in took too long or cookies are blocked - try again')
  const { payload } = await jwtVerify(flowToken, getSecret()).catch(() => {
    throw new HttpError(400, 'Sign-in session expired - try again')
  })

  const cfg = await client()
  // Rebuild the callback URL on the public origin so it matches the registered redirect URI.
  const current = new URL(redirectUri())
  current.search = new URL(c.req.url).search
  let claims: oidc.IDToken | undefined
  let accessToken: string
  try {
    const tokens = await oidc.authorizationCodeGrant(cfg, current, {
      pkceCodeVerifier: String(payload.verifier),
      expectedState: String(payload.state),
      expectedNonce: String(payload.nonce),
    })
    claims = tokens.claims()
    accessToken = tokens.access_token
  } catch (err) {
    throw new HttpError(401, `Sign-in was rejected: ${(err as Error).message}`)
  }
  if (!claims?.sub) throw new HttpError(401, 'The provider did not return a user id')

  // Some providers only put email/username in userinfo, not the ID token.
  let info: Record<string, unknown> = { ...claims }
  if (!info.email || !info.preferred_username) {
    try {
      info = { ...(await oidc.fetchUserInfo(cfg, accessToken, claims.sub)), ...info }
    } catch {
      // ID token claims are enough if userinfo isn't available
    }
  }

  let user = findAbsUser(info)
  if (!user) {
    // They may have just signed in to ABS for the first time - refresh and look again.
    await refreshSnapshot()
    user = findAbsUser(info)
  }
  if (!user) {
    const who = String(info.email ?? info.preferred_username ?? claims.sub)
    throw new HttpError(403, `No Audiobookshelf account is linked to ${who}. Sign in to Audiobookshelf once with SSO, then try again.`)
  }
  await issueSession(c, user)
  return c.redirect('/')
}

interface AbsUserRow {
  id: string
  username: string
  email: string | null
  type: UserType
  isActive: number | null
  extraData: string | null
}

function findAbsUser(info: Record<string, unknown>): SessionUser | null {
  const rows = all<AbsUserRow>(`SELECT id, username, email, type, isActive, extraData FROM users`)
  const sub = String(info.sub)
  let row = rows.find((r) => parseJson<Record<string, unknown>>(r.extraData, {}).authOpenIDSub === sub)

  // Opt-in only, and only when the provider explicitly says the email is verified: otherwise
  // anyone who can set an email at the provider could take over an unlinked ABS account
  // (often the root admin). Never matches accounts already linked to another provider id.
  if (!row && config.oidc.matchEmail && typeof info.email === 'string' && info.email_verified === true) {
    const email = info.email.toLowerCase()
    row = rows.find((r) => r.email?.toLowerCase() === email && !parseJson<Record<string, unknown>>(r.extraData, {}).authOpenIDSub)
  }
  if (!row) return null
  if (row.isActive === 0) throw new HttpError(403, 'This Audiobookshelf account is disabled')
  return { id: row.id, username: row.username, type: row.type, isAdmin: isAdminType(row.type) }
}
