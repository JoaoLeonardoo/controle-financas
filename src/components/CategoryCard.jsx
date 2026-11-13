import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { formatBRL, formatDate } from '../utils/format.js'
import { sum } from '../utils/recurrence.js'

export default function CategoryCard({ categories, items, onChanged, onError }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // fatura de cartão entra pelas compras (cada uma com a sua categoria); aportes não são "gasto"
  const expenses = items
    .flatMap((t) => (t.parts ? t.parts.map((p) => ({ ...p, id: p.id + '-' + p.n, type: 'expense' })) : [t]))
    .filter((t) => t.type === 'expense' && t.kind !== 'invest')
  const groups = categories.map((c) => ({ ...c, list: expenses.filter((t) => t.category_id === c.id) }))
  const loose = expenses.filter((t) => !t.category_id || !categories.some((c) => c.id === t.category_id))
  if (loose.length) groups.push({ id: 'none', name: 'Sem categoria', list: loose })

  async function handleAdd(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    onError('')
    const { error } = await supabase.from('categories').insert({ name: n })
    setBusy(false)
    if (error) return onError(error.code === '23505' ? 'Você já tem uma categoria com esse nome.' : 'Erro ao criar categoria: ' + error.message)
    setName('')
    onChanged()
  }

  async function handleDelete(c) {
    if (!window.confirm(`Excluir a categoria "${c.name}"? Os gastos dela não são apagados, ficam sem categoria.`)) return
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (error) onError('Erro ao excluir categoria: ' + error.message)
    else onChanged()
  }

  return (
    <section className="card cats">
      <div className="cats-head">
        <p className="label">Gastos por categoria</p>
        <form className="cat-new" onSubmit={handleAdd}>
          <input type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Nova categoria (Mercado, Transporte…)" aria-label="Nome da nova categoria" />
          <button className="btn primary" disabled={busy || !name.trim()}>Criar</button>
        </form>
      </div>

      {groups.length === 0 ? (
        <p className="muted empty">Crie sua primeira categoria e escolha ela ao lançar um gasto.</p>
      ) : (
        <div className="cats-grid">
          {groups.map((g) => (
            <details key={g.id} className="cat-tile">
              <summary>
                <span className="cat-name">{g.name}</span>
                <strong className="neg">{formatBRL(sum(g.list))}</strong>
                {g.id !== 'none' && (
                  <button type="button" className="btn icon" aria-label={`Excluir categoria ${g.name}`} title="Excluir categoria"
                    onClick={(e) => { e.preventDefault(); handleDelete(g) }}>×</button>
                )}
              </summary>
              {g.list.length === 0 ? (
                <p className="muted small">Nenhum gasto neste mês.</p>
              ) : (
                <ul>
                  {g.list.map((t) => (
                    <li key={t.id + t.date}>
                      <span>{t.description} <span className="muted">{formatDate(t.date)}</span></span>
                      <span>{formatBRL(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  )
}
