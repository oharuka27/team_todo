import { useEffect, useState, type FormEvent } from 'react'
import { apiClient, type Project, type ProjectMember } from '../services/api'
import Modal, { ModalHeader } from './Modal'

interface MemberDialogProps {
  project: Project
  mode: 'add' | 'remove'
  onAdded?: (members: ProjectMember[]) => void
  onClose: () => void
}

interface Candidate {
  id: string
  nickname: string
  avatarColor?: string
}

const loadCandidates = async (project: Project, mode: 'add' | 'remove'): Promise<Candidate[]> => {
  const members = await apiClient.getProjectMembers(project.id)
  if (mode === 'remove') {
    return members
      .filter((member) => member.role === 'member')
      .map((member) => ({ id: member.user_id, nickname: member.nickname, avatarColor: member.avatar_color }))
  }
  const memberIds = new Set([project.owner_id, ...members.map((member) => member.user_id)])
  const users = await apiClient.getUsers()
  return users
    .filter((user) => !memberIds.has(user.id))
    .map((user) => ({ id: user.id, nickname: user.nickname, avatarColor: user.avatar_color }))
}

/** Lets the project owner add users to, or remove members from, a project. */
export default function MemberDialog({ project, mode, onAdded, onClose }: MemberDialogProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actionLabel = mode === 'add' ? '追加' : '削除'
  const canSubmit = selectedIds.length > 0 && !isUpdating && (mode === 'add' || confirmation === '削除')
  const close = () => { if (!isUpdating) onClose() }

  useEffect(() => {
    let active = true
    loadCandidates(project, mode)
      .then((items) => { if (active) setCandidates(items) })
      .catch(() => { if (active) setError('メンバーリストを取得できませんでした。') })
    return () => { active = false }
  }, [mode, project])

  const toggle = (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setIsUpdating(true)
    setError(null)
    try {
      if (mode === 'add') {
        // Call the API before onAdded?.(): optional chaining would skip evaluating its arguments.
        const added = await Promise.all(selectedIds.map((id) => apiClient.addProjectMember(project.id, id)))
        onAdded?.(added)
      } else {
        await Promise.all(selectedIds.map((id) => apiClient.removeProjectMember(project.id, id)))
      }
      onClose()
    } catch {
      setError(`メンバーを${actionLabel}できませんでした。`)
      setIsUpdating(false)
    }
  }

  return (
    <Modal titleId="member-dialog-title" className="member-modal" onDismiss={close}>
      <ModalHeader
        eyebrow="PROJECT MEMBERS"
        title={`メンバーを${actionLabel}`}
        titleId="member-dialog-title"
        danger={mode === 'remove'}
        subtitle={`「${project.name}」`}
        onClose={close}
        closeDisabled={isUpdating}
      />
      <form onSubmit={submit}>
        <div className="member-selection" role="group" aria-label="メンバーリスト">
          {candidates.length ? candidates.map((candidate) => (
            <label key={candidate.id}>
              <input type="checkbox" checked={selectedIds.includes(candidate.id)} onChange={() => toggle(candidate.id)} disabled={isUpdating} />
              <span className="member-avatar" style={candidate.avatarColor ? { backgroundColor: candidate.avatarColor, color: '#fff' } : undefined}>
                {Array.from(candidate.nickname)[0]?.toUpperCase() || '?'}
              </span>
              <strong>{candidate.nickname}</strong>
            </label>
          )) : <p>選択できるメンバーはいません。</p>}
        </div>
        {mode === 'remove' && (
          <>
            <p className="delete-warning">選択したメンバーをプロジェクトから削除します。この操作を実行するには「削除」と入力してください。</p>
            <label>確認入力<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isUpdating} /></label>
          </>
        )}
        {error && <p className="delete-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close} disabled={isUpdating}>キャンセル</button>
          <button type="submit" className={mode === 'remove' ? 'danger-button' : 'primary-button'} disabled={!canSubmit}>
            {isUpdating ? '処理中…' : mode === 'add' ? '追加' : '実行'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
