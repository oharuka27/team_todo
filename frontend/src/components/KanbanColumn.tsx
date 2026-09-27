import { useState } from 'react'
import type { BoardColumn, TodoItem } from '../services/api'
import TodoCard, { type AssigneeBadge, type TopicBadge } from './TodoCard'

interface KanbanColumnProps {
  column: BoardColumn
  colorIndex: number
  todos: TodoItem[]
  assigneeOf: (todo: TodoItem) => AssigneeBadge
  topicOf: (todo: TodoItem) => TopicBadge
  onRenameColumn: (title: string) => void
  onAddTodo: (title: string) => void
  onMoveTodo: (todoId: string) => void
  onOpenTodo: (todoId: string) => void
  onDeleteTodo: (todoId: string) => void
  onRenameTodo: (todo: TodoItem, title: string) => Promise<void>
}

export default function KanbanColumn({ column, colorIndex, todos, assigneeOf, topicOf, onRenameColumn, onAddTodo, onMoveTodo, onOpenTodo, onDeleteTodo, onRenameTodo }: KanbanColumnProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleText, setTitleText] = useState(column.title)
  const [isAdding, setIsAdding] = useState(false)
  const [newTodoText, setNewTodoText] = useState('')

  const saveTitle = () => {
    setIsEditingTitle(false)
    const title = titleText.trim()
    if (title && title !== column.title) onRenameColumn(title)
  }

  const addTodo = () => {
    const title = newTodoText.trim()
    if (!title) return
    setNewTodoText('')
    setIsAdding(false)
    onAddTodo(title)
  }

  return (
    <article
      className={`kanban-column column-${colorIndex % 4}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const todoId = event.dataTransfer.getData('todo-id')
        if (todoId) onMoveTodo(todoId)
      }}
    >
      <div className="column-header">
        {isEditingTitle ? (
          <input
            className="column-title-input"
            value={titleText}
            onChange={(event) => setTitleText(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveTitle()
              if (event.key === 'Escape') setIsEditingTitle(false)
            }}
            autoFocus
          />
        ) : (
          <button className="column-title" onDoubleClick={() => { setTitleText(column.title); setIsEditingTitle(true) }} title="ダブルクリックで名前を編集">
            <span>{column.title}</span>
            <b>{todos.length}</b>
          </button>
        )}
        <button className="more-button" aria-label="列のメニュー">•••</button>
      </div>
      <div className="todo-list">
        {todos.map((todo) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            assignee={assigneeOf(todo)}
            topic={topicOf(todo)}
            onOpen={() => onOpenTodo(todo.id)}
            onDelete={() => onDeleteTodo(todo.id)}
            onRename={(title) => onRenameTodo(todo, title)}
          />
        ))}
        {isAdding ? (
          <form className="inline-add" onSubmit={(event) => { event.preventDefault(); addTodo() }}>
            <textarea
              autoFocus
              value={newTodoText}
              onChange={(event) => setNewTodoText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  addTodo()
                }
                if (event.key === 'Escape') setIsAdding(false)
              }}
              placeholder="タスク名を入力"
            />
            <div>
              <button type="submit">追加</button>
              <button type="button" onClick={() => setIsAdding(false)}>キャンセル</button>
            </div>
          </form>
        ) : (
          <button className="add-task" onClick={() => { setNewTodoText(''); setIsAdding(true) }}>
            <span aria-hidden="true">＋</span>タスクを追加、またはドラッグ
          </button>
        )}
      </div>
    </article>
  )
}
