import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function AccountSettings({ onClose }) {
  const { user, recovery, clearRecovery, sendPasswordEmail, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function close() {
    if (recovery) clearRecovery()
    onClose()
  }

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function handleSend() {
    setBusy(true); setError(''); setInfo('')
    const { error } = await sendPasswordEmail(user.email)
    setBusy(false)
    if (error) setError(traduz(error.message))
    else setInfo(`Enviamos um link de confirmação para ${user.email}. Abra o e-mail e clique no link para definir a nova senha.`)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError(''); setInfo('')
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    if (password !== confirm) return setError('As senhas não conferem.')
    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) return setError(traduz(error.message))
    clearRecovery()
    setPassword(''); setConfirm('')
    setInfo('Senha alterada com sucesso.')
  }

  return (
    <div className="modal-back" onClick={close}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Configurações da conta" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h1>Configurações da conta</h1>
          <button className="btn icon" aria-label="Fechar" onClick={close}>×</button>
        </div>

        <div>
          <p className="label">E-mail</p>
          <p>{user?.email}</p>
        </div>

        {recovery ? (
          <form className="form-grid" onSubmit={handleSave}>
            <p className="label span-2">E-mail confirmado. Defina sua nova senha.</p>
            <label className="span-2">Nova senha
              <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="span-2">Repita a nova senha
              <input type="password" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <button className="btn primary span-2" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
          </form>
        ) : (
          <div className="form-grid">
            <div className="span-2">
              <p className="label">Senha</p>
              <p className="muted small">Para trocar a senha, confirmamos por e-mail: você recebe um link e define a nova senha ao abri-lo.</p>
            </div>
            <button className="btn primary span-2" onClick={handleSend} disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar e-mail de confirmação'}
            </button>
          </div>
        )}

        {error && <p className="msg error">{error}</p>}
        {info && <p className="msg ok">{info}</p>}
      </div>
    </div>
  )
}

function traduz(msg) {
  if (/different from the old/i.test(msg)) return 'A nova senha precisa ser diferente da atual.'
  if (/at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/rate limit|seconds|too many/i.test(msg)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
  return msg
}
