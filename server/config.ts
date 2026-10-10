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
}
