import { useState } from 'react'
import type { TodoItem } from '../services/api'
import { avatarTextColor } from '../utils/avatar'

export interface AssigneeBadge { initial: string; name: string; color: string; unassigned: boolean }
export interface TopicBadge { name: string; color: string; unassigned: boolean }

interface TodoCardProps {
  todo: TodoItem
  assignee: AssigneeBadge
  topic: TopicBadge
  onOpen: () => void
  onDelete: () => void
  /** Saves the new title; rejects if it could not be saved. */
  onRename: (title: string) => Promise<void>
}

export default function TodoCard({ todo, assignee, topic, onOpen, onDelete, onRename }: TodoCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(todo.title)
  const [isSaving, setIsSaving] = useState(false)

  const cancel = () => {
    if (isSaving) return
    setIsEditing(false)
  }

  const save = async () => {
    const value = title.trim()
    if (!value || isSaving) return
    if (value === todo.title) {
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
    <div
      className={`todo-card ${isEditing ? 'editing' : ''}`}
      draggable={!isEditing}
      role="button"
      tabIndex={0}
      aria-label={`${todo.title}の詳細を開く`}
      onClick={() => { if (!isEditing) onOpen() }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpen()
        }
      }}
      onDragStart={(event) => event.dataTransfer.setData('todo-id', todo.id)}
    >
      {isEditing ? (
        <form className="todo-title-editor" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <input autoFocus aria-label="タスク名" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancel() }} disabled={isSaving} />
          <div>
            <button type="submit" aria-label="タスク名を保存" disabled={!title.trim() || isSaving}>✓</button>
            <button type="button" aria-label="タスク名の変更をキャンセル" onClick={cancel} disabled={isSaving}>×</button>
          </div>
        </form>
      ) : (
        <>
          <div className="todo-actions">
            <button className="delete-todo" onClick={(event) => { event.stopPropagation(); onDelete() }} aria-label={`${todo.title}を削除`}>×</button>
          </div>
          <div className="todo-title-row">
            <p>{todo.title}</p>
            <button className="edit-todo" onClick={(event) => { event.stopPropagation(); setTitle(todo.title); setIsEditing(true) }} aria-label={`${todo.title}を編集`}>✎</button>
          </div>
        </>
      )}
      <div className="card-meta">
        <span className="task-type">✓</span>
        <span className="task-id">TASK-{todo.id.slice(0, 3).toUpperCase()}</span>
        <span
          className={`todo-topic-label ${topic.unassigned ? 'unassigned' : ''}`}
          style={topic.unassigned ? undefined : { color: topic.color, backgroundColor: `${topic.color}18`, borderColor: `${topic.color}55` }}
          title={`トピック: ${topic.name}`}
        >
          <i style={topic.unassigned ? undefined : { backgroundColor: topic.color }} />
          {topic.name}
        </span>
        <span
          className={`mini-avatar ${assignee.unassigned ? 'unassigned' : ''}`}
          style={assignee.unassigned ? undefined : { backgroundColor: assignee.color, color: avatarTextColor(assignee.color) }}
          title={`担当: ${assignee.name}`}
        >
          {assignee.initial}
        </span>
      </div>
    </div>
  )
}
