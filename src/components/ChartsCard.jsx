import { useMemo, useRef, useState } from 'react'
import { addMonth, formatBRL, monthLabel, shortMonth } from '../utils/format.js'
import { buildItems } from '../utils/ledger.js'

const TYPES = [
  ['donut', 'Rosca'], ['pie', 'Pizza'], ['bar', 'Barras'], ['hbar', 'Barras horizontais'],
  ['line', 'Linhas (evolução)'], ['stack', 'Barras empilhadas (por mês)'],
]
const PERIODS = [[1, 'Só este mês'], [3, 'Últimos 3 meses'], [6, 'Últimos 6 meses'], [12, 'Últimos 12 meses']]
const SLOTS = 8 // 8 cores fixas; da 9ª categoria em diante entram em "Outras"
const OTHER = 'other'
const DEFAULTS = { type: 'donut', n: 1, off: [], table: false }
const KEY = 'chartCfg'

const compact = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v)))
const niceMax = (v) => {
  if (v <= 0) return 1
  const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e
}
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const roundTop = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}
function arc(cx, cy, r, r0, a0, a1) {
  a1 = a0 + Math.min(a1 - a0, Math.PI * 2 - 0.001)
  const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(r, a0), [x1, y1] = p(r, a1)
  if (!r0) return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`
  const [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0)
  return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`
}
const color = (s) => `var(--viz-${s.slot})`

export default function ChartsCard({ ctx, categories, month }) {
  const [cfg, setCfg] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return DEFAULTS }
  })
  const [tip, setTip] = useState(null)
  const wrap = useRef(null)
  const update = (patch) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ok */ }
  }

  // cor fixa por categoria (pela ordem de criação), assim filtrar não repinta as outras
  const ordered = useMemo(() => [...categories].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.name.localeCompare(b.name)), [categories])
  const months = useMemo(() => Array.from({ length: cfg.n }, (_, i) => addMonth(month, i - (cfg.n - 1))), [month, cfg.n])

  const { series, total } = useMemo(() => {
    const slotOf = new Map(ordered.slice(0, SLOTS).map((c, i) => [c.id, i + 1]))
    const known = new Set(categories.map((c) => c.id))
    const map = new Map()
    const add = (key, name, slot, mi, amount) => {
      if (!map.has(key)) map.set(key, { key, name, slot, values: Array(months.length).fill(0) })
      map.get(key).values[mi] += amount
    }
    months.forEach((m, mi) => {
      const expenses = buildItems(m, ctx).flatMap((t) => (t.parts ? t.parts.map((p) => ({ ...p, type: 'expense', kind: 'card' })) : [t]))
        .filter((t) => t.type === 'expense' && t.kind !== 'invest')
      for (const t of expenses) {
        const id = t.category_id && known.has(t.category_id) ? t.category_id : 'none'
        if (cfg.off.includes(id)) continue
        const amount = Number(t.amount)
        if (slotOf.has(id)) add(id, ordered.find((c) => c.id === id).name, slotOf.get(id), mi, amount)
        else add(OTHER, 'Outras / sem categoria', 0, mi, amount)
      }
    })
    const list = [...map.values()].filter((s) => s.values.some((v) => v > 0))
      .map((s) => ({ ...s, values: s.values.map((v) => Math.round(v * 100) / 100), sum: Math.round(s.values.reduce((a, b) => a + b, 0) * 100) / 100 }))
      .sort((a, b) => (a.slot || 99) - (b.slot || 99))
    return { series: list, total: list.reduce((a, s) => a + s.sum, 0) }
  }, [ctx, categories, ordered, months, cfg.off])

  const show = (text) => ({
    onMouseMove: (e) => {
      const r = wrap.current.getBoundingClientRect()
      setTip({ text, x: e.clientX - r.left, y: e.clientY - r.top })
    },
    onMouseLeave: () => setTip(null),
  })

  const chips = [...ordered.map((c) => [c.id, c.name]), ['none', 'Sem categoria']]
  const needsMonths = (cfg.type === 'line' || cfg.type === 'stack') && months.length < 2
  const label = (m) => `${shortMonth(m)}/${m.slice(2, 4)}`
  const periodText = months.length === 1 ? monthLabel(months[0]) : `${monthLabel(months[0])} a ${monthLabel(months[months.length - 1])}`

  return (
    <section className="card cats charts">
      <div className="cats-head">
        <p className="label">Gráficos dos gastos por categoria</p>
        <label className="check"><input type="checkbox" checked={cfg.table} onChange={(e) => update({ table: e.target.checked })} />Ver como tabela</label>
      </div>

      <div className="chart-controls">
        <label>Tipo de gráfico
          <select value={cfg.type} onChange={(e) => update({ type: e.target.value })}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Período (termina no mês selecionado)
          <select value={cfg.n} onChange={(e) => update({ n: Number(e.target.value) })}>
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="chips" role="group" aria-label="Categorias no gráfico">
        {chips.map(([id, name]) => {
          const on = !cfg.off.includes(id)
          const idx = ordered.findIndex((c) => c.id === id)
          return (
            <button key={id} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on}
              onClick={() => update({ off: on ? [...cfg.off, id] : cfg.off.filter((x) => x !== id) })}>
              <i style={{ background: idx >= 0 && idx < SLOTS ? `var(--viz-${idx + 1})` : 'var(--viz-0)' }} />{name}
            </button>
          )
        })}
      </div>

      <p className="muted small">{periodText} · total {formatBRL(total)}. Cartão entra pelas compras de cada fatura; aportes não contam como gasto.</p>

      {categories.length === 0 && <p className="muted small">Crie categorias em "Gastos por categoria" e use-as nos gastos e compras para ver gráficos por categoria.</p>}

      {series.length === 0 ? (
        <p className="muted empty">Nenhum gasto nas categorias escolhidas neste período.</p>
      ) : needsMonths ? (
        <p className="muted empty">Este gráfico mostra a evolução mês a mês: escolha 3, 6 ou 12 meses no período.</p>
      ) : cfg.table ? (
        <Table series={series} months={months} label={label} />
      ) : (
        <div className="chart-wrap" ref={wrap}>
          {cfg.type === 'pie' || cfg.type === 'donut' ? <Pie series={series} total={total} donut={cfg.type === 'donut'} show={show} />
            : cfg.type === 'bar' ? <Bars series={series} show={show} />
            : cfg.type === 'hbar' ? <HBars series={series} show={show} />
            : cfg.type === 'line' ? <Lines series={series} months={months} label={label} show={show} />
            : <Stack series={series} months={months} label={label} show={show} />}
          {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
          <Legend series={series} total={total} />
        </div>
      )}
    </section>
  )
}

function Legend({ series, total }) {
  if (series.length < 2) return null
  return (
    <ul className="legend">
      {series.map((s) => (
        <li key={s.key}><i style={{ background: color(s) }} /><span>{s.name}</span>
          <b>{formatBRL(s.sum)}</b><span className="muted small">{total ? Math.round((s.sum / total) * 100) : 0}%</span></li>
      ))}
    </ul>
  )
}

function Pie({ series, total, donut, show }) {
  let a = -Math.PI / 2
  const R = 100, r0 = donut ? 62 : 0
  return (
    <svg viewBox="0 0 240 240" className="chart pie" role="img" aria-label="Gráfico de gastos por categoria">
      {series.map((s) => {
        const span = (s.sum / total) * Math.PI * 2
        const d = arc(120, 120, R, r0, a, a + span); a += span
        return <path key={s.key} d={d} fill={color(s)} stroke="var(--bg)" strokeWidth="2" {...show(`${s.name}: ${formatBRL(s.sum)} (${Math.round((s.sum / total) * 100)}%)`)} />
      })}
      {donut && (
        <g textAnchor="middle" fill="var(--ink)">
          <text x="120" y="116" fontSize="11" fill="var(--muted)">Total</text>
          <text x="120" y="136" fontSize="16" fontWeight="600">{formatBRL(total)}</text>
        </g>
      )}
    </svg>
  )
}

function Axis({ W, H, pad, max, ticks = 4 }) {
  return Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (max / ticks) * i, y = H - pad.b - ((H - pad.t - pad.b) * i) / ticks
    return (
      <g key={i}>
        <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="var(--grid)" strokeWidth="1" />
        <text x={pad.l - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{compact(v)}</text>
      </g>
    )
  })
}

function Bars({ series, show }) {
  const W = 640, H = 300, pad = { l: 52, r: 12, t: 22, b: 44 }
  const max = niceMax(Math.max(...series.map((s) => s.sum)))
  const band = (W - pad.l - pad.r) / series.length, bw = Math.min(56, band * 0.62)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfico de barras por categoria">
      <Axis W={W} H={H} pad={pad} max={max} />
      {series.map((s, i) => {
        const h = Math.max(2, ((H - pad.t - pad.b) * s.sum) / max), x = pad.l + band * i + (band - bw) / 2, y = H - pad.b - h
        return (
          <g key={s.key} {...show(`${s.name}: ${formatBRL(s.sum)}`)}>
            <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
            <path d={roundTop(x, y, bw, h, 4)} fill={color(s)} />
            <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="11" fill="var(--ink)">{compact(s.sum)}</text>
            <text x={x + bw / 2} y={H - pad.b + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">{trunc(s.name, Math.max(6, Math.floor(band / 7)))}</text>
          </g>
        )
      })}
    </svg>
  )
}

function HBars({ series, show }) {
  const max = Math.max(...series.map((s) => s.sum))
  return (
    <div className="hbars chart-h">
      {series.map((s) => (
        <div key={s.key} className="hbar" {...show(`${s.name}: ${formatBRL(s.sum)}`)}>
          <span className="small">{s.name}</span>
          <div className="rail"><i style={{ width: (s.sum / max) * 100 + '%', background: color(s) }} /></div>
          <span className="small">{formatBRL(s.sum)}</span>
        </div>
      ))}
    </div>
  )
}

function Lines({ series, months, label, show }) {
  const W = 640, H = 300, pad = { l: 52, r: 16, t: 20, b: 36 }
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)))
  const X = (i) => pad.l + ((W - pad.l - pad.r) * i) / (months.length - 1)
  const Y = (v) => H - pad.b - ((H - pad.t - pad.b) * v) / max
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfico de linhas: gasto por categoria mês a mês">
      <Axis W={W} H={H} pad={pad} max={max} />
      {months.map((m, i) => <text key={m} x={X(i)} y={H - pad.b + 20} textAnchor="middle" fontSize="11" fill="var(--muted)">{label(m)}</text>)}
      {series.map((s) => (
        <g key={s.key}>
          <polyline points={s.values.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} fill="none" stroke={color(s)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {s.values.map((v, i) => (
            <g key={i} {...show(`${s.name} · ${label(months[i])}: ${formatBRL(v)}`)}>
              <circle cx={X(i)} cy={Y(v)} r="11" fill="transparent" />
              <circle cx={X(i)} cy={Y(v)} r="4" fill={color(s)} stroke="var(--bg)" strokeWidth="2" />
            </g>
          ))}
        </g>
      ))}
    </svg>
  )
}

function Stack({ series, months, label, show }) {
  const W = 640, H = 300, pad = { l: 52, r: 12, t: 22, b: 36 }
  const totals = months.map((_, i) => series.reduce((a, s) => a + s.values[i], 0))
  const max = niceMax(Math.max(...totals))
  const band = (W - pad.l - pad.r) / months.length, bw = Math.min(56, band * 0.62)
  const ph = H - pad.t - pad.b
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Barras empilhadas: gasto por categoria em cada mês">
      <Axis W={W} H={H} pad={pad} max={max} />
      {months.map((m, i) => {
        let y = H - pad.b
        const x = pad.l + band * i + (band - bw) / 2
        return (
          <g key={m}>
            {series.map((s) => {
              const v = s.values[i]; if (v <= 0) return null
              const h = (ph * v) / max; y -= h
              return <rect key={s.key} x={x} y={y} width={bw} height={Math.max(1, h)} fill={color(s)} stroke="var(--bg)" strokeWidth="2"
                {...show(`${s.name} · ${label(m)}: ${formatBRL(v)}`)} />
            })}
            <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="11" fill="var(--ink)">{totals[i] > 0 ? compact(totals[i]) : ''}</text>
            <text x={x + bw / 2} y={H - pad.b + 20} textAnchor="middle" fontSize="11" fill="var(--muted)">{label(m)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Table({ series, months, label }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Categoria</th>{months.map((m) => <th key={m}>{label(m)}</th>)}{months.length > 1 && <th>Total</th>}</tr></thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.key}>
              <td><i className="sw" style={{ background: color(s) }} />{s.name}</td>
              {s.values.map((v, i) => <td key={i}>{formatBRL(v)}</td>)}
              {months.length > 1 && <td><b>{formatBRL(s.sum)}</b></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
