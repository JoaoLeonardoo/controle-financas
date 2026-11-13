import { useState } from 'react'
import { parseMoney } from '../utils/format.js'

// Botão ✎ que abre um campo para corrigir só o valor. onSave(valor) pode devolver uma mensagem de erro.
export default function AmountEdit({ value, onSave, allowZero = false, label = 'Corrigir valor' }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <button type="button" className="btn icon" title={label} aria-label={label}
        onClick={() => { setText(String(value)); setErr(''); setOpen(true) }}>✎</button>
    )
  }

  async function save(e) {
    e.preventDefault()
    const v = parseMoney(text)
    if (!(v > 0 || (allowZero && v === 0))) return setErr('Valor inválido.')
    setBusy(true)
    const msg = await onSave(Math.round(v * 100) / 100)
    setBusy(false)
    if (msg) setErr(msg)
    else setOpen(false)
  }

  return (
    <form className="amount-edit" onSubmit={save}>
      <input type="number" step="0.01" min="0" autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label="Novo valor" />
      <button className="btn primary" disabled={busy}>OK</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
      {err && <span className="late small">{err}</span>}
    </form>
  )
}
