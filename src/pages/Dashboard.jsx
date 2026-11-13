import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import AccountSettings from '../components/AccountSettings.jsx'
import InvestmentsCard from '../components/InvestmentsCard.jsx'
import CategoryCard from '../components/CategoryCard.jsx'
import CreditorsCard from '../components/CreditorsCard.jsx'
import CardsCard from '../components/CardsCard.jsx'
import ChartsCard from '../components/ChartsCard.jsx'
import NetWorthCard from '../components/NetWorthCard.jsx'
import Modal from '../components/Modal.jsx'
import PayModal from '../components/PayModal.jsx'
import TransactionForm from '../components/TransactionForm.jsx'
import TransactionList from '../components/TransactionList.jsx'
import { addMonth, currentMonth, formatBRL, formatDate, monthLabel, shortMonth, todayISO } from '../utils/format.js'
import { expand, sum, totalsOf } from '../utils/recurrence.js'
import { buildItems, cardUsed, makeCtx, planCarry, receivedOf, summarize } from '../utils/ledger.js'

const SCHEMA_HINT = ' (rodou o schema.sql novo no Supabase?)'

export default function Dashboard() {
  const { user, signOut, recovery } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [month, setMonth] = useState(currentMonth())
  const [formType, setFormType] = useState('expense')
  const [editing, setEditing] = useState(null) // lançamento (linha original) em edição
  const [paying, setPaying] = useState(null)   // item (conta/fatura) sendo pago no modal
  const [raw, setRaw] = useState([])
  const [categories, setCategories] = useState([])
  const [payments, setPayments] = useState([])
  const [pots, setPots] = useState([])
  const [deposits, setDeposits] = useState([])
  const [receivables, setReceivables] = useState([])
  const [receipts, setReceipts] = useState([])
  const [cards, setCards] = useState([])
  const [purchases, setPurchases] = useState([])
  const [cardPayments, setCardPayments] = useState([])
  const [carry, setCarry] = useState([])
  const [settings, setSettings] = useState(null)
  const [loaded, setLoaded] = useState({})
  const today = todayISO()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const done = (k) => setLoaded((l) => ({ ...l, [k]: true }))

  const load = useCallback(async () => {
    setError('')
    const [tx, pay] = await Promise.all([
      supabase.from('transactions')
        .select('id, type, kind, description, amount, date, months, category_id, auto_pay')
        .order('date', { ascending: false }),
      supabase.from('payments').select('transaction_id, month, paid_amount, paid_on'),
    ])
    if (tx.error) setError('Erro ao carregar: ' + tx.error.message)
    else if (pay.error) setError('Erro ao carregar pagamentos' + SCHEMA_HINT + ': ' + pay.error.message)
    else { setRaw(tx.data); setPayments(pay.data); done('tx') }
    setLoading(false)
  }, [])

  const loadPots = useCallback(async () => {
    const [p, d] = await Promise.all([
      supabase.from('pots').select('*').order('created_at'),
      supabase.from('pot_deposits').select('id, pot_id, amount, extra, date, for_month, created_at'),
    ])
    if (p.error || d.error) setError('Erro ao carregar caixinhas' + SCHEMA_HINT + ': ' + (p.error || d.error).message)
    else { setPots(p.data); setDeposits(d.data); done('pots') }
  }, [])

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('id, name, created_at').order('name')
    if (error) setError('Erro ao carregar categorias: ' + error.message)
    else { setCategories(data); done('cats') }
  }, [])

  const loadCredit = useCallback(async () => {
    const [r, p] = await Promise.all([
      supabase.from('receivables').select('*').order('created_at'),
      supabase.from('receipts').select('id, receivable_id, amount, date'),
    ])
    if (r.error || p.error) setError('Erro ao carregar credores' + SCHEMA_HINT + ': ' + (r.error || p.error).message)
    else { setReceivables(r.data); setReceipts(p.data); done('credit') }
  }, [])

  const loadCards = useCallback(async () => {
    const [c, p, y] = await Promise.all([
      supabase.from('cards').select('*').order('created_at'),
      supabase.from('card_purchases').select('*'),
      supabase.from('card_payments').select('card_id, month, paid_amount, paid_on'),
    ])
    const err = c.error || p.error || y.error
    if (err) setError('Erro ao carregar cartões' + SCHEMA_HINT + ': ' + err.message)
    else { setCards(c.data); setPurchases(p.data); setCardPayments(y.data); done('cards') }
  }, [])

  const loadCarry = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('carryovers').select('id, month, amount, source'),
      supabase.from('user_settings').select('auto_carry, auto_carry_since').maybeSingle(),
    ])
    if (c.error || s.error) return setError('Erro ao carregar sobras' + SCHEMA_HINT + ': ' + (c.error || s.error).message)
    let st = s.data
    if (!st) {
      // primeira vez: sobra automática ligada a partir deste mês (não mexe no passado)
      st = { auto_carry: true, auto_carry_since: currentMonth() }
      const { error } = await supabase.from('user_settings')
        .upsert({ user_id: user.id, ...st }, { onConflict: 'user_id', ignoreDuplicates: true })
      if (error) return setError('Erro ao salvar configuração' + SCHEMA_HINT + ': ' + error.message)
    }
    setCarry(c.data); setSettings(st); done('carry')
  }, [user.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { loadPots() }, [loadPots])
  useEffect(() => { loadCredit() }, [loadCredit])
  useEffect(() => { loadCards() }, [loadCards])
  useEffect(() => { loadCarry() }, [loadCarry])

  const ready = ['tx', 'cats', 'pots', 'credit', 'cards', 'carry'].every((k) => loaded[k])
  const ctx = useMemo(
    () => makeCtx({ raw, categories, payments, pots, deposits, receivables, receipts, cards, purchases, cardPayments, carry }, today),
    [raw, categories, payments, pots, deposits, receivables, receipts, cards, purchases, cardPayments, carry, today],
  )

  // Sobra automática: ao virar o mês, a sobra do mês anterior entra como entrada no mês novo.
  // Só roda com tudo carregado (senão calcularia a sobra com dados incompletos).
  const carryBusy = useRef(false)
  useEffect(() => {
    if (!ready || !settings?.auto_carry || carryBusy.current) return
    const rows = planCarry(ctx, currentMonth(), settings.auto_carry_since)
    if (!rows.length) return
    carryBusy.current = true
    supabase.from('carryovers')
      .upsert(rows.map((r) => ({ ...r, user_id: user.id })), { onConflict: 'user_id,month', ignoreDuplicates: true })
      .then(({ error }) => {
        carryBusy.current = false
        if (error) setError('Erro ao passar a sobra do mês: ' + error.message)
        else loadCarry()
      })
  }, [ready, settings, ctx, user.id, loadCarry])

  const items = useMemo(() => buildItems(month, ctx), [month, ctx])
  const summary = useMemo(() => summarize(ctx, currentMonth()), [ctx])
  const overdue = summary.late
  const used = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, cardUsed(c, ctx)])), [cards, ctx])

  const t = useMemo(() => totalsOf(items), [items])
  const paidExp = sum(items.filter((x) => x.type === 'expense' && x.paid))
  const wallet = Math.round((t.income - paidExp) * 100) / 100
  const toPay = Math.round((t.expense - paidExp) * 100) / 100

  // próximos 6 meses considerando só o que é fixo (o que já está comprometido)
  const ahead = useMemo(() => {
    const fixed = raw.filter((r) => r.kind === 'fixed')
    return Array.from({ length: 6 }, (_, i) => {
      const m = addMonth(month, i)
      const x = totalsOf(expand(fixed, m))
      return { m, net: Math.round((x.incF - x.expF) * 100) / 100 }
    })
  }, [raw, month])
  const maxAbs = Math.max(1, ...ahead.map((a) => Math.abs(a.net)))

  const commit = t.income > 0 ? Math.round((t.expF / t.income) * 100) : t.expF > 0 ? 100 : 0
  const bars = [
    ['Renda fixa', t.incF, 'in'], ['Renda variável', t.incV, 'in2'],
    ['Gastos fixos', t.expF, 'fx'], ['Extraordinários', t.expE, 'out'],
    ['Cartão', t.expC, 'cc'], ['Investimentos', t.expI, 'inv'],
  ]
  const maxBar = Math.max(1, ...bars.map((b) => b[1]))

  // sobra do mês -> entrada do mês seguinte
  const nextMonth = addMonth(month, 1)
  const nextCarry = ctx.carryMap.get(nextMonth)
  const canMove = t.balance > 0 && !(nextCarry && Number(nextCarry.amount) === t.balance)

  async function run(q, msg, reload) {
    const { error } = await q
    if (error) { setError(msg + ': ' + error.message); return false }
    reload?.()
    return true
  }

  async function moveCarry() {
    setError('')
    await run(
      supabase.from('carryovers').upsert({ user_id: user.id, month: nextMonth, amount: t.balance, source: 'manual' }, { onConflict: 'user_id,month' }),
      'Erro ao passar a sobra', loadCarry,
    )
  }

  async function toggleAuto(on) {
    const st = { auto_carry: on, auto_carry_since: on ? currentMonth() : settings.auto_carry_since }
    setError('')
    await run(supabase.from('user_settings').upsert({ user_id: user.id, ...st }, { onConflict: 'user_id' }), 'Erro ao salvar', loadCarry)
  }

  async function setPaid(list, paid) {
    setError('')
    const tx = list.filter((x) => x.source === 'tx')
    const inv = list.filter((x) => x.source === 'invoice')
    const ops = []
    if (paid) {
      if (tx.length) ops.push(supabase.from('payments').upsert(tx.map((x) => ({ transaction_id: x.id, month: x.date.slice(0, 7), paid_amount: null, paid_on: todayISO() })), { onConflict: 'transaction_id,month' }))
      if (inv.length) ops.push(supabase.from('card_payments').upsert(inv.map((x) => ({ card_id: x.card_id, month: x.date.slice(0, 7), paid_amount: null, paid_on: todayISO() })), { onConflict: 'card_id,month' }))
    } else {
      const x = list[0]
      if (x.source === 'tx') ops.push(supabase.from('payments').delete().eq('transaction_id', x.id).eq('month', x.date.slice(0, 7)))
      if (x.source === 'invoice') ops.push(supabase.from('card_payments').delete().eq('card_id', x.card_id).eq('month', x.date.slice(0, 7)))
    }
    const res = await Promise.all(ops)
    const bad = res.find((r) => r.error)
    if (bad) setError('Erro ao atualizar pagamento: ' + bad.error.message)
    else { if (tx.length || (!paid && list[0].source === 'tx')) load(); loadCards() }
  }

  // pagamento com valor/dia informados (antecipado, com desconto ou juros). Devolve mensagem de erro ou nada.
  async function payWith(x, { amount, full, date }) {
    setError('')
    const paid_amount = Math.abs(amount - full) < 0.005 ? null : amount
    const month = x.date.slice(0, 7)
    const q = x.source === 'invoice'
      ? supabase.from('card_payments').upsert({ card_id: x.card_id, month, paid_amount, paid_on: date }, { onConflict: 'card_id,month' })
      : supabase.from('payments').upsert({ transaction_id: x.id, month, paid_amount, paid_on: date }, { onConflict: 'transaction_id,month' })
    const { error } = await q
    if (error) return 'Erro ao salvar pagamento: ' + error.message
    if (x.source === 'invoice') loadCards(); else load()
  }

  async function handleDelete(x) {
    if (x.source === 'tx') {
      const msg = x.kind === 'fixed'
        ? `Excluir "${x.description}"? Isso remove todos os meses desse lançamento fixo.`
        : `Excluir "${x.description}"?`
      if (!window.confirm(msg)) return
      await run(supabase.from('transactions').delete().eq('id', x.id), 'Erro ao excluir', load)
    } else if (x.source === 'receipt') {
      if (!window.confirm(`Desfazer o recebimento de ${formatBRL(x.amount)}? A dívida volta a ficar em aberto.`)) return
      await run(supabase.from('receipts').delete().eq('id', x.rid), 'Erro ao desfazer', loadCredit)
    } else if (x.source === 'deposit') {
      if (!window.confirm(`Excluir o depósito de ${formatBRL(x.amount)}? O saldo da caixinha diminui.`)) return
      await run(supabase.from('pot_deposits').delete().eq('id', x.rid), 'Erro ao excluir', loadPots)
    } else if (x.source === 'carry') {
      if (!window.confirm('Remover a sobra deste mês? (ela não será recriada automaticamente)')) return
      // fica com valor 0 (e não apagada) para a sobra automática não recriar
      await run(supabase.from('carryovers').update({ amount: 0 }).eq('id', x.rid), 'Erro ao remover', loadCarry)
    }
  }

  // corrige só o valor de recebimento / depósito / sobra. Devolve mensagem de erro ou nada.
  async function editAmount(x, v) {
    setError('')
    if (x.source === 'receipt') {
      const rc = receipts.find((r) => r.id === x.rid)
      const rcv = ctx.receivableById[rc.receivable_id]
      if (v > Number(rcv.amount) - (receivedOf(rcv, receipts) - Number(rc.amount)) + 0.001) return 'Passa do total da dívida.'
      const { error } = await supabase.from('receipts').update({ amount: v }).eq('id', x.rid)
      if (error) return error.message
      loadCredit()
    } else if (x.source === 'deposit') {
      const { error } = await supabase.from('pot_deposits').update({ amount: v }).eq('id', x.rid)
      if (error) return error.message
      loadPots()
    } else if (x.source === 'carry') {
      const { error } = await supabase.from('carryovers').update({ amount: v }).eq('id', x.rid)
      if (error) return error.message
      loadCarry()
    }
  }

  async function confirmAporte(x) {
    const pot = pots.find((p) => p.id === x.pot_id)
    if (!pot) return
    setError('')
    await run(
      supabase.from('pot_deposits').insert({ pot_id: pot.id, amount: pot.monthly, extra: false, date: todayISO(), for_month: x.month }),
      'Erro ao confirmar aporte', loadPots,
    )
  }

  async function undoAporte(x) {
    setError('')
    await run(supabase.from('pot_deposits').delete().eq('id', x.rid), 'Erro ao desfazer aporte', loadPots)
  }

  const actions = {
    onEdit: (x) => setEditing(raw.find((r) => r.id === x.id) || null),
    onDelete: handleDelete,
    onTogglePaid: (x) => setPaid([x], !x.paid),
    onPay: setPaying,
    onEditAmount: editAmount,
    onConfirmAporte: confirmAporte,
    onUndoAporte: undoAporte,
  }

  return (
    <div className="container">
      <header className="topbar">
        <h1>Controle de Finanças</h1>
        <div className="topbar-user">
          <span className="muted">{user?.email}</span>
          <ThemeToggle />
          <button className="btn" onClick={() => setSettingsOpen(true)} aria-label="Configurações da conta" title="Configurações da conta">⚙</button>
          <button className="btn" onClick={signOut}>Sair</button>
        </div>
      </header>

      {error && <p className="msg error">{error}</p>}

      {overdue.length > 0 && (
        <section className="alert" role="alert">
          <div className="alert-head">
            <strong>⚠ {overdue.length} {overdue.length === 1 ? 'conta em atraso' : 'contas em atraso'} · {formatBRL(sum(overdue))}</strong>
            <button className="btn" onClick={() => setPaid(overdue, true)}>Marcar todas como pagas</button>
          </div>
          <ul>
            {overdue.slice(0, 6).map((x) => (
              <li key={x.id + x.date}>
                <span>{x.description} <span className="muted">venceu {formatDate(x.date)}</span></span>
                <span>{formatBRL(x.amount)} <button className="btn" onClick={() => setPaid([x], true)}>Paguei</button></span>
              </li>
            ))}
          </ul>
          {overdue.length > 6 && <p className="muted small">e mais {overdue.length - 6}…</p>}
        </section>
      )}

      <main className="bento">
        <section className="card hero">
          <div className="month-nav">
            <button className="btn icon light" aria-label="Mês anterior" onClick={() => setMonth(addMonth(month, -1))}>‹</button>
            <span>{monthLabel(month)}</span>
            <button className="btn icon light" aria-label="Próximo mês" onClick={() => setMonth(addMonth(month, 1))}>›</button>
          </div>
          <div>
            <p className="label">Na carteira agora</p>
            <p className={'big ' + (wallet < 0 ? 'neg-on-dark' : '')}>{formatBRL(wallet)}</p>
          </div>
          <div className="hero-sub">
            <p>Após pagar as contas: <strong className={t.balance < 0 ? 'neg-on-dark' : ''}>{formatBRL(t.balance)}</strong></p>
            <p>Ainda a pagar: {formatBRL(toPay)} · já pago: {formatBRL(paidExp)}</p>
            {canMove && (
              <button className="btn carry-btn" onClick={moveCarry}>
                💰 {nextCarry && Number(nextCarry.amount) > 0 ? 'Atualizar' : 'Passar'} sobra de {formatBRL(t.balance)} para {shortMonth(nextMonth)}
              </button>
            )}
            <label className="check carry-auto">
              <input type="checkbox" checked={!!settings?.auto_carry} disabled={!settings} onChange={(e) => toggleAuto(e.target.checked)} />
              Passar a sobra sozinho ao virar o mês
            </label>
          </div>
        </section>

        <section className="card">
          <p className="label">Entradas</p>
          <p className="num pos">{formatBRL(t.income)}</p>
          <p className="muted small">Fixa {formatBRL(t.incF)} · Variável {formatBRL(t.incV)}</p>
        </section>

        <section className="card">
          <p className="label">Saídas</p>
          <p className="num neg">{formatBRL(t.expense)}</p>
          <p className="muted small">Fixos {formatBRL(t.expF)} · Extra {formatBRL(t.expE)}</p>
        </section>

        <NetWorthCard nw={summary} today={today} />

        <section className="card span-2">
          <p className="label">Comprometimento com gastos fixos</p>
          <div className="meter"><i style={{ width: Math.min(commit, 100) + '%' }} className={commit > 60 ? 'warn' : ''} /></div>
          <p className="small">
            {commit}% da renda do mês já está comprometida.{' '}
            <span className="muted">
              {t.balance < 0 ? 'Atenção: o mês está no vermelho.' : commit > 60 ? 'Acima de 60%: pouco espaço para imprevistos.' : 'Folga saudável.'}
            </span>
          </p>
        </section>

        <section className="card span-2">
          <div className="tabs" role="tablist">
            {[['expense', 'Novo gasto'], ['income', 'Nova entrada']].map(([v, l]) => (
              <button key={v} role="tab" aria-selected={formType === v}
                className={'tab ' + (formType === v ? 'active' : '')} onClick={() => setFormType(v)}>{l}</button>
            ))}
          </div>
          <TransactionForm key={formType} type={formType} onSaved={load} categories={categories} />
        </section>

        <section className="card span-2 tall">
          <p className="label">Lançamentos de {monthLabel(month)}</p>
          {loading ? <p className="muted empty">Carregando…</p> : <TransactionList items={items} actions={actions} />}
        </section>

        <section className="card span-2">
          <p className="label">Contas fixas nos próximos meses</p>
          <div className="ahead">
            {ahead.map((a) => (
              <div key={a.m} className="col">
                <span className={'small ' + (a.net < 0 ? 'neg' : 'pos')}>{formatBRL(a.net).replace(/\s/g, '')}</span>
                <div className="track"><i className={a.net < 0 ? 'neg' : ''} style={{ height: Math.max(6, (Math.abs(a.net) / maxAbs) * 100) + '%' }} /></div>
                <span className="muted small">{shortMonth(a.m)}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Renda fixa menos gastos fixos, mês a mês.</p>
        </section>

        <section className="card span-2">
          <p className="label">Para onde vai o dinheiro</p>
          <div className="hbars">
            {bars.map(([name, v, c]) => (
              <div key={name} className="hbar">
                <span className="small">{name}</span>
                <div className="rail"><i className={c} style={{ width: (v / maxBar) * 100 + '%' }} /></div>
                <span className="small">{formatBRL(v)}</span>
              </div>
            ))}
          </div>
        </section>

        <CategoryCard
          categories={categories}
          items={items}
          onChanged={() => { loadCategories(); load() }}
          onError={setError}
        />

        <ChartsCard ctx={ctx} categories={categories} month={month} />

        <CreditorsCard receivables={receivables} receipts={receipts} onChanged={loadCredit} onError={setError} />

        <CardsCard cards={cards} purchases={purchases} categories={categories} month={month} items={items} used={used}
          onChanged={loadCards} onError={setError} onTogglePaid={(x) => setPaid([x], !x.paid)} onPay={setPaying} />

        <InvestmentsCard pots={pots} deposits={deposits} month={month} onChanged={loadPots} onError={setError}
          onConfirmAporte={confirmAporte} onUndoAporte={undoAporte} />
      </main>
      {paying && <PayModal item={paying} onClose={() => setPaying(null)} onConfirm={(v) => payWith(paying, v)} />}
      {editing && (
        <Modal title={editing.type === 'expense' ? 'Editar gasto' : 'Editar entrada'} onClose={() => setEditing(null)}>
          <TransactionForm type={editing.type} initial={editing} categories={categories}
            onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
        </Modal>
      )}
      {(settingsOpen || recovery) && <AccountSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
