import { useState, type FormEvent } from 'react'
import { apiClient, type Project } from '../services/api'
import Modal, { ModalHeader } from './Modal'

export default function CreateProjectDialog({ onCreated, onClose }: { onCreated: (project: Project) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || isCreating) return
    setIsCreating(true)
    setError(null)
    try {
      onCreated(await apiClient.createProject(name.trim(), undefined))
    } catch {
      setError('プロジェクトを作成できませんでした。時間をおいてもう一度お試しください。')
      setIsCreating(false)
    }
  }

  return (
    <Modal titleId="create-project-title" onDismiss={onClose}>
      <ModalHeader eyebrow="NEW PROJECT" title="プロジェクトを追加" titleId="create-project-title" onClose={onClose} />
      <form onSubmit={submit}>
        <label>
          プロジェクト名
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例：Webサイトリニューアル" />
        </label>
        <p className="enter-hint">Enterキーでも作成できます</p>
        {error && <p className="delete-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>キャンセル</button>
          <button type="submit" className="primary-button" disabled={!name.trim() || isCreating}>{isCreating ? '作成中…' : '決定'}</button>
        </div>
      </form>
    </Modal>
  )
}
