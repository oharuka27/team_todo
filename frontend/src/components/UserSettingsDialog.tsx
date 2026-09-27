import { useState, type FormEvent } from 'react'
import { apiClient, type UserAccount } from '../services/api'
import Modal, { ModalHeader } from './Modal'

interface UserSettingsDialogProps {
  userId: string
  nickname: string
  avatarColor: string
  onSaved: (account: UserAccount) => void
  onClose: () => void
}

export default function UserSettingsDialog({ userId, nickname, avatarColor, onSaved, onClose }: UserSettingsDialogProps) {
  const [name, setName] = useState(nickname)
  const [color, setColor] = useState(avatarColor)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (!isSaving) onClose() }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      onSaved(await apiClient.updateUser(userId, name.trim(), color))
    } catch {
      setError('ユーザー設定を保存できませんでした。')
      setIsSaving(false)
    }
  }

  return (
    <Modal titleId="user-settings-title" className="user-settings-modal" onDismiss={close}>
      <ModalHeader eyebrow="USER SETTINGS" title="ユーザー設定" titleId="user-settings-title" onClose={close} closeDisabled={isSaving} />
      <form onSubmit={submit}>
        <label>
          ユーザー名
          <input autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} />
        </label>
        <fieldset className="color-settings">
          <legend>アイコンの背景色</legend>
          <div className="color-preview">
            <span className="avatar" style={{ backgroundColor: color }}>{Array.from(name.trim() || nickname)[0]?.toUpperCase() || '?'}</span>
            <input type="color" aria-label="アイコンの背景色" value={color} onChange={(event) => setColor(event.target.value)} disabled={isSaving} />
            <code>{color}</code>
          </div>
        </fieldset>
        {error && <p className="delete-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close} disabled={isSaving}>キャンセル</button>
          <button type="submit" className="primary-button" disabled={!name.trim() || isSaving}>{isSaving ? '保存中…' : '保存'}</button>
        </div>
      </form>
    </Modal>
  )
}
