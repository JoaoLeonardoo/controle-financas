import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { formatBRL, formatDate, parseMoney as num, todayISO } from '../utils/format.js'
import { receivedOf, remainingOf } from '../utils/ledger.js'
import AmountEdit from './AmountEdit.jsx'
import Modal from './Modal.jsx'

const EMPTY = { person: '', description: '', amount: '', due_date: '' }
const fromRow = (r) => ({ person: r.person, description: r.description || '', amount: String(r.amount), due_date: r.due_date || '' })

function Fields({ form, setForm }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <>
      <label>Quem me deve<input required maxLength={60} value={form.person} onChange={set('person')} placeholder="Nome da pessoa" /></label>
      <label>Motivo (opcional)<input maxLength={120} value={form.description} onChange={set('description')} placeholder="Empréstimo, jantar…" /></label>
      <label>Valor total (R$)<input required type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} /></label>
      <label>Previsão de pagamento<input type="date" value={form.due_date} onChange={set('due_date')} /></label>
    </>
  )
}

const toRow = (f) => ({ person: f.person.trim(), description: f.description.trim(), amount: num(f.amount), due_date: f.due_date || null })

export default function CreditorsCard({ receivables, receipts, onChanged, onError }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const today = todayISO()

  const rows = receivables.map((r) => ({ r, got: receivedOf(r, receipts), left: remainingOf(r, receipts) }))
  const open = rows.filter((x) => x.left > 0)
  const done = rows.filter((x) => x.left <= 0)
  const total = open.reduce((s, x) => s + Math.round(x.left * 100), 0) / 100

  async function create(e) {
    e.preventDefault()
    if (!form.person.trim() || num(form.amount) <= 0) return
    setBusy(true); onError('')
    const { error } = await supabase.from('receivables').insert(toRow(form))
    setBusy(false)
    if (error) return onError('Erro ao salvar: ' + error.message)
    setForm(EMPTY); onChanged()
  }

  return (
    <section className="card cats">
      <div className="cats-head">
        <p className="label">Credores · quem me deve</p>
        <p className="small">A receber: <strong className="pos">{formatBRL(total)}</strong></p>
      </div>

      <details className="pot-new">
        <summary className="btn">+ Nova dívida a receber</summary>
        <form className="pot-form" onSubmit={create}>
          <Fields form={form} setForm={setForm} />
          <button className="btn primary" disabled={busy}>Salvar</button>
        </form>
        <p className="muted small">O que falta receber entra no seu patrimônio. Quando a pessoa pagar, clique em "Recebi": o valor entra como entrada no mês.</p>
      </details>

      {receivables.length === 0 && <p className="muted empty">Ninguém te deve por aqui. Cadastre quem te deve dinheiro.</p>}
      {open.length > 0 && (
        <div className="cats-grid">
          {open.map((x) => <Tile key={x.r.id} {...x} receipts={receipts} today={today} onChanged={onChanged} onError={onError} />)}
        </div>
      )}
      {done.length > 0 && (
        <details>
          <summary className="small muted">Quitados ({done.length})</summary>
          <div className="cats-grid done-grid">
            {done.map((x) => <Tile key={x.r.id} {...x} receipts={receipts} today={today} onChanged={onChanged} onError={onError} />)}
          </div>
        </details>
      )}
    </section>
  )
}

function Tile({ r, got, left, receipts, today, onChanged, onError }) {
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => fromRow(r))
  const [busy, setBusy] = useState(false)
  const mine = receipts.filter((x) => x.receivable_id === r.id).sort((a, b) => b.date.localeCompare(a.date))
  const late = left > 0 && r.due_date && r.due_date < today

  async function receive(e) {
    e.preventDefault()
    const v = num(amount) || left
    if (v <= 0) return
    if (v > left + 0.001) return onError(`Você só tem ${formatBRL(left)} a receber de ${r.person}.`)
    onError('')
    const { error } = await supabase.from('receipts').insert({ receivable_id: r.id, amount: v, date: todayISO() })
    if (error) return onError('Erro ao registrar recebimento: ' + error.message)
    setAmount(''); onChanged()
  }

  async function saveEdit(e) {
    e.preventDefault()
    const row = toRow(form)
    if (!row.person || row.amount <= 0) return
    if (row.amount + 0.001 < got) return onError(`Já foram recebidos ${formatBRL(got)}: o total não pode ser menor que isso.`)
    setBusy(true); onError('')
    const { error } = await supabase.from('receivables').update(row).eq('id', r.id)
    setBusy(false)
    if (error) return onError('Erro ao salvar: ' + error.message)
    setEditing(false); onChanged()
  }

  async function remove() {
    if (!window.confirm(`Excluir a dívida de "${r.person}" e o histórico de recebimentos? As entradas que ela gerou nos meses também somem.`)) return
    const { error } = await supabase.from('receivables').delete().eq('id', r.id)
    if (error) onError('Erro ao excluir: ' + error.message)
    else onChanged()
  }

  async function editReceipt(rc, v) {
    if (v > remainingOf(r, receipts) + Number(rc.amount) + 0.001) return 'Passa do total da dívida.'
    const { error } = await supabase.from('receipts').update({ amount: v }).eq('id', rc.id)
    if (error) return 'Erro: ' + error.message
    onChanged()
  }

  async function removeReceipt(rc) {
    if (!window.confirm(`Desfazer o recebimento de ${formatBRL(rc.amount)}?`)) return
    const { error } = await supabase.from('receipts').delete().eq('id', rc.id)
    if (error) onError('Erro: ' + error.message)
    else onChanged()
  }

  return (
    <div className="cat-tile pot">
      <div className="pot-top">
        <div><strong>{r.person}</strong>{r.description && <span className="muted small"> · {r.description}</span>}</div>
        <div>
          <button className="btn icon" aria-label={`Editar ${r.person}`} title="Editar" onClick={() => { setForm(fromRow(r)); setEditing(true) }}>✎</button>
          <button className="btn icon" aria-label={`Excluir ${r.person}`} title="Excluir" onClick={remove}>×</button>
        </div>
      </div>
      <p className={'num ' + (left > 0 ? 'pos' : 'muted')}>{left > 0 ? formatBRL(left) : 'Quitado ✓'}</p>
      <p className="muted small">
        Total {formatBRL(r.amount)} · recebido {formatBRL(got)}
        {r.due_date && <> · previsão {formatDate(r.due_date)}</>}
        {late && <b className="late"> · atrasado</b>}
      </p>
      <div className="meter"><i style={{ width: Math.min(100, (got / Number(r.amount)) * 100) + '%' }} /></div>
      {left > 0 && (
        <form className="dep" onSubmit={receive}>
          <input type="number" step="0.01" min="0.01" placeholder={`Recebi (${formatBRL(left)})`} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Valor recebido" />
          <button className="btn success">Recebi</button>
        </form>
      )}
      {mine.length > 0 && (
        <details className="dep-history">
          <summary className="small muted">Recebimentos ({mine.length})</summary>
          <ul>
            {mine.map((rc) => (
              <li key={rc.id}>
                <span>{formatDate(rc.date)}</span>
                <span className="row-end">
                  {formatBRL(rc.amount)}
                  <AmountEdit value={rc.amount} onSave={(v) => editReceipt(rc, v)} />
                  <button className="btn icon" aria-label="Desfazer recebimento" onClick={() => removeReceipt(rc)}>×</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {editing && (
        <Modal title={`Editar dívida de ${r.person}`} onClose={() => setEditing(false)}>
          <form className="pot-form single" onSubmit={saveEdit}>
            <Fields form={form} setForm={setForm} />
            <div className="row-end full">
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button>
              <button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
