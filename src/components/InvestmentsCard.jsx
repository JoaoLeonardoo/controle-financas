import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { addMonth, currentMonth, formatBRL, formatDate, monthLabel, monthOfTs, parseMoney as num, shortMonth, todayISO } from '../utils/format.js'
import { BANKS, annualRate, monthlyRate, monthsToGoal } from '../utils/invest.js'
import { sum } from '../utils/recurrence.js'
import AmountEdit from './AmountEdit.jsx'
import Modal from './Modal.jsx'

const EMPTY = { name: '', bank: 'Nubank', rate_mode: 'cdi', rate: '100', balance: '', monthly: '', goal: '' }
const fromPot = (p) => ({
  name: p.name, bank: p.bank, rate_mode: p.rate_mode, rate: String(p.rate),
  balance: String(p.balance), monthly: String(p.monthly), goal: p.goal ? String(p.goal) : '',
})
const toRow = (f) => ({
  name: f.name.trim(), bank: f.bank, rate_mode: f.rate_mode, rate: num(f.rate),
  balance: num(f.balance), monthly: num(f.monthly), goal: num(f.goal) || null,
})

function PotFields({ form, setForm }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <>
      <label>Nome<input required maxLength={40} value={form.name} onChange={set('name')} placeholder="Reserva, Viagem…" /></label>
      <label>Banco
        <select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value, rate_mode: 'cdi', rate: String(BANKS[e.target.value] ?? 100) })}>
          {[...new Set([...Object.keys(BANKS), form.bank])].map((b) => <option key={b}>{b}</option>)}
        </select>
      </label>
      <label>Rendimento
        <select value={form.rate_mode} onChange={set('rate_mode')}>
          <option value="cdi">% do CDI</option>
          <option value="annual">% ao ano (fixo)</option>
        </select>
      </label>
      <label>{form.rate_mode === 'cdi' ? '% do CDI' : '% ao ano'}
        <input type="number" step="0.01" min="0" required value={form.rate} onChange={set('rate')} />
      </label>
      <label>Saldo inicial (R$)<input type="number" step="0.01" min="0" value={form.balance} onChange={set('balance')} /></label>
      <label>Aporte mensal (R$)<input type="number" step="0.01" min="0" value={form.monthly} onChange={set('monthly')} /></label>
      <label>Meta (R$, opcional)<input type="number" step="0.01" min="0" value={form.goal} onChange={set('goal')} /></label>
    </>
  )
}

export default function InvestmentsCard({ pots, deposits, month, onChanged, onError, onConfirmAporte, onUndoAporte }) {
  const [cdiText, setCdiText] = useState(() => { try { return localStorage.getItem('cdi') || '13.65' } catch { return '13.65' } })
  const cdi = num(cdiText) || 13.65
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  function changeCdi(v) {
    setCdiText(v)
    try { localStorage.setItem('cdi', v) } catch { /* ok */ }
  }

  async function create(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true); onError('')
    const { error } = await supabase.from('pots').insert(toRow(form))
    setBusy(false)
    if (error) return onError('Erro ao criar caixinha: ' + error.message)
    setForm(EMPTY); onChanged()
  }

  return (
    <section className="card cats">
      <div className="cats-head">
        <p className="label">Caixinhas de investimento</p>
        <label className="inline cdi">CDI atual (% ao ano)
          <input type="number" step="0.01" min="0" value={cdiText} onChange={(e) => changeCdi(e.target.value)} />
        </label>
      </div>

      <details className="pot-new">
        <summary className="btn">+ Nova caixinha</summary>
        <form className="pot-form" onSubmit={create}>
          <PotFields form={form} setForm={setForm} />
          <button className="btn primary" disabled={busy}>Criar caixinha</button>
        </form>
        <p className="muted small">Bancos costumam usar cerca de 100% do CDI, mas confira o percentual no app do seu banco. Com aporte mensal, o aporte aparece todo mês nos lançamentos, destacado, esperando você confirmar.</p>
      </details>

      {pots.length === 0 ? (
        <p className="muted empty">Crie uma caixinha para acompanhar rendimento e meta.</p>
      ) : (
        <div className="cats-grid">
          {pots.map((p) => (
            <PotTile key={p.id} pot={p} cdi={cdi} month={month} list={deposits.filter((d) => d.pot_id === p.id)}
              onChanged={onChanged} onError={onError} onConfirmAporte={onConfirmAporte} onUndoAporte={onUndoAporte} />
          ))}
        </div>
      )}
      <p className="muted small">Rendimento estimado (bruto, sem imposto), calculado sobre o saldo informado e os depósitos lançados.</p>
    </section>
  )
}

function PotTile({ pot, cdi, month, list, onChanged, onError, onConfirmAporte, onUndoAporte }) {
  const [amount, setAmount] = useState('')
  const [extra, setExtra] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => fromPot(pot))
  const [busy, setBusy] = useState(false)
  const bal = Math.round((Number(pot.balance) + sum(list)) * 100) / 100
  const annual = annualRate(pot, cdi)
  const perMonth = bal * monthlyRate(annual)
  const goal = pot.goal ? Number(pot.goal) : null
  const months = goal ? monthsToGoal(bal, Number(pot.monthly), goal, annual) : null
  const eta = months ? addMonth(currentMonth(), months) : null
  const aporte = list.find((d) => d.for_month === month)
  const hasAporte = Number(pot.monthly) > 0 && month >= monthOfTs(pot.created_at)
  const history = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || ''))

  async function deposit(e) {
    e.preventDefault()
    const v = num(amount)
    if (v <= 0) return
    const { error } = await supabase.from('pot_deposits').insert({ pot_id: pot.id, amount: v, extra, date: todayISO() })
    if (error) return onError('Erro ao depositar: ' + error.message)
    setAmount(''); setExtra(false); onChanged()
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true); onError('')
    const { error } = await supabase.from('pots').update(toRow(form)).eq('id', pot.id)
    setBusy(false)
    if (error) return onError('Erro ao salvar caixinha: ' + error.message)
    setEditing(false); onChanged()
  }

  async function remove() {
    if (!window.confirm(`Excluir a caixinha "${pot.name}" e o histórico de depósitos?`)) return
    const { error } = await supabase.from('pots').delete().eq('id', pot.id)
    if (error) onError('Erro ao excluir: ' + error.message)
    else onChanged()
  }

  async function editDeposit(d, v) {
    const { error } = await supabase.from('pot_deposits').update({ amount: v }).eq('id', d.id)
    if (error) return 'Erro: ' + error.message
    onChanged()
  }

  async function removeDeposit(d) {
    if (!window.confirm(`Excluir o depósito de ${formatBRL(d.amount)}? O saldo da caixinha diminui.`)) return
    const { error } = await supabase.from('pot_deposits').delete().eq('id', d.id)
    if (error) onError('Erro ao excluir depósito: ' + error.message)
    else onChanged()
  }

  return (
    <div className="cat-tile pot">
      <div className="pot-top">
        <div><strong>{pot.name}</strong> <span className="badge">{pot.bank}</span></div>
        <div>
          <button className="btn icon" aria-label={`Editar ${pot.name}`} title="Editar caixinha" onClick={() => { setForm(fromPot(pot)); setEditing(true) }}>✎</button>
          <button className="btn icon" aria-label={`Excluir ${pot.name}`} title="Excluir caixinha" onClick={remove}>×</button>
        </div>
      </div>
      <p className="num pos">{formatBRL(bal)}</p>
      <p className="muted small">
        Rende ~{formatBRL(perMonth)}/mês · {annual.toFixed(2).replace('.', ',')}% a.a.
        {pot.rate_mode === 'cdi' && ` (${Number(pot.rate)}% do CDI)`}
      </p>

      {hasAporte && (
        <div className={'aporte ' + (aporte ? 'done' : '')}>
          <span>
            <b>Aporte de {monthLabel(month)}</b>: {formatBRL(aporte ? aporte.amount : pot.monthly)}
            <span className="small"> {aporte ? '· feito ✓' : '· aguardando você'}</span>
          </span>
          {aporte
            ? <button className="btn small" onClick={() => onUndoAporte({ rid: aporte.id })}>Desfazer</button>
            : <button className="btn small invest" onClick={() => onConfirmAporte({ pot_id: pot.id, month })}>Coloquei ✓</button>}
        </div>
      )}

      {goal && (
        <>
          <div className="meter"><i style={{ width: Math.min(100, (bal / goal) * 100) + '%' }} /></div>
          <p className="small">
            Meta {formatBRL(goal)} ·{' '}
            {months === 0 ? 'meta atingida 🎉'
              : months === null ? 'defina um aporte mensal para chegar lá'
              : <>faltam {months} {months === 1 ? 'mês' : 'meses'} <span className="muted">({shortMonth(eta)}/{eta.slice(0, 4)}, aportando {formatBRL(pot.monthly)}/mês)</span></>}
          </p>
        </>
      )}
      <form className="dep" onSubmit={deposit}>
        <input type="number" step="0.01" min="0.01" placeholder="Depositar (R$)" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Valor do depósito" />
        <button className="btn primary" disabled={!num(amount)}>Depositar</button>
        <label className="check"><input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} /> Depósito extra</label>
      </form>
      {list.some((d) => d.extra) && <p className="muted small">Extras já depositados: {formatBRL(sum(list.filter((d) => d.extra)))}</p>}

      {history.length > 0 && (
        <details className="dep-history">
          <summary className="small muted">Histórico de depósitos ({history.length})</summary>
          <ul>
            {history.map((d) => (
              <li key={d.id}>
                <span>{formatDate(d.date)} <span className="muted small">{d.for_month ? `aporte ${shortMonth(d.for_month)}/${d.for_month.slice(0, 4)}` : d.extra ? 'extra' : ''}</span></span>
                <span className="row-end">
                  {formatBRL(d.amount)}
                  <AmountEdit value={d.amount} onSave={(v) => editDeposit(d, v)} />
                  <button className="btn icon" aria-label="Excluir depósito" onClick={() => removeDeposit(d)}>×</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <Modal title={`Editar ${pot.name}`} onClose={() => setEditing(false)}>
          <form className="pot-form single" onSubmit={saveEdit}>
            <PotFields form={form} setForm={setForm} />
            <p className="muted small full">O saldo inicial é o que a caixinha já tinha antes dos depósitos lançados aqui. Os depósitos você corrige no histórico.</p>
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
