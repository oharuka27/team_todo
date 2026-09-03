import { useEffect, useMemo, useState } from 'react'
import { apiClient, type BoardColumn, type Project, type TodoItem } from '../services/api'
import '../styles/ProjectPage.css'

interface ProjectPageProps { project: Project; userId: string; nickname: string; onProjectUpdated: (project: Project) => void }
const defaultColumns = (): BoardColumn[] => [
  { id: 'todo', title: 'To Do', position: 0 }, { id: 'progress', title: 'In Progress', position: 1 },
  { id: 'review', title: 'In Review', position: 2 }, { id: 'done', title: 'Done', position: 3 },
]
const SearchIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>

export default function ProjectPage({ project, userId, nickname, onProjectUpdated }: ProjectPageProps) {
  const nicknameInitial = Array.from(nickname)[0]?.toUpperCase() || '?'
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [columns, setColumns] = useState<BoardColumn[]>(defaultColumns())
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newTodoText, setNewTodoText] = useState('')
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editingColumnText, setEditingColumnText] = useState('')
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingTodoText, setEditingTodoText] = useState('')
  const [savingTodoId, setSavingTodoId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [isEditingProjectName, setIsEditingProjectName] = useState(false)
  const [projectName, setProjectName] = useState(project.name)
  const [isSavingProjectName, setIsSavingProjectName] = useState(false)

  useEffect(() => {
    Promise.all([apiClient.getTodos(project.id), apiClient.getColumns(project.id)])
      .then(([todoData, columnData]) => { setTodos(todoData); setColumns(columnData.length ? columnData : defaultColumns()) })
      .catch(() => { setTodos([]); setColumns(defaultColumns()); setNotice('オフラインモードで表示しています') })
      .finally(() => setLoading(false))
  }, [project.id])

  const filteredTodos = useMemo(() => todos.filter((todo) => todo.title.toLowerCase().includes(query.toLowerCase())), [todos, query])
  const columnTodos = (title: string) => filteredTodos.filter((todo) => todo.column_name === title)

  const addTodo = async (columnTitle: string) => {
    if (!newTodoText.trim()) return
    const title = newTodoText.trim()
    const now = new Date().toISOString()
    const temporaryId = `pending-${crypto.randomUUID()}`
    const temporaryTodo: TodoItem = {
      id: temporaryId,
      project_id: project.id,
      title,
      status: 'not_started',
      column_name: columnTitle,
      user_id: userId,
      created_at: now,
      updated_at: now,
    }

    setTodos((items) => [...items, temporaryTodo])
    setNewTodoText('')
    setAddingTo(null)

    try {
      const created = await apiClient.createTodo(project.id, title, columnTitle, userId)
      setTodos((items) => items.map((todo) => todo.id === temporaryId ? created : todo))
    } catch {
      setTodos((items) => items.map((todo) => todo.id === temporaryId ? { ...todo, id: crypto.randomUUID() } : todo))
    }
  }
  const deleteTodo = async (id: string) => { setTodos((items) => items.filter((todo) => todo.id !== id)); try { await apiClient.deleteTodo(id) } catch { /* local fallback */ } }
  const moveTodo = async (id: string, columnName: string) => {
    const previous = todos; setTodos((items) => items.map((todo) => todo.id === id ? { ...todo, column_name: columnName } : todo))
    try { await apiClient.updateTodo(id, { column_name: columnName }) } catch { setTodos(previous) }
  }
  const startTodoEdit = (todo: TodoItem) => {
    setEditingTodoId(todo.id)
    setEditingTodoText(todo.title)
  }
  const cancelTodoEdit = () => {
    if (savingTodoId) return
    setEditingTodoId(null)
    setEditingTodoText('')
  }
  const saveTodoTitle = async (todo: TodoItem) => {
    const title = editingTodoText.trim()
    if (!title || savingTodoId) return
    if (title === todo.title) { cancelTodoEdit(); return }
    setSavingTodoId(todo.id)
    setNotice(null)
    try {
      const updated = await apiClient.updateTodo(todo.id, { title })
      setTodos((items) => items.map((item) => item.id === todo.id ? updated : item))
      setEditingTodoId(null)
      setEditingTodoText('')
    } catch {
      setNotice('タスク名を更新できませんでした')
    } finally {
      setSavingTodoId(null)
    }
  }
  const saveColumn = async (column: BoardColumn) => {
    const title = editingColumnText.trim(); if (!title) return
    const oldTitle = column.title
    setColumns((items) => items.map((item) => item.id === column.id ? { ...item, title } : item)); setTodos((items) => items.map((todo) => todo.column_name === oldTitle ? { ...todo, column_name: title } : todo)); setEditingColumnId(null)
    try { await apiClient.updateColumn(column.id, title) } catch { /* local fallback */ }
  }

  const cancelProjectNameEdit = () => {
    if (isSavingProjectName) return
    setProjectName(project.name)
    setIsEditingProjectName(false)
  }
  const saveProjectName = async () => {
    const name = projectName.trim()
    if (!name || isSavingProjectName) return
    if (name === project.name) { cancelProjectNameEdit(); return }
    setIsSavingProjectName(true)
    setNotice(null)
    try {
      const updated = await apiClient.updateProject(project.id, { name })
      onProjectUpdated(updated)
      setProjectName(updated.name)
      setIsEditingProjectName(false)
    } catch {
      setNotice('プロジェクト名を更新できませんでした')
    } finally {
      setIsSavingProjectName(false)
    }
  }

  return (
    <section className="board-page">
      <header className="board-header">
        <div><span className="breadcrumb">プロジェクト / {project.name}</span>
          {isEditingProjectName ? (
            <div className="project-name-editor">
              <input autoFocus aria-label="プロジェクト名" value={projectName} onChange={(event) => setProjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) saveProjectName(); if (event.key === 'Escape') cancelProjectNameEdit() }} disabled={isSavingProjectName} />
              <button onClick={saveProjectName} aria-label="プロジェクト名を保存" disabled={!projectName.trim() || isSavingProjectName}>✓</button>
              <button onClick={cancelProjectNameEdit} aria-label="プロジェクト名の変更をキャンセル" disabled={isSavingProjectName}>×</button>
            </div>
          ) : <button className="project-name-button" onClick={() => { setProjectName(project.name); setIsEditingProjectName(true) }} aria-label="プロジェクト名を変更"><h1>{project.name}</h1></button>}
          {project.description && <p>{project.description}</p>}
        </div>
        <div className="member-stack"><span>YT</span><span>KM</span><button aria-label="メンバーを追加">＋</button></div>
      </header>
      <div className="board-toolbar">
        <div className="search-box"><SearchIcon/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ボードを検索" /></div>
        <div className="board-label"><span className="board-dot"/> ボード</div>{notice && <span className="offline-notice">{notice}</span>}
      </div>
      {loading ? <div className="board-loading"><span/><p>ボードを読み込んでいます…</p></div> : (
        <div className="kanban-board">
          {columns.map((column, index) => (
            <article className={`kanban-column column-${index % 4}`} key={column.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('todo-id'); if (id) moveTodo(id, column.title) }}>
              <div className="column-header">
                {editingColumnId === column.id ? <input className="column-title-input" value={editingColumnText} onChange={(e) => setEditingColumnText(e.target.value)} onBlur={() => saveColumn(column)} onKeyDown={(e) => { if (e.key === 'Enter') saveColumn(column); if (e.key === 'Escape') setEditingColumnId(null) }} autoFocus /> : <button className="column-title" onDoubleClick={() => { setEditingColumnId(column.id); setEditingColumnText(column.title) }} title="ダブルクリックで名前を編集"><span>{column.title}</span><b>{columnTodos(column.title).length}</b></button>}
                <button className="more-button" aria-label="列のメニュー">•••</button>
              </div>
              <div className="todo-list">
                {columnTodos(column.title).map((todo) => (
                  <div className={`todo-card ${editingTodoId === todo.id ? 'editing' : ''}`} key={todo.id} draggable={editingTodoId !== todo.id} onDragStart={(e) => e.dataTransfer.setData('todo-id', todo.id)}>
                    {editingTodoId === todo.id ? (
                      <form className="todo-title-editor" onSubmit={(event) => { event.preventDefault(); saveTodoTitle(todo) }}>
                        <input autoFocus aria-label="タスク名" value={editingTodoText} onChange={(event) => setEditingTodoText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancelTodoEdit() }} disabled={savingTodoId === todo.id} />
                        <div><button type="submit" aria-label="タスク名を保存" disabled={!editingTodoText.trim() || savingTodoId === todo.id}>✓</button><button type="button" aria-label="タスク名の変更をキャンセル" onClick={cancelTodoEdit} disabled={savingTodoId === todo.id}>×</button></div>
                      </form>
                    ) : <><div className="todo-actions"><button className="delete-todo" onClick={() => deleteTodo(todo.id)} aria-label={`${todo.title}を削除`}>×</button></div><div className="todo-title-row"><p>{todo.title}</p><button className="edit-todo" onClick={() => startTodoEdit(todo)} aria-label={`${todo.title}を編集`}>✎</button></div></>}
                    <div className="card-meta"><span className="task-type">✓</span><span className="task-id">TASK-{todo.id.slice(0, 3).toUpperCase()}</span><span className="mini-avatar" title={`担当: ${nickname}`}>{nicknameInitial}</span></div>
                  </div>
                ))}
                {columnTodos(column.title).length === 0 && addingTo !== column.id && <div className="empty-column">ここにタスクを追加、またはドラッグ</div>}
              </div>
              {addingTo === column.id ? (
                <form className="inline-add" onSubmit={(e) => { e.preventDefault(); addTodo(column.title) }}>
                  <textarea
                    autoFocus
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        addTodo(column.title)
                      }
                      if (e.key === 'Escape') setAddingTo(null)
                    }}
                    placeholder="タスク名を入力"
                  />
                  <div><button type="submit">追加</button><button type="button" onClick={() => setAddingTo(null)}>キャンセル</button></div>
                </form>
              ) : (
                <button className="add-task" onClick={() => { setAddingTo(column.id); setNewTodoText('') }}><span>＋</span> タスクを追加</button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
