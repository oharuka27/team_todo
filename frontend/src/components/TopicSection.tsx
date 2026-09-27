import { useState } from 'react'
import type { TodoItem, Topic } from '../services/api'

interface TopicSectionProps {
  /** null renders the section for tasks without a topic. */
  topic: Topic | null
  color?: string
  todos: TodoItem[]
  collapsed: boolean
  isDropTarget: boolean
  isDragging: boolean
  onToggleCollapsed: () => void
  onColorChange: (color: string) => void
  onDragEnter: () => void
  onDrop: () => void
  onTaskDragStart: (todoId: string) => void
  onTaskDragEnd: () => void
  onOpenTask: (todoId: string) => void
  /** Creates a task in this topic; rejects if it could not be created. */
  onCreateTask: (title: string) => Promise<void>
}

export default function TopicSection(props: TopicSectionProps) {
  const { topic, color, todos, collapsed, isDropTarget, isDragging } = props
  const [isAdding, setIsAdding] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const name = topic?.name ?? '無所属'

  const createTask = async () => {
    const title = newTaskTitle.trim()
    if (!title) return
    try {
      await props.onCreateTask(title)
      setIsAdding(false)
      setNewTaskTitle('')
    } catch {
      // The page shows the error notice; keep the form open for another try.
    }
  }

  return (
    <section
      className={`topic-card ${collapsed ? 'collapsed' : ''} ${isDropTarget ? 'drop-target' : ''}`}
      style={color ? { backgroundColor: `${color}14`, borderColor: `${color}66` } : undefined}
      onDragEnter={(event) => {
        if (!isDragging) return
        event.preventDefault()
        props.onDragEnter()
      }}
      onDragOver={(event) => { if (isDragging) event.preventDefault() }}
      onDrop={(event) => {
        event.preventDefault()
        props.onDrop()
      }}
    >
      <header>
        {topic ? (
          <button className="topic-collapse-button" aria-expanded={!collapsed} aria-label={`${name}を${collapsed ? '展開' : '折りたたむ'}`} onClick={props.onToggleCollapsed}>
            <span className="topic-chevron" style={{ color }}>⌄</span>
            <span className="topic-heading"><small style={{ color }}>TOPIC</small><h2>{name}</h2></span>
          </button>
        ) : (
          <div><span>NO TOPIC</span><h2>{name}</h2></div>
        )}
        {topic && (
          <input
            className="topic-color-picker"
            type="color"
            aria-label={`${name}の色`}
            value={color}
            onChange={(event) => props.onColorChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
        )}
        <b>{todos.length}</b>
      </header>
      {!collapsed && (
        <div className="topic-tasks">
          {todos.map((todo) => (
            <button
              draggable
              key={todo.id}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', todo.id)
                props.onTaskDragStart(todo.id)
              }}
              onDragEnd={props.onTaskDragEnd}
              onClick={() => props.onOpenTask(todo.id)}
            >
              <span className="task-type">✓</span>
              <span>{todo.title}</span>
              <small>{todo.column_name}</small>
            </button>
          ))}
          {isAdding ? (
            <form onSubmit={(event) => { event.preventDefault(); void createTask() }}>
              <input autoFocus aria-label={`${name}のタスク名`} value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="タスク名" />
              <button type="submit" disabled={!newTaskTitle.trim()}>追加</button>
              <button type="button" onClick={() => setIsAdding(false)}>キャンセル</button>
            </form>
          ) : (
            <button className="add-topic-task" onClick={() => { setNewTaskTitle(''); setIsAdding(true) }}>＋ タスクを追加</button>
          )}
        </div>
      )}
    </section>
  )
}
