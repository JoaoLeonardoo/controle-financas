const pad = (n) => String(n).padStart(2, '0')

export function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function todayISO() {
  const d = new Date()
  return `${currentMonth()}-${pad(d.getDate())}`
}

// "2026-11" -> { start: "2026-11-01", end: "2026-12-01" } (fim exclusivo)
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return { start: `${y}-${pad(m)}-01`, end: `${ny}-${pad(nm)}-01` }
}

export function formatBRL(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// "2026-11-11" -> "11/11/2026" (sem new Date, evitando problemas de fuso horário)
export function formatDate(iso) {
  return iso.split('-').reverse().join('/')
}

export function addMonth(month, n) {
  const [y, m] = month.split('-').map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
}

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function shortMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

// "2026-11" + dia 31 -> "2026-11-30" (limita ao último dia do mês)
export function dayInMonth(month, day) {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad(Math.min(day, new Date(y, m, 0).getDate()))}`
}

// timestamp do banco (timestamptz) -> "YYYY-MM" no fuso local
export function monthOfTs(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

// aceita "12,50" ou "12.50"
export const parseMoney = (v) => Number(String(v).replace(',', '.')) || 0
