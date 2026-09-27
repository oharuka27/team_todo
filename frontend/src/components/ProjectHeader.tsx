import { useState } from 'react'
import type { Project, ProjectMember } from '../services/api'
import { DEFAULT_AVATAR_COLOR, initialOf } from '../utils/avatar'

interface ProjectHeaderProps {
  project: Project
  isOwner: boolean
  members: ProjectMember[]
  /** Saves the new name; rejects if it could not be saved. */
  onRename: (name: string) => Promise<void>
  onAddMember: () => void
}

export default function ProjectHeader({ project, isOwner, members, onRename, onAddMember }: ProjectHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [isSaving, setIsSaving] = useState(false)

  const cancel = () => {
    if (isSaving) return
    setName(project.name)
    setIsEditing(false)
  }

  const save = async () => {
    const value = name.trim()
    if (!value || isSaving) return
    if (value === project.name) {
      cancel()
      return
    }
    setIsSaving(true)
    try {
      await onRename(value)
      setIsEditing(false)
    } catch {
      // The page shows the error notice; keep the editor open for another try.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <header className="board-header">
      <div>
        <span className="breadcrumb">プロジェクト / {project.name}</span>
        {isEditing ? (
          <div className="project-name-editor">
            <input
              autoFocus
              aria-label="プロジェクト名"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) void save()
                if (event.key === 'Escape') cancel()
              }}
              disabled={isSaving}
            />
            <button onClick={() => void save()} aria-label="プロジェクト名を保存" disabled={!name.trim() || isSaving}>✓</button>
            <button onClick={cancel} aria-label="プロジェクト名の変更をキャンセル" disabled={isSaving}>×</button>
          </div>
        ) : isOwner ? (
          <button className="project-name-button" onClick={() => { setName(project.name); setIsEditing(true) }} aria-label="プロジェクト名を変更">
            <h1>{project.name}</h1>
          </button>
        ) : (
          <h1>{project.name}</h1>
        )}
        {project.description && <p>{project.description}</p>}
      </div>
      <div className="member-stack" aria-label="プロジェクトメンバー">
        {members.map((member) => (
          <span key={member.user_id} style={{ backgroundColor: member.avatar_color || DEFAULT_AVATAR_COLOR }} title={`${member.nickname}（${member.role === 'owner' ? 'オーナー' : 'メンバー'}）`}>
            {initialOf(member.nickname)}
          </span>
        ))}
        {isOwner && <button aria-label="メンバーを追加" onClick={onAddMember}>＋</button>}
      </div>
    </header>
  )
}
