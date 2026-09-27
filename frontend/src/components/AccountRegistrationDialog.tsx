import { useState, type FormEvent } from 'react'
import { apiClient, type UserAccount } from '../services/api'
import Icon from './Icon'
import Modal from './Modal'

interface AccountRegistrationDialogProps {
  initialError: string | null
  onRegistered: (account: UserAccount) => void
}

/** Shown after the first Clerk sign-in, before the user has a nickname in Team Todo. */
export default function AccountRegistrationDialog({ initialError, onRegistered }: AccountRegistrationDialogProps) {
  const [nickname, setNickname] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<string | null>(initialError)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = nickname.trim()
    if (!value || isRegistering) return
    setIsRegistering(true)
    setError(null)
    try {
      onRegistered(await apiClient.registerUser(value))
    } catch {
      setError('アカウントを登録できませんでした。バックエンドへの接続を確認して、もう一度お試しください。')
      setIsRegistering(false)
    }
  }

  return (
    <Modal titleId="account-registration-title" className="account-modal" backdropClassName="account-backdrop">
      <div className="account-symbol">
        <Icon size={28}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></Icon>
      </div>
      <div className="account-heading">
        <span className="eyebrow">WELCOME</span>
        <h2 id="account-registration-title">アカウント登録</h2>
        <p>はじめに、Team Todoで使用するニックネームを入力してください。</p>
      </div>
      <form onSubmit={submit}>
        <label>
          ニックネーム
          <input autoFocus maxLength={40} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例：山田" disabled={isRegistering} />
        </label>
        <p className="account-hint">先頭の1文字がタスクのアサイン表示に使用されます。</p>
        {error && <p className="delete-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button account-submit" disabled={!nickname.trim() || isRegistering}>
          {isRegistering ? '登録中…' : '登録する'}
        </button>
      </form>
    </Modal>
  )
}
