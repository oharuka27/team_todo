import { useState, type FormEvent } from 'react'
import Modal, { ModalHeader } from './Modal'

interface ConfirmTextDialogProps {
  eyebrow: string
  title: string
  warning: string
  /** The word the user must type to enable the action. */
  confirmWord: string
  busyLabel: string
  errorMessage: string
  className?: string
  onConfirm: () => Promise<void>
  onClose: () => void
}

/** A destructive action that is only enabled after the user types a confirmation word. */
export default function ConfirmTextDialog({ eyebrow, title, warning, confirmWord, busyLabel, errorMessage, className, onConfirm, onClose }: ConfirmTextDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (!isBusy) onClose() }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (confirmation !== confirmWord || isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch {
      setError(errorMessage)
      setIsBusy(false)
    }
  }

  return (
    <Modal titleId="confirm-dialog-title" className={className} onDismiss={close}>
      <ModalHeader eyebrow={eyebrow} title={title} titleId="confirm-dialog-title" danger onClose={close} closeDisabled={isBusy} />
      <form onSubmit={submit}>
        <p className="delete-warning">{warning}</p>
        <label>
          確認のため「{confirmWord}」と入力して実行ボタンを押してください。
          <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isBusy} />
        </label>
        {error && <p className="delete-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close} disabled={isBusy}>キャンセル</button>
          <button type="submit" className="danger-button" disabled={confirmation !== confirmWord || isBusy}>{isBusy ? busyLabel : '実行'}</button>
        </div>
      </form>
    </Modal>
  )
}
