import { useEffect, useMemo, useState } from 'react'
import { apiClient, type TodoComment, type TodoItem, type Topic, type UserAccount } from '../services/api'
import './TaskDetailModal.css'

interface TaskDetailModalProps {
  todo: TodoItem
  userId: string
  nickname: string
  topics?: Topic[]
  refreshToken?: number
  onClose: () => void
  onUpdated: (todo: TodoItem) => void
}

export default function TaskDetailModal({ todo, userId, nickname, topics = [], refreshToken = 0, onClose, onUpdated }: TaskDetailModalProps) {
  const [users, setUsers] = useState<UserAccount[]>([])
  const [comments, setComments] = useState<TodoComment[]>([])
  const [title, setTitle] = useState(todo.title)
  const [description, setDescription] = useState(todo.description ?? '')
  const [comment, setComment] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([apiClient.getUsers(), apiClient.getTodoComments(todo.id)])
      .then(([userData, commentData]) => {
        setUsers(userData.some((user) => user.id === userId) ? userData : [...userData, { id: userId, nickname, created_at: '', updated_at: '' }])
        setComments(commentData)
        setTitle(todo.title)
        setDescription(todo.description ?? '')
      })
      .catch(() => {
        setUsers([{ id: userId, nickname, created_at: '', updated_at: '' }])
        setError('詳細情報の一部を読み込めませんでした')
      })
  }, [todo.id, todo.title, todo.description, userId, nickname, refreshToken])

  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.nickname])), [users])
  const creatorName = userNames.get(todo.user_id) ?? (todo.user_id === userId ? nickname : '不明なユーザー')

  const updateTodo = async (updates: Partial<TodoItem>, success: (updated: TodoItem) => void) => {
    setIsSaving(true)
    setError(null)
    try {
      const updated = await apiClient.updateTodo(todo.id, updates)
      onUpdated(updated)
      success(updated)
    } catch {
      setError('タスクを更新できませんでした')
    } finally {
      setIsSaving(false)
    }
  }

  const saveTitle = () => {
    const value = title.trim()
    if (!value || isSaving) return
    if (value === todo.title) { setIsEditingTitle(false); return }
    updateTodo({ title: value }, (updated) => { setTitle(updated.title); setIsEditingTitle(false) })
  }

  const saveDescription = () => {
    updateTodo({ description: description.trim() }, (updated) => setDescription(updated.description ?? ''))
  }

  const changeAssignee = (assigneeId: string) => {
    updateTodo({ assignee_id: assigneeId || null }, () => undefined)
  }

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = comment.trim()
    if (!body || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      const created = await apiClient.createTodoComment(todo.id, userId, body)
      setComments((items) => [...items, created])
      setComment('')
    } catch {
      setError('コメントを追加できませんでした')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="task-detail-backdrop" onMouseDown={onClose}>
      <section className="task-detail-modal" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="task-detail-header">
          <span className="task-detail-key">TASK-{todo.id.slice(0, 3).toUpperCase()}</span>
          <button onClick={onClose} aria-label="タスク詳細を閉じる">×</button>
        </header>
        <div className="task-detail-content">
          <main>
            {isEditingTitle ? (
              <div className="task-detail-title-editor"><input id="task-detail-title" autoFocus aria-label="詳細のタスク名" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) saveTitle(); if (event.key === 'Escape') { setTitle(todo.title); setIsEditingTitle(false) } }} disabled={isSaving} /><button onClick={saveTitle} disabled={!title.trim() || isSaving}>保存</button></div>
            ) : <button className="task-detail-title" onClick={() => setIsEditingTitle(true)} aria-label="タスク名を編集"><h2 id="task-detail-title">{todo.title}</h2><span>✎</span></button>}

            <section className="task-detail-section"><h3>説明</h3><textarea aria-label="説明" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="説明を追加してください" disabled={isSaving}/><button className="detail-save-button" onClick={saveDescription} disabled={isSaving || description.trim() === (todo.description ?? '')}>説明を保存</button></section>

            <section className="task-detail-section"><h3>トピック</h3><select aria-label="トピック" value={todo.topic_id ?? ''} onChange={(event) => updateTodo({ topic_id: event.target.value || null }, () => undefined)} disabled={isSaving}><option value="">未設定</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></section>

            <section className="task-detail-section"><h3>コメント</h3><div className="comment-list">{comments.length ? comments.map((item) => <article key={item.id}><span>{Array.from(item.nickname ?? userNames.get(item.user_id) ?? '?')[0]}</span><div><strong>{item.nickname ?? userNames.get(item.user_id) ?? '不明なユーザー'}</strong><p>{item.body}</p></div></article>) : <p className="empty-comments">コメントはまだありません</p>}</div><form className="comment-form" onSubmit={addComment}><textarea aria-label="コメント" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="コメントを追加する…" disabled={isSaving}/><button type="submit" disabled={!comment.trim() || isSaving}>追加</button></form></section>
            {error && <p className="task-detail-error" role="alert">{error}</p>}
          </main>

          <aside>
            <h3>詳細</h3>
            <dl><div><dt>担当者</dt><dd><select aria-label="担当者" value={todo.assignee_id ?? ''} onChange={(event) => changeAssignee(event.target.value)} disabled={isSaving}><option value="">未割り当て</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nickname}</option>)}</select></dd></div><div><dt>作成者</dt><dd><span className="detail-avatar">{Array.from(creatorName)[0]}</span>{creatorName}</dd></div><div><dt>状態</dt><dd>{todo.column_name}</dd></div><div><dt>作成日</dt><dd>{new Date(todo.created_at).toLocaleDateString('ja-JP')}</dd></div></dl>
          </aside>
        </div>
      </section>
    </div>
  )
}
