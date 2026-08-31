import { useState, useEffect } from 'react'
import { apiClient, type TodoItem, type BoardColumn } from '../services/api'
import '../styles/ProjectPage.css'

interface ProjectPageProps {
  projectId: string
  userId: string
  onBack: () => void
}

export default function ProjectPage({ projectId, userId, onBack }: ProjectPageProps) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [columns, setColumns] = useState<BoardColumn[]>([])
  const [newTodoText, setNewTodoText] = useState('')
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editingColumnText, setEditingColumnText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [projectId])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [todosData, columnsData] = await Promise.all([
        apiClient.getTodos(projectId),
        apiClient.getColumns(projectId),
      ])
      setTodos(todosData)
      setColumns(columnsData.length > 0 ? columnsData : getDefaultColumns())
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setError('データの読み込みに失敗しました')
      // Use mock data as fallback
      setTodos([])
      setColumns(getDefaultColumns())
    } finally {
      setLoading(false)
    }
  }

  const getDefaultColumns = (): BoardColumn[] => [
    { id: '1', title: '未着手', position: 0 },
    { id: '2', title: '着手中', position: 1 },
    { id: '3', title: '完了', position: 2 },
  ]

  const handleAddTodo = async (columnTitle: string) => {
    if (!newTodoText.trim()) return

    try {
      const newTodo = await apiClient.createTodo(
        projectId,
        newTodoText,
        columnTitle,
        userId
      )
      setTodos([...todos, newTodo])
      setNewTodoText('')
    } catch (err) {
      console.error('Failed to create todo:', err)
      // Fallback to mock todo
      const mockTodo: TodoItem = {
        id: Math.random().toString(36).slice(2, 9),
        project_id: projectId,
        title: newTodoText,
        status: 'not_started',
        column_name: columnTitle,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setTodos([...todos, mockTodo])
      setNewTodoText('')
    }
  }

  const handleDeleteTodo = async (todoId: string) => {
    try {
      await apiClient.deleteTodo(todoId)
      setTodos(todos.filter((t) => t.id !== todoId))
    } catch (err) {
      console.error('Failed to delete todo:', err)
      // Still remove from UI as fallback
      setTodos(todos.filter((t) => t.id !== todoId))
    }
  }

  const handleStartEditColumn = (columnId: string, currentTitle: string) => {
    setEditingColumnId(columnId)
    setEditingColumnText(currentTitle)
  }

  const handleSaveColumnTitle = async (columnId: string) => {
    if (!editingColumnText.trim()) return

    try {
      await apiClient.updateColumn(columnId, editingColumnText)
      const oldTitle = columns.find((c) => c.id === columnId)?.title
      setColumns(
        columns.map((col) =>
          col.id === columnId ? { ...col, title: editingColumnText } : col
        )
      )
      if (oldTitle) {
        setTodos(
          todos.map((todo) =>
            todo.column_name === oldTitle
              ? { ...todo, column_name: editingColumnText }
              : todo
          )
        )
      }
    } catch (err) {
      console.error('Failed to update column:', err)
      // Still update UI as fallback
      const oldTitle = columns.find((c) => c.id === columnId)?.title
      setColumns(
        columns.map((col) =>
          col.id === columnId ? { ...col, title: editingColumnText } : col
        )
      )
      if (oldTitle) {
        setTodos(
          todos.map((todo) =>
            todo.column_name === oldTitle
              ? { ...todo, column_name: editingColumnText }
              : todo
          )
        )
      }
    }
    setEditingColumnId(null)
  }

  const columnsTodos = (columnTitle: string) =>
    todos.filter((t) => t.column_name === columnTitle)

  if (loading) {
    return (
      <div className="project-page">
        <header className="project-header">
          <button onClick={onBack} className="btn-back">← 戻る</button>
          <h1>読み込み中...</h1>
        </header>
      </div>
    )
  }

  return (
    <div className="project-page">
      <header className="project-header">
        <button onClick={onBack} className="btn-back">← 戻る</button>
        <h1>プロジェクト: {projectId}</h1>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="kanban-board">
        {columns.map((column) => (
          <div key={column.id} className="kanban-column">
            <div className="column-header">
              {editingColumnId === column.id ? (
                <div className="edit-column">
                  <input
                    type="text"
                    value={editingColumnText}
                    onChange={(e) => setEditingColumnText(e.target.value)}
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveColumnTitle(column.id)}
                    className="btn-save"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingColumnId(null)}
                    className="btn-cancel"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <div className="column-title-display">
                  <h2>{column.title}</h2>
                  <button
                    onClick={() => handleStartEditColumn(column.id, column.title)}
                    className="btn-edit"
                    title="列のタイトルを編集"
                  >
                    ✏️
                  </button>
                </div>
              )}
            </div>

            <div className="todo-list">
              {columnsTodos(column.title).map((todo) => (
                <div key={todo.id} className="todo-card">
                  <h4>{todo.title}</h4>
                  {todo.description && <p>{todo.description}</p>}
                  <button
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="btn-delete"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleAddTodo(column.title)
              }}
              className="add-todo-form"
            >
              <input
                type="text"
                placeholder={`${column.title} に追加...`}
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
              />
              <button type="submit" className="btn-add">
                追加
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  )
}
