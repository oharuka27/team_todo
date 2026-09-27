import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import AssigneeFilter, { ALL_ASSIGNEES, UNASSIGNED } from '../components/AssigneeFilter'
import KanbanColumn from '../components/KanbanColumn'
import MemberDialog from '../components/MemberDialog'
import ProjectHeader from '../components/ProjectHeader'
import TaskDetailModal from '../components/TaskDetailModal'
import type { AssigneeBadge, TopicBadge } from '../components/TodoCard'
import TopicSection from '../components/TopicSection'
import { useRealtimeSocket } from '../hooks/useRealtimeSocket'
import { apiClient, type BoardColumn, type Project, type ProjectMember, type TodoItem, type Topic } from '../services/api'
import { DEFAULT_AVATAR_COLOR, initialOf } from '../utils/avatar'
import '../styles/ProjectPage.css'

interface ProjectPageProps {
  project: Project
  userId: string
  nickname: string
  avatarColor?: string
  onProjectUpdated: (project: Project) => void
}

const defaultColumns = (): BoardColumn[] => [
  { id: 'todo', title: 'To Do', position: 0 },
  { id: 'progress', title: 'In Progress', position: 1 },
  { id: 'review', title: 'In Review', position: 2 },
  { id: 'done', title: 'Done', position: 3 },
]
const TOPIC_COLORS = ['#5baF9f', '#5f91c9', '#8b78c6', '#d1849f', '#dc8b62', '#d2aa45', '#73a95c', '#4ea4b8', '#9a8068', '#7c8da8']

const SearchIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>

// Tasks created before column IDs existed (or loaded offline) fall back to matching by title.
const isInColumn = (todo: TodoItem, column: BoardColumn) => todo.column_id ? todo.column_id === column.id : todo.column_name === column.title

export default function ProjectPage({ project, userId, nickname, avatarColor = DEFAULT_AVATAR_COLOR, onProjectUpdated }: ProjectPageProps) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [columns, setColumns] = useState<BoardColumn[]>(defaultColumns())
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [realtimeRevision, setRealtimeRevision] = useState(0)
  const [activeView, setActiveView] = useState<'topics' | 'board'>('board')
  const [query, setQuery] = useState('')
  const [assigneeFilters, setAssigneeFilters] = useState<string[]>([ALL_ASSIGNEES])
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null)
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<string[]>([])
  const [draggedTopicTodoId, setDraggedTopicTodoId] = useState<string | null>(null)
  const [topicDropTarget, setTopicDropTarget] = useState<string | null>(null)

  const loadProjectData = useCallback(() => Promise.allSettled([
    apiClient.getTodos(project.id),
    apiClient.getColumns(project.id),
    apiClient.getTopics(project.id),
    apiClient.getProjectMembers(project.id),
  ]), [project.id])

  useEffect(() => {
    let active = true
    loadProjectData().then(([todoResult, columnResult, topicResult, memberResult]) => {
      if (!active) return
      if (todoResult.status === 'rejected' || columnResult.status === 'rejected') setNotice('プロジェクトを読み込めませんでした')
      if (todoResult.status === 'fulfilled') setTodos(todoResult.value)
      if (columnResult.status === 'fulfilled' && columnResult.value.length) setColumns(columnResult.value)
      if (topicResult.status === 'fulfilled') setTopics(topicResult.value)
      if (memberResult.status === 'fulfilled') setMembers(memberResult.value)
      setLoading(false)
    })
    return () => { active = false }
  }, [loadProjectData])

  useRealtimeSocket(`project:${project.id}`, () => apiClient.connectProjectEvents(project.id), async (event) => {
    let type = ''
    try {
      type = (JSON.parse(String(event.data)) as { type?: string }).type ?? ''
    } catch {
      return
    }
    window.dispatchEvent(new Event('team-todo-refresh'))
    if (type === 'project.deleted') return
    const [todoResult, columnResult, topicResult, memberResult] = await loadProjectData()
    if (todoResult.status === 'fulfilled') setTodos(todoResult.value)
    if (columnResult.status === 'fulfilled') setColumns(columnResult.value.length ? columnResult.value : defaultColumns())
    if (topicResult.status === 'fulfilled') setTopics(topicResult.value)
    if (memberResult.status === 'fulfilled') setMembers(memberResult.value)
    setRealtimeRevision((revision) => revision + 1)
    if (type === 'project.updated') {
      try {
        onProjectUpdated(await apiClient.getProject(project.id))
      } catch { /* refresh on the next event */ }
    }
  })

  const filteredTodos = useMemo(() => todos.filter((todo) => {
    const matchesQuery = todo.title.toLowerCase().includes(query.toLowerCase())
    const matchesAssignee = assigneeFilters.includes(ALL_ASSIGNEES)
      || (assigneeFilters.includes(UNASSIGNED) && !todo.assignee_id)
      || (!!todo.assignee_id && assigneeFilters.includes(todo.assignee_id))
    return matchesQuery && matchesAssignee
  }), [assigneeFilters, todos, query])

  const assigneeOf = (todo: TodoItem): AssigneeBadge => {
    if (!todo.assignee_id) return { initial: '未', name: '未アサイン', color: '#a8b0b3', unassigned: true }
    const member = members.find((item) => item.user_id === todo.assignee_id)
    const isSelf = todo.assignee_id === userId
    const name = member?.nickname ?? (isSelf ? nickname : '不明な担当者')
    const color = member?.avatar_color ?? (isSelf ? avatarColor : '#d9eee8')
    return { initial: initialOf(name), name, color, unassigned: false }
  }

  const topicOf = (todo: TodoItem): TopicBadge => {
    if (!todo.topic_id) return { name: '無所属', color: '#7f9298', unassigned: true }
    const topic = topics.find((item) => item.id === todo.topic_id)
    return { name: topic?.name ?? '不明なトピック', color: topic?.color || '#5f91c9', unassigned: !topic }
  }

  const replaceTodo = (updated: TodoItem) => setTodos((items) => items.map((item) => item.id === updated.id ? updated : item))

  const addTodo = async (column: BoardColumn, title: string) => {
    const now = new Date().toISOString()
    const temporaryId = `pending-${crypto.randomUUID()}`
    setTodos((items) => [...items, { id: temporaryId, project_id: project.id, title, status: 'not_started', column_id: column.id, column_name: column.title, user_id: userId, created_at: now, updated_at: now }])
    try {
      const created = await apiClient.createTodo(project.id, title, column.id)
      setTodos((items) => items.map((todo) => todo.id === temporaryId ? created : todo))
    } catch {
      setTodos((items) => items.filter((todo) => todo.id !== temporaryId))
      setNotice('タスクを追加できませんでした')
    }
  }

  const deleteTodo = async (id: string) => {
    const removed = todos.find((todo) => todo.id === id)
    setTodos((items) => items.filter((todo) => todo.id !== id))
    try {
      await apiClient.deleteTodo(id)
    } catch {
      if (removed) setTodos((items) => items.some((todo) => todo.id === id) ? items : [...items, removed])
      setNotice('タスクを削除できませんでした')
    }
  }

  const moveTodo = async (id: string, column: BoardColumn) => {
    const previous = todos
    setTodos((items) => items.map((todo) => todo.id === id ? { ...todo, column_id: column.id, column_name: column.title } : todo))
    try {
      await apiClient.updateTodo(id, { column_id: column.id })
    } catch {
      setTodos(previous)
      setNotice('タスクを移動できませんでした')
    }
  }

  const renameTodo = async (todo: TodoItem, title: string) => {
    setNotice(null)
    try {
      replaceTodo(await apiClient.updateTodo(todo.id, { title }))
    } catch (error) {
      setNotice('タスク名を更新できませんでした')
      throw error
    }
  }

  const renameColumn = async (column: BoardColumn, title: string) => {
    const previousColumns = columns
    const previousTodos = todos
    setColumns((items) => items.map((item) => item.id === column.id ? { ...item, title } : item))
    setTodos((items) => items.map((todo) => isInColumn(todo, column) ? { ...todo, column_name: title } : todo))
    try {
      await apiClient.updateColumn(column.id, title)
    } catch {
      setColumns(previousColumns)
      setTodos(previousTodos)
      setNotice('列名を変更できませんでした')
    }
  }

  const renameProject = async (name: string) => {
    setNotice(null)
    try {
      onProjectUpdated(await apiClient.updateProject(project.id, { name }))
    } catch (error) {
      setNotice('プロジェクト名を更新できませんでした')
      throw error
    }
  }

  const createTopic = async (event: FormEvent) => {
    event.preventDefault()
    const name = newTopicName.trim()
    if (!name) return
    try {
      const created = await apiClient.createTopic(project.id, name, TOPIC_COLORS[topics.length % TOPIC_COLORS.length])
      setTopics((items) => [...items, created])
      setNewTopicName('')
    } catch {
      setNotice('トピックを作成できませんでした')
    }
  }

  const createTopicTask = async (topicId: string | null, title: string) => {
    try {
      const created = await apiClient.createTodo(project.id, title, columns[0]?.id ?? '', undefined, topicId)
      setTodos((items) => [...items, created])
    } catch (error) {
      setNotice('タスクを作成できませんでした')
      throw error
    }
  }

  const moveTodoToTopic = async (topicId: string | null) => {
    const target = todos.find((todo) => todo.id === draggedTopicTodoId)
    setDraggedTopicTodoId(null)
    setTopicDropTarget(null)
    if (!target || (target.topic_id ?? null) === topicId) return
    const previous = todos
    setTodos((items) => items.map((todo) => todo.id === target.id ? { ...todo, topic_id: topicId } : todo))
    try {
      await apiClient.updateTodo(target.id, { topic_id: topicId })
    } catch {
      setTodos(previous)
    }
  }

  const updateTopicColor = async (topicId: string, color: string) => {
    const previous = topics
    setTopics((items) => items.map((topic) => topic.id === topicId ? { ...topic, color } : topic))
    try {
      const updated = await apiClient.updateTopic(topicId, { color })
      setTopics((items) => items.map((topic) => topic.id === topicId ? updated : topic))
    } catch {
      setTopics(previous)
    }
  }

  const renderTopicSection = (topic: Topic | null) => {
    const key = topic?.id ?? 'unassigned'
    const topicIndex = topic ? topics.findIndex((item) => item.id === topic.id) : -1
    return (
      <TopicSection
        key={key}
        topic={topic}
        color={topic ? topic.color || TOPIC_COLORS[Math.max(0, topicIndex) % TOPIC_COLORS.length] : undefined}
        todos={todos.filter((todo) => (todo.topic_id ?? null) === (topic?.id ?? null))}
        collapsed={!!topic && collapsedTopicIds.includes(topic.id)}
        isDropTarget={topicDropTarget === key}
        isDragging={!!draggedTopicTodoId}
        onToggleCollapsed={() => topic && setCollapsedTopicIds((ids) => ids.includes(topic.id) ? ids.filter((id) => id !== topic.id) : [...ids, topic.id])}
        onColorChange={(color) => topic && void updateTopicColor(topic.id, color)}
        onDragEnter={() => setTopicDropTarget(key)}
        onDrop={() => void moveTodoToTopic(topic?.id ?? null)}
        onTaskDragStart={setDraggedTopicTodoId}
        onTaskDragEnd={() => { setDraggedTopicTodoId(null); setTopicDropTarget(null) }}
        onOpenTask={setSelectedTodoId}
        onCreateTask={(title) => createTopicTask(topic?.id ?? null, title)}
      />
    )
  }

  const selectedTodo = selectedTodoId ? todos.find((todo) => todo.id === selectedTodoId) : undefined

  return (
    <section className="board-page">
      <ProjectHeader project={project} isOwner={project.owner_id === userId} members={members} onRename={renameProject} onAddMember={() => setIsMemberDialogOpen(true)} />
      <nav className="project-view-tabs" aria-label="プロジェクト表示">
        <button className={activeView === 'topics' ? 'active' : ''} onClick={() => setActiveView('topics')}>トピック</button>
        <button className={activeView === 'board' ? 'active' : ''} onClick={() => setActiveView('board')}>ボード</button>
      </nav>
      {activeView === 'board' && (
        <div className="board-toolbar">
          <div className="search-box"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ボードを検索" /></div>
          <AssigneeFilter members={members} filters={assigneeFilters} onChange={setAssigneeFilters} />
          {notice && <span className="offline-notice">{notice}</span>}
        </div>
      )}
      {loading ? (
        <div className="board-loading"><span /><p>プロジェクトを読み込んでいます…</p></div>
      ) : activeView === 'board' ? (
        <div className="kanban-board">
          {columns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              colorIndex={index}
              todos={filteredTodos.filter((todo) => isInColumn(todo, column))}
              assigneeOf={assigneeOf}
              topicOf={topicOf}
              onRenameColumn={(title) => void renameColumn(column, title)}
              onAddTodo={(title) => void addTodo(column, title)}
              onMoveTodo={(todoId) => void moveTodo(todoId, column)}
              onOpenTodo={setSelectedTodoId}
              onDeleteTodo={(todoId) => void deleteTodo(todoId)}
              onRenameTodo={renameTodo}
            />
          ))}
        </div>
      ) : (
        <div className="topics-page">
          <form className="topic-create-form" onSubmit={createTopic}>
            <input aria-label="トピック名" value={newTopicName} onChange={(event) => setNewTopicName(event.target.value)} placeholder="新しいトピック名" />
            <button type="submit" disabled={!newTopicName.trim()}>トピックを作成</button>
          </form>
          <div className="topic-columns">
            <div className="topic-list topic-list-owned">
              {topics.length ? topics.map(renderTopicSection) : (
                <div className="empty-topics"><p>トピックはまだありません</p><span>上のフォームから最初のトピックを作成してください。</span></div>
              )}
            </div>
            <aside className="unassigned-topic-area" aria-label="無所属タスク">{renderTopicSection(null)}</aside>
          </div>
        </div>
      )}
      {isMemberDialogOpen && (
        <MemberDialog project={project} mode="add" onAdded={(added) => setMembers((current) => [...current, ...added])} onClose={() => setIsMemberDialogOpen(false)} />
      )}
      {selectedTodo && (
        <TaskDetailModal
          todo={selectedTodo}
          topics={topics}
          members={members}
          userId={userId}
          nickname={nickname}
          refreshToken={realtimeRevision}
          onClose={() => setSelectedTodoId(null)}
          onUpdated={replaceTodo}
        />
      )}
    </section>
  )
}
