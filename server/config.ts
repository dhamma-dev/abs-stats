import path from 'node:path'

const env = process.env

export const config = {
  port: Number(env.PORT ?? 8787),
  absDbPath: env.ABS_DB_PATH ?? './data/demo-absdatabase.sqlite',
  absUrl: (env.ABS_URL ?? '').replace(/\/+$/, ''),
  absApiKey: env.ABS_API_KEY ?? '',
  timeZone: env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
  authMode: (env.AUTH_MODE ?? 'abs') as 'abs' | 'demo',
  familyVisible: (env.FAMILY_VISIBLE ?? 'true') !== 'false',
  snapshotMinutes: Number(env.SNAPSHOT_MINUTES ?? 10),
  dataDir: path.resolve(env.DATA_DIR ?? './data'),
  sessionSecret: env.SESSION_SECRET ?? '',
  webDir: path.resolve(env.WEB_DIR ?? './dist/web'),
  /** Public URL people use to reach this app, e.g. https://stats.example.com (needed for OIDC) */
  publicUrl: (env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  /** Show the username/password form (turn off if ABS only allows OIDC) */
  localLogin: (env.LOCAL_LOGIN ?? 'true') !== 'false',
  oidc: {
    issuer: env.OIDC_ISSUER ?? '',
    clientId: env.OIDC_CLIENT_ID ?? '',
    clientSecret: env.OIDC_CLIENT_SECRET ?? '',
    scopes: env.OIDC_SCOPES ?? 'openid profile email',
    buttonText: env.OIDC_BUTTON_TEXT ?? 'Sign in with SSO',
    /** Fall back to matching verified email when the provider ID isn't linked yet */
    matchEmail: (env.OIDC_MATCH_EMAIL ?? 'true') !== 'false',
  },
}

export const oidcEnabled = () => !!(config.oidc.issuer && config.oidc.clientId && config.publicUrl)
