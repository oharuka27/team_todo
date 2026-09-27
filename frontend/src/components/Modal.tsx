import type { ReactNode } from 'react'

interface ModalProps {
  titleId: string
  className?: string
  backdropClassName?: string
  /** Called when the backdrop is clicked. Omit for dialogs that must be answered explicitly. */
  onDismiss?: () => void
  children: ReactNode
}

export default function Modal({ titleId, className = '', backdropClassName = '', onDismiss, children }: ModalProps) {
  return (
    <div className={`modal-backdrop ${backdropClassName}`} onMouseDown={onDismiss}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

interface ModalHeaderProps {
  eyebrow: string
  title: ReactNode
  titleId: string
  danger?: boolean
  subtitle?: ReactNode
  onClose: () => void
  closeDisabled?: boolean
}

export function ModalHeader({ eyebrow, title, titleId, danger = false, subtitle, onClose, closeDisabled }: ModalHeaderProps) {
  return (
    <div className="modal-header">
      <div>
        <span className={`eyebrow ${danger ? 'danger-eyebrow' : ''}`}>{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button className="icon-button" aria-label="閉じる" onClick={onClose} disabled={closeDisabled}>×</button>
    </div>
  )
}
