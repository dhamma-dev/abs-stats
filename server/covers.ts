import { config } from './config.ts'
import { catalog } from './stats/load.ts'

/**
 * Cover art comes from Audiobookshelf's own cover endpoint using an API key, and
 * is cached in memory. Without a key (or for the demo), we draw a typographic cover.
 */

const cache = new Map<string, { body: ArrayBuffer; type: string }>()
const MAX_CACHE = 600

export async function getCover(itemId: string): Promise<{ body: ArrayBuffer | string; type: string }> {
  const hit = cache.get(itemId)
  if (hit) return hit
  if (config.absUrl && config.absApiKey) {
    try {
      const res = await fetch(`${config.absUrl}/api/items/${encodeURIComponent(itemId)}/cover?width=400&format=webp`, {
        headers: { Authorization: `Bearer ${config.absApiKey}` },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const entry = { body: await res.arrayBuffer(), type: res.headers.get('content-type') ?? 'image/jpeg' }
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
        cache.set(itemId, entry)
        return entry
      }
    } catch {
      // fall through to the generated cover
    }
  }
  return { body: placeholder(itemId), type: 'image/svg+xml' }
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)

function wrap(text: string, max: number, lines: number) {
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max && line) {
      out.push(line)
      line = w
    } else line = (line + ' ' + w).trim()
  }
  if (line) out.push(line)
  if (out.length > lines) {
    out.length = lines
    out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…'
  }
  return out
}

function placeholder(itemId: string) {
  const c = catalog()
  let title = 'Audiobook'
  let author = ''
  for (const b of c.books.values())
    if (b.itemId === itemId) {
      title = b.title
      author = b.authors[0] ?? ''
      break
    }
  const h = hash(title)
  const hue = h % 360
  const hue2 = (hue + 40 + (h % 80)) % 360
  const lines = wrap(title, 14, 4)
  const tspans = lines
    .map((l, i) => `<tspan x="28" dy="${i === 0 ? 0 : 38}">${esc(l)}</tspan>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 55% 34%)"/><stop offset="1" stop-color="hsl(${hue2} 60% 18%)"/>
  </linearGradient></defs>
  <rect width="300" height="300" fill="url(#g)"/>
  <circle cx="${220 + (h % 60)}" cy="${40 + (h % 50)}" r="${70 + (h % 40)}" fill="hsl(${hue2} 70% 70% / 0.12)"/>
  <text x="28" y="72" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700" fill="#fff">${tspans}</text>
  <text x="28" y="268" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="rgba(255,255,255,0.75)">${esc(author)}</text>
</svg>`
}
