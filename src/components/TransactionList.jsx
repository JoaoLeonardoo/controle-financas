import { formatBRL, formatDate } from '../utils/format.js'
import AmountEdit from './AmountEdit.jsx'

const LABEL = {
  'expense-fixed': 'Gasto fixo',
  'expense-extraordinary': 'Extraordinário',
  'expense-card': 'Cartão de crédito',
  'expense-invest': 'Investimento',
  'income-fixed': 'Renda fixa',
  'income-variable': 'Renda variável',
}

// actions: onEdit(x), onDelete(x), onTogglePaid(x), onEditAmount(x, valor), onConfirmAporte(x), onUndoAporte(x)
export default function TransactionList({ items, actions }) {
  if (items.length === 0) {
    return <p className="muted empty">Nada por aqui neste mês. Adicione um gasto ou uma entrada.</p>
  }
  return (
    <ul className="tx-list">
      {items.map((t) => {
        const invest = t.kind === 'invest'
        const label = t.source === 'carry' ? 'Sobra do mês anterior' : t.source === 'receipt' ? 'Recebimento de credor' : LABEL[`${t.type}-${t.kind}`]
        return (
          <li key={t.id + t.date} className={'tx' + (invest ? ' invest' : '') + (t.pending ? ' pending-invest' : '')}>
            <Lead t={t} a={actions} />
            <div className="tx-main">
              <strong>{t.description}</strong>
              <span className="muted">
                {formatDate(t.date)} · {label}{t.categoryName ? ` · ${t.categoryName}` : ''}
                {t.kind === 'fixed' && (t.of ? ` · parcela ${t.n}/${t.of}` : ' · todo mês')}
                {t.type === 'expense' && !invest && (t.paid ? (t.autoOnly ? ' · pago (auto)' : ' · pago') : '')}
                {t.early && ' antecipado'}
                {t.discount > 0 && <b className="pos"> · desconto de {formatBRL(t.discount)} (valor cheio {formatBRL(t.original)})</b>}
                {t.discount < 0 && <b className="neg"> · acréscimo de {formatBRL(-t.discount)}</b>}
                {invest && (t.pending ? <b className="inv-wait"> · aguardando você confirmar</b> : t.planned ? ' · aporte feito' : ' · depositado')}
                {t.late && <b className="late"> · em atraso</b>}
              </span>
            </div>
            <span className={'amount ' + (t.type === 'income' ? 'pos' : invest ? 'inv' : 'neg') + (t.type === 'expense' && !t.paid ? ' pending' : '')}>
              {t.type === 'income' ? '+' : '−'}{formatBRL(t.amount)}
            </span>
            <span className="tx-actions"><Actions t={t} a={actions} /></span>
          </li>
        )
      })}
    </ul>
  )
}

function Lead({ t, a }) {
  if (t.type === 'income') return <span className="dot in" aria-hidden />
  if (t.source === 'aporte') {
    return <button className="paybtn inv" onClick={() => a.onConfirmAporte(t)} aria-label="Confirmar que fiz o aporte" title="Já coloquei? Clique para confirmar e lançar na caixinha" />
  }
  if (t.source === 'deposit') {
    return <button className="paybtn on inv" disabled={!t.planned} onClick={() => a.onUndoAporte(t)} aria-label="Aporte feito"
      title={t.planned ? 'Aporte feito (clique para desfazer)' : 'Depósito feito'}>✓</button>
  }
  return (
    <button className={'paybtn ' + (t.paid ? 'on' : '')} onClick={() => a.onTogglePaid(t)} disabled={t.autoOnly}
      aria-pressed={t.paid} aria-label={t.paid ? 'Marcar como não paga' : 'Marcar como paga'}
      title={t.autoOnly ? 'Pago automaticamente no vencimento' : t.paid ? 'Paga (clique para desfazer)' : 'Marcar como paga'}>
      {t.paid ? '✓' : ''}
    </button>
  )
}

function Actions({ t, a }) {
  const del = (title) => <button className="btn icon" title={title} aria-label={`${title} ${t.description}`} onClick={() => a.onDelete(t)}>×</button>
  const pay = (t.source === 'tx' || t.source === 'invoice') && t.type === 'expense' && !t.autoOnly
    ? <button className="btn small" onClick={() => a.onPay(t)} title="Pagar antes do vencimento ou com desconto">{t.paid ? 'Pagamento' : 'Pagar…'}</button> : null
  if (t.source === 'tx') {
    return <>
      {pay}
      <button className="btn icon" title="Editar" aria-label={`Editar ${t.description}`} onClick={() => a.onEdit(t)}>✎</button>
      {del('Excluir')}
    </>
  }
  if (t.source === 'receipt' || t.source === 'deposit') {
    return <><AmountEdit value={t.amount} onSave={(v) => a.onEditAmount(t, v)} />{del('Excluir')}</>
  }
  if (t.source === 'carry') {
    return <><AmountEdit value={t.amount} allowZero onSave={(v) => a.onEditAmount(t, v)} />{del('Remover')}</>
  }
  if (t.source === 'aporte') return <button className="btn small invest" onClick={() => a.onConfirmAporte(t)}>Coloquei ✓</button>
  return pay // fatura: edite as compras no card do cartão
}
