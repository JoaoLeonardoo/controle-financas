import { useState } from 'react'

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light')
  const dark = theme === 'dark'

  function toggle() {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch { /* sem armazenamento: vale só nesta sessão */ }
    setTheme(next)
  }

  return (
    <button type="button" className={'btn ' + className} onClick={toggle}
      aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'} title={dark ? 'Modo claro' : 'Modo escuro'}>
      {dark ? '☀' : '☾'}
    </button>
  )
}
