import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { formatBRL, formatDate, monthLabel, parseMoney as num, todayISO } from '../utils/format.js'
import { invoiceDue } from '../utils/cards.js'
import Modal from './Modal.jsx'

const EMPTY_CARD = { name: '', closing_day: '', due_day: '', credit_limit: '', auto_pay: false }
const cardFrom = (c) => ({ name: c.name, closing_day: String(c.closing_day), due_day: String(c.due_day), credit_limit: c.credit_limit ? String(c.credit_limit) : '', auto_pay: !!c.auto_pay })

function CardFields({ form, setForm }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <>
      <label>Nome do cartão<input required maxLength={40} value={form.name} onChange={set('name')} placeholder="Nubank, Itaú…" /></label>
      <label>Dia do fechamento<input required type="number" min="1" max="31" value={form.closing_day} onChange={set('closing_day')} /></label>
      <label>Dia do vencimento<input required type="number" min="1" max="31" value={form.due_day} onChange={set('due_day')} /></label>
      <label>Limite (R$, opcional)<input type="number" step="0.01" min="0" value={form.credit_limit} onChange={set('credit_limit')} /></label>
      <label className="check full"><input type="checkbox" checked={form.auto_pay} onChange={(e) => setForm({ ...form, auto_pay: e.target.checked })} />Fatura paga automaticamente no vencimento</label>
    </>
  )
}

function cardRow(f) {
  const c = Math.floor(num(f.closing_day)), d = Math.floor(num(f.due_day))
  if (!f.name.trim()) return 'Informe o nome.'
  if (!(c >= 1 && c <= 31 && d >= 1 && d <= 31)) return 'Dias de fechamento e vencimento: de 1 a 31.'
  return { name: f.name.trim(), closing_day: c, due_day: d, credit_limit: num(f.credit_limit) || null, auto_pay: f.auto_pay }
}

export default function CardsCard({ cards, purchases, categories, month, items, used, onChanged, onError, onTogglePaid, onPay }) {
  const [form, setForm] = useState(EMPTY_CARD)
  const [busy, setBusy] = useState(false)

  async function create(e) {
    e.preventDefault()
    const row = cardRow(form)
    if (typeof row === 'string') return onError(row)
    setBusy(true); onError('')
    const { error } = await supabase.from('cards').insert(row)
    setBusy(false)
    if (error) return onError('Erro ao criar cartão: ' + error.message)
    setForm(EMPTY_CARD); onChanged()
  }

  return (
    <section className="card cats">
      <div className="cats-head">
        <p className="label">Cartões de crédito · {monthLabel(month)}</p>
      </div>

      <details className="pot-new">
        <summary className="btn">+ Novo cartão</summary>
        <form className="pot-form" onSubmit={create}>
          <CardFields form={form} setForm={setForm} />
          <button className="btn primary" disabled={busy}>Criar cartão</button>
        </form>
        <p className="muted small">As compras entram na fatura conforme o dia de fechamento. A fatura aparece nos lançamentos do mês em que vence, e só então sai da sua carteira.</p>
      </details>

      {cards.length === 0 ? (
        <p className="muted empty">Cadastre um cartão para lançar compras, parcelas e acompanhar a fatura.</p>
      ) : (
        <div className="cats-grid">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} month={month} purchases={purchases.filter((p) => p.card_id === c.id)}
              categories={categories} invoice={items.find((i) => i.source === 'invoice' && i.card_id === c.id)}
              used={used[c.id] || 0} onChanged={onChanged} onError={onError} onTogglePaid={onTogglePaid} onPay={onPay} />
          ))}
        </div>
      )}
    </section>
  )
}

function CardTile({ card, month, purchases, categories, invoice, used, onChanged, onError, onTogglePaid, onPay }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => cardFrom(card))
  const [busy, setBusy] = useState(false)
  const [purchase, setPurchase] = useState(null) // null | 'new' | linha da compra
  const limit = card.credit_limit ? Number(card.credit_limit) : null
  const due = invoiceDue(card, month)

  async function saveEdit(e) {
    e.preventDefault()
    const row = cardRow(form)
    if (typeof row === 'string') return onError(row)
    setBusy(true); onError('')
    const { error } = await supabase.from('cards').update(row).eq('id', card.id)
    setBusy(false)
    if (error) return onError('Erro ao salvar cartão: ' + error.message)
    setEditing(false); onChanged()
  }

  async function remove() {
    if (!window.confirm(`Excluir o cartão "${card.name}"? Todas as compras e faturas dele também serão apagadas.`)) return
    const { error } = await supabase.from('cards').delete().eq('id', card.id)
    if (error) onError('Erro ao excluir: ' + error.message)
    else onChanged()
  }

  async function removePurchase(p) {
    const msg = p.installments > 1 ? `Excluir "${p.description}"? Remove todas as ${p.installments} parcelas.` : `Excluir "${p.description}"?`
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('card_purchases').delete().eq('id', p.id)
    if (error) onError('Erro ao excluir compra: ' + error.message)
    else onChanged()
  }

  return (
    <div className="cat-tile pot credit">
      <div className="pot-top">
        <div><strong>{card.name}</strong> <span className="badge">fecha dia {card.closing_day} · vence dia {card.due_day}</span></div>
        <div>
          <button className="btn icon" aria-label={`Editar ${card.name}`} title="Editar cartão" onClick={() => { setForm(cardFrom(card)); setEditing(true) }}>✎</button>
          <button className="btn icon" aria-label={`Excluir ${card.name}`} title="Excluir cartão" onClick={remove}>×</button>
        </div>
      </div>

      <div>
        <p className="muted small">Fatura que vence em {formatDate(due)}</p>
        <p className={'num ' + (invoice ? 'neg' : 'muted')}>{invoice ? formatBRL(invoice.amount) : 'Sem fatura'}</p>
        {invoice && (
          <p className="small">
            {invoice.paid ? (invoice.autoOnly ? 'Paga (automático)' : 'Paga ✓' + (invoice.early ? ' antecipada' : '')) : invoice.late ? <b className="late">Em atraso</b> : 'Em aberto'}{' '}
            {invoice.discount > 0 && <b className="pos">· desconto de {formatBRL(invoice.discount)} (cheia {formatBRL(invoice.original)}) </b>}
            {invoice.discount < 0 && <b className="neg">· acréscimo de {formatBRL(-invoice.discount)} </b>}
          </p>
        )}
        {invoice && !invoice.autoOnly && (
          <p className="row-start">
            <button className="btn small" onClick={() => onPay(invoice)} title="Pagar antes do vencimento ou com desconto">{invoice.paid ? 'Alterar pagamento' : 'Pagar com desconto / antecipar'}</button>
            {!invoice.paid && <button className="btn small" onClick={() => onTogglePaid(invoice)}>Paguei o valor cheio</button>}
            {invoice.paid && <button className="btn small" onClick={() => onTogglePaid(invoice)}>Desfazer</button>}
          </p>
        )}
      </div>

      {limit ? (
        <>
          <div className="meter"><i className={used / limit > 0.8 ? 'warn' : ''} style={{ width: Math.min(100, (used / limit) * 100) + '%' }} /></div>
          <p className="small muted">Comprometido {formatBRL(used)} de {formatBRL(limit)} · disponível {formatBRL(Math.max(0, limit - used))}</p>
        </>
      ) : (
        <p className="small muted">Comprometido em faturas (todas): {formatBRL(used)}</p>
      )}

      {invoice && (
        <details className="dep-history">
          <summary className="small muted">Compras desta fatura ({invoice.parts.length})</summary>
          <ul>
            {invoice.parts.map((p) => (
              <li key={p.id + p.n}>
                <span>{p.description} <span className="muted small">{formatDate(p.date)}{p.of > 1 ? ` · parcela ${p.n}/${p.of} de ${formatBRL(p.total_amount)}` : ''}</span></span>
                <span className="row-end">
                  {formatBRL(p.amount)}
                  <button className="btn icon" aria-label={`Editar ${p.description}`} onClick={() => setPurchase(purchases.find((x) => x.id === p.id))}>✎</button>
                  <button className="btn icon" aria-label={`Excluir ${p.description}`} onClick={() => removePurchase(p)}>×</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {purchases.length > 0 && (
        <details className="dep-history">
          <summary className="small muted">Todas as compras do cartão ({purchases.length}) · editar ou excluir</summary>
          <ul>
            {[...purchases].sort((a, b) => b.date.localeCompare(a.date)).map((p) => (
              <li key={p.id}>
                <span>{p.description} <span className="muted small">{formatDate(p.date)}{p.installments > 1 ? ` · ${p.installments}x de ${formatBRL(Math.round(Number(p.amount) / p.installments * 100) / 100)}` : ''}</span></span>
                <span className="row-end">
                  {formatBRL(p.amount)}
                  <button className="btn icon" title="Editar compra" aria-label={`Editar ${p.description}`} onClick={() => setPurchase(p)}>✎</button>
                  <button className="btn icon" title="Excluir compra" aria-label={`Excluir ${p.description}`} onClick={() => removePurchase(p)}>×</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button className="btn" onClick={() => setPurchase('new')}>+ Nova compra no cartão</button>

      {purchase && (
        <Modal title={purchase === 'new' ? `Nova compra · ${card.name}` : `Editar compra · ${card.name}`} onClose={() => setPurchase(null)}>
          <PurchaseForm card={card} initial={purchase === 'new' ? null : purchase} categories={categories}
            onError={onError} onCancel={() => setPurchase(null)} onSaved={() => { setPurchase(null); onChanged() }} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Editar ${card.name}`} onClose={() => setEditing(false)}>
          <form className="pot-form single" onSubmit={saveEdit}>
            <CardFields form={form} setForm={setForm} />
            <p className="muted small full">Mudar fechamento ou vencimento recalcula em qual fatura cada compra cai.</p>
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

function PurchaseForm({ card, initial, categories, onSaved, onCancel, onError }) {
  const [f, setF] = useState({
    description: initial?.description ?? '', amount: initial ? String(initial.amount) : '',
    date: initial?.date ?? todayISO(), installments: String(initial?.installments ?? 1), category_id: initial?.category_id ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    const amount = num(f.amount), n = Math.floor(num(f.installments))
    if (!f.description.trim()) return setErr('Informe uma descrição.')
    if (amount <= 0) return setErr('Informe um valor maior que zero.')
    if (!(n >= 1 && n <= 120)) return setErr('Parcelas: de 1 a 120.')
    setBusy(true); setErr(''); onError('')
    const row = { description: f.description.trim(), amount, installments: n, date: f.date, category_id: f.category_id || null }
    const { error } = initial
      ? await supabase.from('card_purchases').update(row).eq('id', initial.id)
      : await supabase.from('card_purchases').insert({ ...row, card_id: card.id })
    setBusy(false)
    if (error) return setErr('Não foi possível salvar: ' + error.message)
    onSaved()
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="span-2">Descrição
        <input required maxLength={120} value={f.description} onChange={set('description')} placeholder="Celular, supermercado…" />
      </label>
      <label>Valor total (R$)<input required type="number" step="0.01" min="0.01" value={f.amount} onChange={set('amount')} /></label>
      <label>Parcelas<input required type="number" min="1" max="120" value={f.installments} onChange={set('installments')} /></label>
      <label>Data da compra<input required type="date" value={f.date} onChange={set('date')} /></label>
      <label>Categoria
        <select value={f.category_id} onChange={set('category_id')}>
          <option value="">Sem categoria</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {err && <p className="msg error span-2">{err}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : initial ? 'Salvar alterações' : 'Adicionar compra'}</button>
      <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
    </form>
  )
}
