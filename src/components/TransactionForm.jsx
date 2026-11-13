import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { todayISO } from '../utils/format.js'

const KINDS = {
  expense: [['fixed', 'Fixo'], ['extraordinary', 'Extraordinário']],
  income: [['fixed', 'Renda fixa'], ['variable', 'Renda variável']],
}

// initial = lançamento existente (modo edição). Em lançamento fixo, a alteração vale para todos os meses.
export default function TransactionForm({ type, onSaved, onCancel, initial, categories = [] }) {
  const isExpense = type === 'expense'
  const editing = !!initial
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [kind, setKind] = useState(initial?.kind ?? 'fixed')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const [autoPay, setAutoPay] = useState(!!initial?.auto_pay)
  const [forever, setForever] = useState(!initial?.months)
  const [months, setMonths] = useState(initial?.months ?? 12)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const value = Number(String(amount).replace(',', '.'))
    const n = Math.floor(Number(months))
    if (!description.trim()) return setError('Informe uma descrição.')
    if (!Number.isFinite(value) || value <= 0) return setError('Informe um valor maior que zero.')
    if (kind === 'fixed' && !forever && !(n >= 1 && n <= 600)) return setError('Duração: de 1 a 600 meses.')

    setBusy(true)
    const row = {
      kind,
      description: description.trim(),
      amount: value,
      date,
      auto_pay: isExpense && autoPay,
      category_id: isExpense && categoryId ? categoryId : null,
      months: kind === 'fixed' && !forever ? n : null,
    }
    const { error } = editing
      ? await supabase.from('transactions').update(row).eq('id', initial.id)
      : await supabase.from('transactions').insert({ type, ...row })
    setBusy(false)
    if (error) return setError('Não foi possível salvar: ' + error.message)
    if (!editing) { setDescription(''); setAmount('') }
    onSaved?.()
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="seg span-2" role="radiogroup">
        {KINDS[type].map(([v, label]) => (
          <button type="button" key={v} role="radio" aria-checked={kind === v}
            className={kind === v ? 'on' : ''} onClick={() => setKind(v)}>{label}</button>
        ))}
      </div>

      <label className="span-2">
        Descrição
        <input type="text" maxLength={120} required value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isExpense ? 'Aluguel, parcela do celular…' : 'Salário, freela…'} />
      </label>

      <label>
        Valor (R$)
        <input type="number" step="0.01" min="0.01" required inputMode="decimal"
          value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>

      <label>
        {kind === 'fixed' ? 'Começa em' : 'Data'}
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {isExpense && (
        <label className="span-2">
          Categoria
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      {isExpense && (
        <label className="span-2 check">
          <input type="checkbox" checked={autoPay} onChange={(e) => setAutoPay(e.target.checked)} />
          Marcar como pago automaticamente no vencimento
        </label>
      )}

      {kind === 'fixed' && (
        <div className="span-2 duration">
          <div className="seg">
            <button type="button" className={forever ? 'on' : ''} onClick={() => setForever(true)}>Para sempre</button>
            <button type="button" className={!forever ? 'on' : ''} onClick={() => setForever(false)}>Por tempo definido</button>
          </div>
          {!forever && (
            <label className="inline">
              <input type="number" min="1" max="600" value={months} onChange={(e) => setMonths(e.target.value)} />
              meses
            </label>
          )}
        </div>
      )}

      {editing && kind === 'fixed' && <p className="muted small span-2">Lançamento fixo: a alteração vale para todos os meses dele.</p>}
      {error && <p className="msg error span-2">{error}</p>}

      <button className={'btn ' + (editing ? 'primary' : 'span-2 ' + (isExpense ? 'danger' : 'success'))} disabled={busy}>
        {busy ? 'Salvando…' : editing ? 'Salvar alterações' : isExpense ? 'Adicionar gasto' : 'Adicionar entrada'}
      </button>
      {editing && <button type="button" className="btn" onClick={onCancel}>Cancelar</button>}
    </form>
  )
}
