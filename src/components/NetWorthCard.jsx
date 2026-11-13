import { formatBRL, formatDate } from '../utils/format.js'

export default function NetWorthCard({ nw, today }) {
  const rows = [
    ['Dinheiro na carteira', nw.cash, ''],
    ['Caixinhas de investimento', nw.potsTotal, ''],
    ['A receber de credores', nw.receivable, ''],
    ['Contas vencidas não pagas', -nw.overdue, nw.overdue ? 'neg' : ''],
  ]
  return (
    <section className="card span-2 networth">
      <p className="label">Patrimônio total · hoje, {formatDate(today)}</p>
      <p className={'num ' + (nw.total < 0 ? 'neg' : '')}>{formatBRL(nw.total)}</p>
      <ul className="nw-list">
        {rows.map(([name, v, c]) => (
          <li key={name}><span className="muted">{name}</span><span className={c}>{formatBRL(v)}</span></li>
        ))}
      </ul>
      <p className="muted small">Entradas contam quando a data chega; gastos, quando pagos. Faturas futuras e parcelas a vencer não são descontadas.</p>
    </section>
  )
}
