import { useEffect } from 'react'

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal wide" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h1>{title}</h1>
          <button className="btn icon" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
