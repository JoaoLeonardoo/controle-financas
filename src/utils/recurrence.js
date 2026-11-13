const idx = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return y * 12 + m - 1
}

// Lançamentos "fixed" se repetem todo mês a partir do mês de início.
// months = nº de meses de duração (null = para sempre). Os demais valem só no próprio mês.
export function expand(rows, month) {
  const mi = idx(month)
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const out = []
  for (const t of rows) {
    if (t.kind !== 'fixed') {
      if (idx(t.date.slice(0, 7)) === mi) out.push(t)
      continue
    }
    const n = mi - idx(t.date.slice(0, 7))
    if (n < 0 || (t.months && n >= t.months)) continue
    const day = String(Math.min(Number(t.date.slice(8, 10)), lastDay)).padStart(2, '0')
    out.push({ ...t, date: `${month}-${day}`, n: n + 1, of: t.months })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

// soma em centavos (evita erro de ponto flutuante)
export function sum(list) {
  return list.reduce((s, t) => s + Math.round(Number(t.amount) * 100), 0) / 100
}

export function totalsOf(items) {
  const exp = (kind) => sum(items.filter((t) => t.type === 'expense' && t.kind === kind))
  const incF = sum(items.filter((t) => t.type === 'income' && t.kind === 'fixed'))
  const incV = sum(items.filter((t) => t.type === 'income' && t.kind !== 'fixed'))
  const expF = exp('fixed')
  const expE = exp('extraordinary')
  const expC = exp('card')     // faturas de cartão
  const expI = exp('invest')   // aportes / depósitos em caixinhas
  const income = sum(items.filter((t) => t.type === 'income'))
  const expense = sum(items.filter((t) => t.type === 'expense'))
  return { incF, incV, expF, expE, expC, expI, income, expense, balance: Math.round((income - expense) * 100) / 100 }
}
