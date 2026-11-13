// Sugestão inicial comum nas caixinhas dos bancos: 100% do CDI. Confira no app do seu banco.
export const BANKS = {
  Nubank: 100, PicPay: 100, Inter: 100, 'Mercado Pago': 100, 'C6 Bank': 100,
  Itaú: 100, Bradesco: 100, Santander: 100, Outro: 100,
}

export const annualRate = (pot, cdi) => (pot.rate_mode === 'cdi' ? (cdi * Number(pot.rate)) / 100 : Number(pot.rate))
export const monthlyRate = (annualPct) => Math.pow(1 + annualPct / 100, 1 / 12) - 1

// quantos meses até a meta, com rendimento composto + aporte mensal (null = não chega)
export function monthsToGoal(balance, monthly, goal, annualPct) {
  if (balance >= goal) return 0
  const r = monthlyRate(annualPct)
  let b = balance
  for (let n = 1; n <= 1200; n++) {
    b = b * (1 + r) + monthly
    if (b >= goal) return n
  }
  return null
}
