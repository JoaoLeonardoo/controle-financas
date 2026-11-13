import { addMonth, dayInMonth } from './format.js'

// divide o total em parcelas em centavos; os centavos que sobram vão para as primeiras parcelas
export function splitInstallments(total, n) {
  const cents = Math.round(Number(total) * 100)
  const base = Math.floor(cents / n)
  const rest = cents - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100)
}

// Mês (YYYY-MM) de VENCIMENTO da fatura que recebe a 1ª parcela.
// Compra até o dia de fechamento entra na fatura que fecha neste mês; depois, na do mês seguinte.
// Se o vencimento é depois do fechamento, vence no mesmo mês do fechamento; senão, no seguinte.
export function firstInvoiceMonth(card, dateISO) {
  const pm = dateISO.slice(0, 7)
  const day = Number(dateISO.slice(8, 10))
  const closeMonth = day <= card.closing_day ? pm : addMonth(pm, 1)
  return card.due_day > card.closing_day ? closeMonth : addMonth(closeMonth, 1)
}

export const invoiceDue = (card, month) => dayInMonth(month, card.due_day)

// parcelas de uma compra: [{ month (vencimento), amount, n, of }]
export function installmentsOf(purchase, card) {
  const n = purchase.installments || 1
  const first = firstInvoiceMonth(card, purchase.date)
  return splitInstallments(purchase.amount, n).map((amount, i) => ({ month: addMonth(first, i), amount, n: i + 1, of: n }))
}

// fatura do cartão que vence em "month": parcelas + total
export function invoiceFor(card, purchases, month) {
  const parts = []
  for (const p of purchases) {
    if (p.card_id !== card.id) continue
    for (const i of installmentsOf(p, card)) {
      if (i.month === month) parts.push({ ...p, total_amount: p.amount, amount: i.amount, n: i.n, of: i.of })
    }
  }
  parts.sort((a, b) => b.date.localeCompare(a.date))
  const total = parts.reduce((s, x) => s + Math.round(x.amount * 100), 0) / 100
  return { parts, total }
}
