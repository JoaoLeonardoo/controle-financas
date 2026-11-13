import { useState } from 'react'
import { formatBRL, formatDate, parseMoney, todayISO } from '../utils/format.js'
import Modal from './Modal.jsx'

// Pagar uma conta ou fatura, inclusive antes do vencimento e com desconto.
// item.original (se existir) é o valor cheio; item.amount é o valor pago/atual.
export default function PayModal({ item, onClose, onConfirm }) {
  const full = Number(item.original ?? item.amount)
  const [paid, setPaid] = useState(String(item.paid ? item.amount : full))
  const [date, setDate] = useState(item.paidOn || todayISO())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const v = parseMoney(paid)
  const diff = Math.round((full - v) * 100) / 100
  const pct = full > 0 ? Math.abs(diff / full) * 100 : 0
  const early = date < item.date

  async function submit(e) {
    e.preventDefault()
    if (!(v > 0)) return setErr('Informe o valor pago (maior que zero).')
    setBusy(true); setErr('')
    const msg = await onConfirm({ amount: v, full, date })
    setBusy(false)
    if (msg) setErr(msg); else onClose()
  }

  return (
    <Modal title={item.paid ? 'Alterar pagamento' : 'Pagar'} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="span-2">
          <strong>{item.description}</strong>
          <p className="muted small">Vence em {formatDate(item.date)} · valor cheio {formatBRL(full)}</p>
        </div>
        <label>Valor que paguei (R$)
          <input type="number" step="0.01" min="0.01" required autoFocus value={paid} onChange={(e) => setPaid(e.target.value)} />
        </label>
        <label>Pago em
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <p className="span-2 small">
          {Math.abs(diff) < 0.005 ? <span className="muted">Valor cheio, sem desconto.</span>
            : diff > 0 ? <b className="pos">Desconto de {formatBRL(diff)} ({pct.toFixed(1).replace('.', ',')}%)</b>
            : <b className="neg">Acréscimo de {formatBRL(-diff)} (juros/multa)</b>}
          {early && <span className="muted"> · pagamento antecipado</span>}
        </p>
        {err && <p className="msg error span-2">{err}</p>}
        <button className="btn success" disabled={busy}>{busy ? 'Salvando…' : item.paid ? 'Salvar pagamento' : 'Confirmar pagamento'}</button>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      </form>
    </Modal>
  )
}
