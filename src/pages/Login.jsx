import { useState } from 'react'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) setError(traduzErro(error.message))
    } else {
      const { data, error } = await signUp(email, password)
      if (error) {
        setError(traduzErro(error.message))
      } else if (!data.session) {
        setInfo('Cadastro feito! Confirme seu e-mail pelo link que enviamos e depois entre.')
        setMode('login')
      }
    }
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <ThemeToggle className="theme-fab" />
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Controle de Finanças</h1>
        <p className="muted">
          {mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta'}
        </p>

        <label>
          E-mail
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="msg error">{error}</p>}
        {info && <p className="msg ok">{info}</p>}

        <button className="btn primary" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
        </button>

        <button
          type="button"
          className="btn link"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError('')
            setInfo('')
          }}
        >
          {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  )
}

function traduzErro(msg) {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/already registered/i.test(msg)) return 'Este e-mail já está cadastrado.'
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.'
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.'
  return msg
}
