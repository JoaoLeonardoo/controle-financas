// Monta tudo o que acontece em um mês (lançamentos, recebimentos, faturas, aportes, sobra)
// e calcula patrimônio e sobras. Funções puras: recebem os dados já carregados (ctx).
import { addMonth, monthLabel, monthOfTs } from './format.js'
import { expand, sum } from './recurrence.js'
import { installmentsOf, invoiceDue, invoiceFor } from './cards.js'

const r2 = (v) => Math.round(v * 100) / 100

export function makeCtx(d, today) {
  return {
    raw: d.raw, categories: d.categories, receivables: d.receivables, receipts: d.receipts,
    cards: d.cards, purchases: d.purchases, pots: d.pots, deposits: d.deposits,
    today,
    catMap: Object.fromEntries(d.categories.map((c) => [c.id, c.name])),
    paidTx: new Map(d.payments.map((p) => [p.transaction_id + '|' + p.month, p])),
    paidCard: new Map(d.cardPayments.map((p) => [p.card_id + '|' + p.month, p])),
    receivableById: Object.fromEntries(d.receivables.map((r) => [r.id, r])),
    potById: Object.fromEntries(d.pots.map((p) => [p.id, p])),
    carryMap: new Map(d.carry.map((c) => [c.month, c])),
  }
}

// paga = confirmada manualmente OU marcada para pagar sozinha e já venceu
// "row" = registro de pagamento manual (pode ter paid_amount = valor pago com desconto e paid_on = dia)
function status(row, autoPay, due, today, amount) {
  const manual = !!row
  const auto = !!autoPay && due <= today
  const st = { paid: manual || auto, autoOnly: auto && !manual, late: !(manual || auto) && due < today }
  if (manual) {
    st.paidOn = row.paid_on || null
    st.early = !!row.paid_on && row.paid_on < due
    if (row.paid_amount != null) {   // pagou valor diferente do cheio (desconto ou juros)
      st.original = Number(amount)
      st.amount = Number(row.paid_amount)
      st.discount = Math.round((Number(amount) - Number(row.paid_amount)) * 100) / 100
    }
  }
  return st
}
export const txStatus = (x, ctx) => status(ctx.paidTx.get(x.id + '|' + x.date.slice(0, 7)), x.auto_pay, x.date, ctx.today, x.amount)
export const invoiceStatus = (card, month, ctx, amount) =>
  status(ctx.paidCard.get(card.id + '|' + month), card.auto_pay, invoiceDue(card, month), ctx.today, amount)

export function buildItems(month, ctx, carryMap = ctx.carryMap) {
  const out = []

  for (const x of expand(ctx.raw, month)) {
    out.push({ ...x, source: 'tx', categoryName: ctx.catMap[x.category_id], ...(x.type === 'expense' ? txStatus(x, ctx) : {}) })
  }

  for (const r of ctx.receipts) {
    if (r.date.slice(0, 7) !== month) continue
    const who = ctx.receivableById[r.receivable_id]?.person ?? 'devedor'
    out.push({ id: 'rcp-' + r.id, rid: r.id, source: 'receipt', type: 'income', kind: 'variable', description: `Recebido de ${who}`, amount: r.amount, date: r.date })
  }

  const c = carryMap.get(month)
  if (c && Number(c.amount) > 0) {
    out.push({ id: 'carry-' + month, rid: c.id, source: 'carry', type: 'income', kind: 'variable', description: `Sobra de ${monthLabel(addMonth(month, -1))}`, amount: c.amount, date: `${month}-01` })
  }

  for (const card of ctx.cards) {
    const inv = invoiceFor(card, ctx.purchases, month)
    if (inv.total <= 0) continue
    out.push({
      id: `inv-${card.id}-${month}`, source: 'invoice', card_id: card.id, type: 'expense', kind: 'card',
      description: `Fatura ${card.name}`, amount: inv.total, date: invoiceDue(card, month), parts: inv.parts,
      ...invoiceStatus(card, month, ctx, inv.total),
    })
  }

  // investimentos: depósitos feitos + aporte mensal planejado das caixinhas (aguardando confirmação)
  const planned = new Set()
  for (const d of ctx.deposits) {
    const forThis = d.for_month === month
    if (!(forThis || (!d.for_month && d.date.slice(0, 7) === month))) continue
    if (forThis) planned.add(d.pot_id)
    const pot = ctx.potById[d.pot_id]
    out.push({
      id: 'dep-' + d.id, rid: d.id, source: 'deposit', type: 'expense', kind: 'invest', pot_id: d.pot_id,
      description: `${d.for_month ? 'Aporte' : 'Depósito'} em ${pot?.name ?? 'caixinha'}`,
      amount: d.amount, date: d.for_month ? `${month}-01` : d.date, paid: true, planned: !!d.for_month,
    })
  }
  for (const pot of ctx.pots) {
    if (!(Number(pot.monthly) > 0) || planned.has(pot.id) || month < monthOfTs(pot.created_at)) continue
    out.push({
      id: `aporte-${pot.id}-${month}`, source: 'aporte', pot_id: pot.id, month, type: 'expense', kind: 'invest',
      description: `Aporte em ${pot.name}`, amount: pot.monthly, date: `${month}-01`, paid: false, late: false, pending: true,
    })
  }

  return out.sort((a, b) => b.date.localeCompare(a.date))
}

// primeiro mês com algum dado (limitado a 20 anos atrás)
function firstMonth(ctx, cur) {
  let m = cur
  const take = (iso) => { if (iso && iso.slice(0, 7) < m) m = iso.slice(0, 7) }
  ctx.raw.forEach((r) => take(r.date))
  ctx.receipts.forEach((r) => take(r.date))
  ctx.purchases.forEach((p) => take(p.date))
  ctx.deposits.forEach((d) => take(d.for_month ? d.for_month + '-01' : d.date))
  ctx.pots.forEach((p) => take(monthOfTs(p.created_at) + '-01'))
  const floor = addMonth(cur, -239)
  return m < floor ? floor : m
}

// Caixa acumulado até hoje, contas vencidas não pagas, e patrimônio.
// Entrada só conta se a data já chegou; gasto só conta se foi pago. A sobra não entra aqui
// (é só mover dinheiro de um mês para outro). Dinheiro que foi para a caixinha sai do caixa
// e entra no saldo da caixinha.
export function summarize(ctx, cur) {
  let cash = 0
  const late = []
  // vai até o último mês com pagamento antecipado / aporte já confirmado
  let last = cur
  for (const k of [...ctx.paidTx.keys(), ...ctx.paidCard.keys()]) if (k.split('|')[1] > last) last = k.split('|')[1]
  for (const d of ctx.deposits) if (d.for_month && d.for_month > last) last = d.for_month
  if (last > addMonth(cur, 120)) last = addMonth(cur, 120)
  for (let m = firstMonth(ctx, cur); m <= last; m = addMonth(m, 1)) {
    const future = m > cur
    for (const x of buildItems(m, ctx)) {
      const c = Math.round(Number(x.amount) * 100)
      if (x.type === 'income') { if (!future && x.source !== 'carry' && x.date <= ctx.today) cash += c }
      else if (x.paid) cash -= c   // em meses futuros só entra o que foi pago antes da hora
      else if (x.late) late.push(x)
    }
  }
  cash /= 100
  const potsTotal = r2(ctx.pots.reduce((s, p) => s + Number(p.balance), 0) + sum(ctx.deposits))
  const receivable = receivableOpen(ctx)
  const overdue = sum(late)
  return { cash: r2(cash), potsTotal, receivable, overdue, late, total: r2(cash + potsTotal + receivable - overdue) }
}

export function receivableOpen(ctx) {
  return r2(ctx.receivables.reduce((s, r) => s + remainingOf(r, ctx.receipts), 0))
}
export const receivedOf = (r, receipts) => sum(receipts.filter((x) => x.receivable_id === r.id))
export const remainingOf = (r, receipts) => Math.max(0, r2(Number(r.amount) - receivedOf(r, receipts)))

// quanto do limite do cartão está comprometido (parcelas de faturas ainda não pagas, inclusive futuras)
export function cardUsed(card, ctx) {
  let c = 0
  for (const p of ctx.purchases) {
    if (p.card_id !== card.id) continue
    for (const i of installmentsOf(p, card)) if (!invoiceStatus(card, i.month, ctx).paid) c += Math.round(i.amount * 100)
  }
  return c / 100
}

// sobra do mês = entradas (com a sobra que veio) − todos os gastos, pagos ou não
export function balanceOf(month, ctx, carryMap = ctx.carryMap) {
  const items = buildItems(month, ctx, carryMap)
  return r2(sum(items.filter((x) => x.type === 'income')) - sum(items.filter((x) => x.type === 'expense')))
}

// meses que ainda não tiveram a sobra decidida, de (since+1) até o mês atual
export function planCarry(ctx, cur, since) {
  const map = new Map(ctx.carryMap)
  const rows = []
  for (let m = addMonth(since, 1); m <= cur; m = addMonth(m, 1)) {
    if (map.has(m)) continue
    const amount = Math.max(0, balanceOf(addMonth(m, -1), ctx, map))
    rows.push({ month: m, amount, source: 'auto' })
    map.set(m, { month: m, amount })
  }
  return rows
}
