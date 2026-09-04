import { useEffect, useMemo, useState } from 'react'
import { apiClient, type BoardColumn, type Project, type ProjectMember, type TodoItem, type Topic, type UserAccount } from '../services/api'
import TaskDetailModal from '../components/TaskDetailModal'
import '../styles/ProjectPage.css'

interface ProjectPageProps { project: Project; userId: string; nickname: string; avatarColor?: string; onProjectUpdated: (project: Project) => void }
const defaultColumns = (): BoardColumn[] => [
  { id: 'todo', title: 'To Do', position: 0 }, { id: 'progress', title: 'In Progress', position: 1 },
  { id: 'review', title: 'In Review', position: 2 }, { id: 'done', title: 'Done', position: 3 },
]
const SearchIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
const TOPIC_COLORS = ['#5baF9f', '#5f91c9', '#8b78c6', '#d1849f', '#dc8b62', '#d2aa45', '#73a95c', '#4ea4b8', '#9a8068', '#7c8da8']

export default function ProjectPage({ project, userId, nickname, avatarColor = '#4a9c9b', onProjectUpdated }: ProjectPageProps) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [columns, setColumns] = useState<BoardColumn[]>(defaultColumns())
  const [users, setUsers] = useState<UserAccount[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [activeView, setActiveView] = useState<'topics' | 'board'>('board')
  const [newTopicName, setNewTopicName] = useState('')
  const [addingTopicTaskId, setAddingTopicTaskId] = useState<string | null>(null)
  const [newTopicTaskTitle, setNewTopicTaskTitle] = useState('')
  const [draggedTopicTodoId, setDraggedTopicTodoId] = useState<string | null>(null)
  const [topicDropTarget, setTopicDropTarget] = useState<string | null>(null)
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<string[]>([])
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newTodoText, setNewTodoText] = useState('')
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editingColumnText, setEditingColumnText] = useState('')
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingTodoText, setEditingTodoText] = useState('')
  const [savingTodoId, setSavingTodoId] = useState<string | null>(null)
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [isEditingProjectName, setIsEditingProjectName] = useState(false)
  const [projectName, setProjectName] = useState(project.name)
  const [isSavingProjectName, setIsSavingProjectName] = useState(false)
  const [realtimeRevision, setRealtimeRevision] = useState(0)
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [isAddingMembers, setIsAddingMembers] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([apiClient.getTodos(project.id), apiClient.getColumns(project.id), apiClient.getUsers(), apiClient.getTopics(project.id), apiClient.getProjectMembers(project.id)])
      .then(([todoData, columnData, userData, topicData, memberData]) => {
        setTodos(todoData)
        setColumns(columnData.length ? columnData : defaultColumns())
        setUsers(userData.some((user) => user.id === userId) ? userData : [...userData, { id: userId, nickname, avatar_color: avatarColor, created_at: '', updated_at: '' }])
        setTopics(topicData)
        setMembers(memberData)
      })
      .catch(() => { setTodos([]); setColumns(defaultColumns()); setNotice('オフラインモードで表示しています') })
      .finally(() => setLoading(false))
  }, [project.id, userId, nickname, avatarColor])

  useEffect(() => {
    if (typeof apiClient.connectProjectEvents !== 'function') return
    let active = true
    let socket: WebSocket | null = null
    let retryId: number | null = null
    const reload = async (event: MessageEvent) => {
      if (!active) return
      let type = ''
      try { type = (JSON.parse(String(event.data)) as { type?: string }).type ?? '' } catch { return }
      window.dispatchEvent(new Event('team-todo-refresh'))
      if (type === 'project.deleted') return
      const [todoResult, columnResult, userResult, topicResult, memberResult] = await Promise.allSettled([apiClient.getTodos(project.id), apiClient.getColumns(project.id), apiClient.getUsers(), apiClient.getTopics(project.id), apiClient.getProjectMembers(project.id)])
      if (!active) return
      if (todoResult.status === 'fulfilled') setTodos(todoResult.value)
      if (columnResult.status === 'fulfilled') setColumns(columnResult.value.length ? columnResult.value : defaultColumns())
      if (userResult.status === 'fulfilled') setUsers(userResult.value.some((user) => user.id === userId) ? userResult.value : [...userResult.value, { id: userId, nickname, avatar_color: avatarColor, created_at: '', updated_at: '' }])
      if (topicResult.status === 'fulfilled') setTopics(topicResult.value)
      if (memberResult.status === 'fulfilled') setMembers(memberResult.value)
      setRealtimeRevision((revision) => revision + 1)
      if (type === 'project.updated') {
        try { onProjectUpdated(await apiClient.getProject(project.id)) } catch { /* refresh on the next event */ }
      }
    }
    const connect = () => {
      if (!active) return
      try {
        socket = apiClient.connectProjectEvents(project.id, userId)
        socket.onmessage = reload
        socket.onclose = () => { if (active) retryId = window.setTimeout(connect, 5_000) }
        socket.onerror = () => socket?.close()
      } catch { retryId = window.setTimeout(connect, 5_000) }
    }
    connect()
    return () => {
      active = false
      if (retryId !== null) window.clearTimeout(retryId)
      socket?.close()
    }
  }, [project.id, userId, nickname, avatarColor, onProjectUpdated])

  const filteredTodos = useMemo(() => todos.filter((todo) => todo.title.toLowerCase().includes(query.toLowerCase())), [todos, query])
  const memberCandidates = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.user_id))
    return users.filter((user) => user.id !== project.owner_id && !memberIds.has(user.id))
  }, [members, project.owner_id, users])
  const columnTodos = (title: string) => filteredTodos.filter((todo) => todo.column_name === title)
  const assigneeDisplay = (todo: TodoItem) => {
    if (!todo.assignee_id) return { initial: '未', name: '未アサイン', unassigned: true }
    const name = users.find((user) => user.id === todo.assignee_id)?.nickname ?? (todo.assignee_id === userId ? nickname : '不明な担当者')
    const color = users.find((user) => user.id === todo.assignee_id)?.avatar_color ?? (todo.assignee_id === userId ? avatarColor : '#d9eee8')
    return { initial: Array.from(name)[0]?.toUpperCase() || '?', name, color, unassigned: false }
  }
  const topicDisplay = (todo: TodoItem) => {
    if (!todo.topic_id) return { name: '無所属', color: '#7f9298', unassigned: true }
    const topic = topics.find((item) => item.id === todo.topic_id)
    return { name: topic?.name ?? '不明なトピック', color: topic?.color || '#5f91c9', unassigned: !topic }
  }

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

  const createTopic = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = newTopicName.trim(); if (!name) return
    try { const created = await apiClient.createTopic(project.id, name, TOPIC_COLORS[topics.length % TOPIC_COLORS.length]); setTopics((items) => [...items, created]); setNewTopicName('') }
    catch { setNotice('トピックを作成できませんでした') }
  }
  const createTopicTask = async (topicId: string | null) => {
    const title = newTopicTaskTitle.trim(); if (!title) return
    try {
      const created = await apiClient.createTodo(project.id, title, 'To Do', userId, undefined, topicId)
      setTodos((items) => [...items, created]); setAddingTopicTaskId(null); setNewTopicTaskTitle('')
    } catch { setNotice('タスクを作成できませんでした') }
  }
  const moveTodoToTopic = async (topicId: string | null) => {
    if (!draggedTopicTodoId) return
    const target = todos.find((todo) => todo.id === draggedTopicTodoId)
    setDraggedTopicTodoId(null); setTopicDropTarget(null)
    if (!target || (target.topic_id ?? null) === topicId) return
    const previous = todos
    setTodos((items) => items.map((todo) => todo.id === target.id ? { ...todo, topic_id: topicId } : todo))
    try { await apiClient.updateTodo(target.id, { topic_id: topicId }) }
    catch { setTodos(previous) }
  }
  const updateTopicColor = async (topicId: string, color: string) => {
    const previous = topics
    setTopics((items) => items.map((topic) => topic.id === topicId ? { ...topic, color } : topic))
    try { const updated = await apiClient.updateTopic(topicId, { color }); setTopics((items) => items.map((topic) => topic.id === topicId ? updated : topic)) }
    catch { setTopics(previous) }
  }

  const openMemberDialog = () => {
    setSelectedMemberIds([])
    setMemberError(null)
    setIsMemberDialogOpen(true)
  }
  const toggleMember = (memberId: string) => setSelectedMemberIds((ids) => ids.includes(memberId) ? ids.filter((id) => id !== memberId) : [...ids, memberId])
  const addMembers = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedMemberIds.length || isAddingMembers) return
    setIsAddingMembers(true)
    setMemberError(null)
    try {
      const added = await Promise.all(selectedMemberIds.map((memberId) => apiClient.addProjectMember(project.id, userId, memberId)))
      const userById = new Map(users.map((user) => [user.id, user]))
      setMembers((current) => [...current, ...added.map((member) => ({ ...member, avatar_color: userById.get(member.user_id)?.avatar_color }))])
      setIsMemberDialogOpen(false)
      setSelectedMemberIds([])
    } catch {
      setMemberError('メンバーを追加できませんでした。')
      try { setMembers(await apiClient.getProjectMembers(project.id)) } catch { /* keep the last known members */ }
    } finally {
      setIsAddingMembers(false)
    }
  }

  const renderTopicSection = (topic: Topic | null) => {
    const topicKey = topic?.id ?? 'unassigned'
    const topicName = topic?.name ?? '無所属'
    const topicTodos = todos.filter((todo) => (todo.topic_id ?? null) === (topic?.id ?? null))
    const collapsed = topic ? collapsedTopicIds.includes(topic.id) : false
    const topicIndex = topic ? topics.findIndex((item) => item.id === topic.id) : -1
    const topicColor = topic ? topic.color || TOPIC_COLORS[Math.max(0, topicIndex) % TOPIC_COLORS.length] : undefined
    return <section className={`topic-card ${collapsed ? 'collapsed' : ''} ${topicDropTarget === topicKey ? 'drop-target' : ''}`} style={topicColor ? { backgroundColor: `${topicColor}14`, borderColor: `${topicColor}66` } : undefined} key={topicKey} onDragEnter={(event) => { if (draggedTopicTodoId) { event.preventDefault(); setTopicDropTarget(topicKey) } }} onDragOver={(event) => { if (draggedTopicTodoId) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); void moveTodoToTopic(topic?.id ?? null) }}><header>{topic ? <button className="topic-collapse-button" aria-expanded={!collapsed} aria-label={`${topicName}を${collapsed ? '展開' : '折りたたむ'}`} onClick={() => setCollapsedTopicIds((ids) => ids.includes(topic.id) ? ids.filter((id) => id !== topic.id) : [...ids, topic.id])}><span className="topic-chevron" style={{ color: topicColor }}>⌄</span><span className="topic-heading"><small style={{ color: topicColor }}>TOPIC</small><h2>{topicName}</h2></span></button> : <div><span>NO TOPIC</span><h2>{topicName}</h2></div>}{topic && <input className="topic-color-picker" type="color" aria-label={`${topicName}の色`} value={topicColor} onChange={(event) => void updateTopicColor(topic.id, event.target.value)} onClick={(event) => event.stopPropagation()}/>}<b>{topicTodos.length}</b></header>{!collapsed && <div className="topic-tasks">{topicTodos.map((todo) => <button draggable key={todo.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', todo.id); setDraggedTopicTodoId(todo.id) }} onDragEnd={() => { setDraggedTopicTodoId(null); setTopicDropTarget(null) }} onClick={() => setSelectedTodoId(todo.id)}><span className="task-type">✓</span><span>{todo.title}</span><small>{todo.column_name}</small></button>)}{addingTopicTaskId === topicKey ? <form onSubmit={(event) => { event.preventDefault(); void createTopicTask(topic?.id ?? null) }}><input autoFocus aria-label={`${topicName}のタスク名`} value={newTopicTaskTitle} onChange={(event) => setNewTopicTaskTitle(event.target.value)} placeholder="タスク名"/><button type="submit" disabled={!newTopicTaskTitle.trim()}>追加</button><button type="button" onClick={() => setAddingTopicTaskId(null)}>キャンセル</button></form> : <button className="add-topic-task" onClick={() => { setAddingTopicTaskId(topicKey); setNewTopicTaskTitle('') }}>＋ タスクを追加</button>}</div>}</section>
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
      const updated = await apiClient.updateProject(project.id, { name }, userId)
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
          ) : project.owner_id === userId ? <button className="project-name-button" onClick={() => { setProjectName(project.name); setIsEditingProjectName(true) }} aria-label="プロジェクト名を変更"><h1>{project.name}</h1></button> : <h1>{project.name}</h1>}
          {project.description && <p>{project.description}</p>}
        </div>
        <div className="member-stack" aria-label="プロジェクトメンバー">{members.map((member) => <span key={member.user_id} style={{ backgroundColor: member.avatar_color || '#4a9c9b' }} title={`${member.nickname}（${member.role === 'owner' ? 'オーナー' : 'メンバー'}）`}>{Array.from(member.nickname)[0]?.toUpperCase() || '?'}</span>)}{project.owner_id === userId && <button aria-label="メンバーを追加" onClick={openMemberDialog}>＋</button>}</div>
      </header>
      <nav className="project-view-tabs" aria-label="プロジェクト表示"><button className={activeView === 'topics' ? 'active' : ''} onClick={() => setActiveView('topics')}>トピック</button><button className={activeView === 'board' ? 'active' : ''} onClick={() => setActiveView('board')}>ボード</button></nav>
      {activeView === 'board' && <div className="board-toolbar">
        <div className="search-box"><SearchIcon/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ボードを検索" /></div>
        <div className="board-label"><span className="board-dot"/> ボード</div>{notice && <span className="offline-notice">{notice}</span>}
      </div>}
      {loading ? <div className="board-loading"><span/><p>プロジェクトを読み込んでいます…</p></div> : activeView === 'board' ? (
        <div className="kanban-board">
          {columns.map((column, index) => (
            <article className={`kanban-column column-${index % 4}`} key={column.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('todo-id'); if (id) moveTodo(id, column.title) }}>
              <div className="column-header">
                {editingColumnId === column.id ? <input className="column-title-input" value={editingColumnText} onChange={(e) => setEditingColumnText(e.target.value)} onBlur={() => saveColumn(column)} onKeyDown={(e) => { if (e.key === 'Enter') saveColumn(column); if (e.key === 'Escape') setEditingColumnId(null) }} autoFocus /> : <button className="column-title" onDoubleClick={() => { setEditingColumnId(column.id); setEditingColumnText(column.title) }} title="ダブルクリックで名前を編集"><span>{column.title}</span><b>{columnTodos(column.title).length}</b></button>}
                <button className="more-button" aria-label="列のメニュー">•••</button>
              </div>
              <div className="todo-list">
                {columnTodos(column.title).map((todo) => {
                  const assignee = assigneeDisplay(todo)
                  const topic = topicDisplay(todo)
                  return (
                  <div className={`todo-card ${editingTodoId === todo.id ? 'editing' : ''}`} key={todo.id} draggable={editingTodoId !== todo.id} role="button" tabIndex={0} aria-label={`${todo.title}の詳細を開く`} onClick={() => { if (editingTodoId !== todo.id) setSelectedTodoId(todo.id) }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedTodoId(todo.id) } }} onDragStart={(e) => e.dataTransfer.setData('todo-id', todo.id)}>
                    {editingTodoId === todo.id ? (
                      <form className="todo-title-editor" onSubmit={(event) => { event.preventDefault(); saveTodoTitle(todo) }}>
                        <input autoFocus aria-label="タスク名" value={editingTodoText} onChange={(event) => setEditingTodoText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') cancelTodoEdit() }} disabled={savingTodoId === todo.id} />
                        <div><button type="submit" aria-label="タスク名を保存" disabled={!editingTodoText.trim() || savingTodoId === todo.id}>✓</button><button type="button" aria-label="タスク名の変更をキャンセル" onClick={cancelTodoEdit} disabled={savingTodoId === todo.id}>×</button></div>
                      </form>
                    ) : <><div className="todo-actions"><button className="delete-todo" onClick={(event) => { event.stopPropagation(); deleteTodo(todo.id) }} aria-label={`${todo.title}を削除`}>×</button></div><div className="todo-title-row"><p>{todo.title}</p><button className="edit-todo" onClick={(event) => { event.stopPropagation(); startTodoEdit(todo) }} aria-label={`${todo.title}を編集`}>✎</button></div></>}
                    <div className="card-meta"><span className="task-type">✓</span><span className="task-id">TASK-{todo.id.slice(0, 3).toUpperCase()}</span><span className={`todo-topic-label ${topic.unassigned ? 'unassigned' : ''}`} style={topic.unassigned ? undefined : { color: topic.color, backgroundColor: `${topic.color}18`, borderColor: `${topic.color}55` }} title={`トピック: ${topic.name}`}><i style={topic.unassigned ? undefined : { backgroundColor: topic.color }}/>{topic.name}</span><span className={`mini-avatar ${assignee.unassigned ? 'unassigned' : ''}`} style={assignee.unassigned ? undefined : { backgroundColor: assignee.color }} title={`担当: ${assignee.name}`}>{assignee.initial}</span></div>
                  </div>
                  )
                })}
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
      ) : <div className="topics-page"><form className="topic-create-form" onSubmit={createTopic}><input aria-label="トピック名" value={newTopicName} onChange={(event) => setNewTopicName(event.target.value)} placeholder="新しいトピック名"/><button type="submit" disabled={!newTopicName.trim()}>トピックを作成</button></form><div className="topic-columns"><div className="topic-list topic-list-owned">{topics.length ? topics.map(renderTopicSection) : <div className="empty-topics"><p>トピックはまだありません</p><span>上のフォームから最初のトピックを作成してください。</span></div>}</div><aside className="unassigned-topic-area" aria-label="無所属タスク">{renderTopicSection(null)}</aside></div></div>}
      {isMemberDialogOpen && <div className="board-modal-backdrop" onMouseDown={() => !isAddingMembers && setIsMemberDialogOpen(false)}><div className="board-member-modal" role="dialog" aria-modal="true" aria-labelledby="board-member-dialog-title" onMouseDown={(event) => event.stopPropagation()}><header><div><small>PROJECT MEMBERS</small><h2 id="board-member-dialog-title">メンバーを追加</h2><p>「{project.name}」</p></div><button type="button" aria-label="閉じる" onClick={() => setIsMemberDialogOpen(false)} disabled={isAddingMembers}>×</button></header><form onSubmit={addMembers}><div className="board-member-selection" role="group" aria-label="追加するメンバー">{memberCandidates.length ? memberCandidates.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={selectedMemberIds.includes(candidate.id)} onChange={() => toggleMember(candidate.id)} disabled={isAddingMembers}/><span style={{ backgroundColor: candidate.avatar_color || '#4a9c9b' }}>{Array.from(candidate.nickname)[0]?.toUpperCase() || '?'}</span><strong>{candidate.nickname}</strong></label>) : <p>追加できるメンバーはいません。</p>}</div>{memberError && <p className="board-member-error" role="alert">{memberError}</p>}<footer><button type="button" onClick={() => setIsMemberDialogOpen(false)} disabled={isAddingMembers}>キャンセル</button><button type="submit" disabled={!selectedMemberIds.length || isAddingMembers}>{isAddingMembers ? '追加中…' : '追加'}</button></footer></form></div></div>}
      {selectedTodoId && (() => { const selectedTodo = todos.find((todo) => todo.id === selectedTodoId); return selectedTodo ? <TaskDetailModal todo={selectedTodo} topics={topics} userId={userId} nickname={nickname} refreshToken={realtimeRevision} onClose={() => setSelectedTodoId(null)} onUpdated={(updated) => setTodos((items) => items.map((item) => item.id === updated.id ? updated : item))} /> : null })()}
    </section>
  )
}
