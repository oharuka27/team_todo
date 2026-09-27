import type { ReactNode } from 'react'
import Modal from './Modal'

interface NoticeDialogProps {
  titleId: string
  title: string
  icon: ReactNode
  symbolClassName?: string
  messages: Array<{ key: string; text: string }>
  error?: string | null
  onAcknowledge: () => void
}

/** A notice that blocks the workspace until the user presses OK. */
export default function NoticeDialog({ titleId, title, icon, symbolClassName = '', messages, error, onAcknowledge }: NoticeDialogProps) {
  return (
    <Modal titleId={titleId} className="invitation-modal" backdropClassName="invitation-backdrop">
      <span className={`account-symbol ${symbolClassName}`}>{icon}</span>
      <h2 id={titleId}>{title}</h2>
      <ul>
        {messages.map((message) => <li key={message.key}>{message.text}</li>)}
      </ul>
      {error && <p className="delete-error" role="alert">{error}</p>}
      <button className="primary-button invitation-ok" onClick={onAcknowledge}>OK</button>
    </Modal>
  )
}
