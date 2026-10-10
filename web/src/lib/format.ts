const nf = new Intl.NumberFormat('en-US')
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const num = (n: number) => nf.format(Math.round(n))
export const num1 = (n: number) => nf1.format(n)
export const compactNum = (n: number) => compact.format(n)

/** 1,234 hours style headline number */
export const hours = (sec: number) => {
  const h = sec / 3600
  return h >= 100 ? num(h) : h >= 10 ? num1(Math.round(h * 10) / 10) : num1(Math.round(h * 10) / 10)
}

/** "3h 25m", "42m", "35s" */
export function duration(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (h >= 100) return `${num(h)}h`
  return m === 60 ? `${h + 1}h` : m ? `${h}h ${m}m` : `${h}h`
}

export const pct = (x: number) => `${Math.round(x * 100)}%`

export const speed = (x: number | null) => (x == null ? '—' : `${x.toFixed(2).replace(/0$/, '')}×`)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1]
export const monthLong = (ym: string) => MONTHS_LONG[Number(ym.slice(5, 7)) - 1]

/** "Mar 4" or "Mar 4, 2025" */
export function date(d: string, withYear = false) {
  const [y, m, day] = d.split('-').map(Number)
  return `${MONTHS[m - 1]} ${day}${withYear ? `, ${y}` : ''}`
}

export function weekdayOf(d: string) {
  const w = new Date(d + 'T12:00:00Z').getUTCDay()
  return WEEKDAYS[(w + 6) % 7]
}

export const hourLabel = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`)

export const plural = (n: number, one: string, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`

export const authors = (a: string[]) => (a.length === 0 ? 'Unknown author' : a.length <= 2 ? a.join(' & ') : `${a[0]} et al.`)

export function delta(cur: number, prev: number | undefined | null) {
  if (prev == null || prev === 0) return null
  return (cur - prev) / prev
}
