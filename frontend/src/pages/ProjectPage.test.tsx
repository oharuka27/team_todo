import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectPage from './ProjectPage'
import { apiClient, type BoardColumn, type Project, type TodoItem } from '../services/api'

vi.mock('../services/api', () => ({
  apiClient: {
    getTodos: vi.fn(),
    getColumns: vi.fn(),
    getTopics: vi.fn(),
    createTopic: vi.fn(),
    createTodo: vi.fn(),
    deleteTodo: vi.fn(),
    updateTodo: vi.fn(),
    updateColumn: vi.fn(),
    updateProject: vi.fn(),
    getUsers: vi.fn(),
    getTodoComments: vi.fn(),
    createTodoComment: vi.fn(),
  },
}))

const mockedApi = vi.mocked(apiClient)
const now = '2026-09-03T00:00:00.000Z'
const project: Project = { id: 'project-1', name: 'テストプロジェクト', owner_id: 'user-1', created_at: now, updated_at: now }
const columns: BoardColumn[] = [
  { id: 'todo-column', title: 'To Do', position: 0 },
  { id: 'progress-column', title: 'In Progress', position: 1 },
]
const todo = (id: string, title: string, columnName = 'To Do'): TodoItem => ({
  id,
  project_id: project.id,
  title,
  status: 'not_started',
  column_name: columnName,
  user_id: 'user-1',
  assignee_id: 'user-1',
  created_at: now,
  updated_at: now,
})

describe('ProjectPage', () => {
  const onProjectUpdated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getColumns.mockResolvedValue(columns)
    mockedApi.getTopics.mockResolvedValue([])
    mockedApi.getUsers.mockResolvedValue([])
    mockedApi.getTodoComments.mockResolvedValue([])
  })

  it('タスクを追加し、削除する', async () => {
    const user = userEvent.setup()
    mockedApi.getTodos.mockResolvedValue([todo('todo-1', '既存タスク')])
    mockedApi.createTodo.mockResolvedValue(todo('todo-2', '追加タスク'))
    mockedApi.deleteTodo.mockResolvedValue({ success: true })

    render(<ProjectPage project={project} userId="user-1" nickname="山田" onProjectUpdated={onProjectUpdated} />)
    await screen.findByText('既存タスク')
    await user.click(screen.getAllByRole('button', { name: /タスクを追加/ })[0])
    await user.type(screen.getByPlaceholderText('タスク名を入力'), '追加タスク')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByText('追加タスク')).toBeInTheDocument()
    expect(screen.getAllByTitle('担当: 山田')).toHaveLength(2)
    expect(mockedApi.createTodo).toHaveBeenCalledWith(project.id, '追加タスク', 'To Do', 'user-1')

    await user.click(screen.getByRole('button', { name: '追加タスクを削除' }))
    await waitFor(() => expect(mockedApi.deleteTodo).toHaveBeenCalledWith('todo-2'))
    expect(screen.queryByText('追加タスク')).not.toBeInTheDocument()
  })

  it('トピックページでトピックと配下タスクを作成し、共通詳細画面を開く', async () => {
    const user = userEvent.setup()
    const topic = { id: 'topic-1', project_id: project.id, name: 'フロントエンド', created_at: now, updated_at: now }
    mockedApi.getTodos.mockResolvedValue([])
    mockedApi.createTopic.mockResolvedValue(topic)
    mockedApi.createTodo.mockResolvedValue({ ...todo('todo-topic', '画面を作る'), topic_id: topic.id })
    render(<ProjectPage project={project} userId="user-1" nickname="山田" onProjectUpdated={onProjectUpdated} />)

    await user.click(screen.getByRole('button', { name: 'トピック' }))
    await user.type(screen.getByRole('textbox', { name: 'トピック名' }), 'フロントエンド')
    await user.click(screen.getByRole('button', { name: 'トピックを作成' }))
    const topicCard = (await screen.findByRole('heading', { name: 'フロントエンド' })).closest('.topic-card') as HTMLElement
    await user.click(within(topicCard).getByRole('button', { name: /タスクを追加/ }))
    await user.type(screen.getByRole('textbox', { name: 'フロントエンドのタスク名' }), '画面を作る')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(mockedApi.createTodo).toHaveBeenCalledWith(project.id, '画面を作る', 'To Do', 'user-1', undefined, topic.id)
    await user.click(await screen.findByRole('button', { name: /画面を作る/ }))
    expect(screen.getByRole('dialog', { name: '画面を作る' })).toBeInTheDocument()
  })

  it('無所属タスクを作成し、ドラッグ＆ドロップでトピックへ移動する', async () => {
    const user = userEvent.setup()
    const topic = { id: 'topic-1', project_id: project.id, name: '移動先', created_at: now, updated_at: now }
    mockedApi.getTopics.mockResolvedValue([topic])
    mockedApi.getTodos.mockResolvedValue([])
    mockedApi.createTodo.mockResolvedValue({ ...todo('todo-free', '無所属タスク'), topic_id: null })
    mockedApi.updateTodo.mockResolvedValue({ ...todo('todo-free', '無所属タスク'), topic_id: topic.id })
    render(<ProjectPage project={project} userId="user-1" nickname="山田" onProjectUpdated={onProjectUpdated} />)

    await user.click(screen.getByRole('button', { name: 'トピック' }))
    const unassignedCard = (await screen.findByRole('heading', { name: '無所属' })).closest('.topic-card') as HTMLElement
    await user.click(within(unassignedCard).getByRole('button', { name: /タスクを追加/ }))
    await user.type(within(unassignedCard).getByRole('textbox', { name: '無所属のタスク名' }), '無所属タスク')
    await user.click(within(unassignedCard).getByRole('button', { name: '追加' }))
    expect(mockedApi.createTodo).toHaveBeenCalledWith(project.id, '無所属タスク', 'To Do', 'user-1', undefined, null)

    const taskButton = await within(unassignedCard).findByRole('button', { name: /無所属タスク/ })
    const targetCard = screen.getByRole('heading', { name: '移動先' }).closest('.topic-card') as HTMLElement
    const collapseButton = within(targetCard).getByRole('button', { name: '移動先を折りたたむ' })
    await user.click(collapseButton)
    expect(within(targetCard).getByRole('button', { name: '移動先を展開' })).toHaveAttribute('aria-expanded', 'false')
    const dataTransfer = { effectAllowed: '', setData: vi.fn() }
    fireEvent.dragStart(taskButton, { dataTransfer })
    fireEvent.dragEnter(targetCard, { dataTransfer })
    expect(targetCard).toHaveClass('drop-target')
    fireEvent.drop(targetCard, { dataTransfer })
    await waitFor(() => expect(mockedApi.updateTodo).toHaveBeenCalledWith('todo-free', { topic_id: topic.id }))
  })

  it('ドラッグ＆ドロップでタスクの状態を変更する', async () => {
    mockedApi.getTodos.mockResolvedValue([todo('todo-1', '移動するタスク')])
    mockedApi.updateTodo.mockResolvedValue(todo('todo-1', '移動するタスク', 'In Progress'))
    render(<ProjectPage project={project} userId="user-1" nickname="山田" onProjectUpdated={onProjectUpdated} />)

    const taskText = await screen.findByText('移動するタスク')
    const taskCard = taskText.closest('.todo-card') as HTMLElement
    const progressColumn = screen.getByText('In Progress').closest('.kanban-column') as HTMLElement
    const transfer = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => transfer.set(type, value),
      getData: (type: string) => transfer.get(type) || '',
    }
    fireEvent.dragStart(taskCard, { dataTransfer })
    fireEvent.drop(progressColumn, { dataTransfer })

    await waitFor(() => expect(mockedApi.updateTodo).toHaveBeenCalledWith('todo-1', { column_name: 'In Progress' }))
    expect(within(progressColumn).getByText('移動するタスク')).toBeInTheDocument()
  })

  it('担当者の先頭文字を表示し、未アサインは灰色の「未」にする', async () => {
    mockedApi.getUsers.mockResolvedValue([
      { id: 'user-1', nickname: '山田', created_at: now, updated_at: now },
      { id: 'user-2', nickname: '佐藤', created_at: now, updated_at: now },
    ])
    mockedApi.getTodos.mockResolvedValue([
      { ...todo('todo-1', '佐藤担当'), assignee_id: 'user-2' },
      { ...todo('todo-2', '未担当'), assignee_id: null },
    ])
    render(<ProjectPage project={project} userId="user-1" nickname="山田" onProjectUpdated={onProjectUpdated} />)

    expect(await screen.findByTitle('担当: 佐藤')).toHaveTextContent('佐')
    expect(screen.getByTitle('担当: 未アサイン')).toHaveTextContent('未')
    expect(screen.getByTitle('担当: 未アサイン')).toHaveClass('unassigned')
  })

  it('検索文字に一致するタスクだけを表示する', async () => {
    const user = userEvent.setup()
    mockedApi.getTodos.mockResolvedValue([todo('todo-1', '設計書を作る'), todo('todo-2', 'テストを書く')])
    render(<ProjectPage project={project} userId="user-1" nickname="山田" onProjectUpdated={onProjectUpdated} />)

    await screen.findByText('設計書を作る')
    await user.type(screen.getByPlaceholderText('ボードを検索'), 'テスト')

    expect(screen.getByText('テストを書く')).toBeInTheDocument()
    expect(screen.queryByText('設計書を作る')).not.toBeInTheDocument()
  })

  it('編集アイコンからタスク名を変更する', async () => {
    const user = userEvent.setup()
    mockedApi.getTodos.mockResolvedValue([todo('todo-1', '変更前タスク')])
    mockedApi.updateTodo.mockResolvedValue(todo('todo-1', '変更後タスク'))
    render(<ProjectPage project={project} userId="user-1" nickname="山田" onProjectUpdated={onProjectUpdated} />)

    await screen.findByText('変更前タスク')
    await user.click(screen.getByRole('button', { name: '変更前タスクを編集' }))
    const input = screen.getByRole('textbox', { name: 'タスク名' })
    await user.clear(input)
    await user.type(input, '変更後タスク')
    await user.click(screen.getByRole('button', { name: 'タスク名を保存' }))

    await waitFor(() => expect(mockedApi.updateTodo).toHaveBeenCalledWith('todo-1', { title: '変更後タスク' }))
    expect(screen.getByText('変更後タスク')).toBeInTheDocument()
    expect(screen.queryByText('変更前タスク')).not.toBeInTheDocument()
  })

  it('タスクカードをクリックして詳細画面を開く', async () => {
    const user = userEvent.setup()
    mockedApi.getTodos.mockResolvedValue([todo('todo-1', '詳細を開くタスク')])
    render(<ProjectPage project={project} userId="user-1" nickname="山田" onProjectUpdated={onProjectUpdated} />)

    await user.click(await screen.findByRole('button', { name: '詳細を開くタスクの詳細を開く' }))

    expect(screen.getByRole('dialog', { name: '詳細を開くタスク' })).toBeInTheDocument()
    expect(mockedApi.getTodoComments).toHaveBeenCalledWith('todo-1')
  })

  it('プロジェクト名を変更して保存する', async () => {
    const user = userEvent.setup()
    const updatedProject = { ...project, name: '変更後プロジェクト' }
    mockedApi.getTodos.mockResolvedValue([])
    mockedApi.updateProject.mockResolvedValue(updatedProject)
    const Harness = () => {
      const [currentProject, setCurrentProject] = useState(project)
      return <ProjectPage project={currentProject} userId="user-1" nickname="山田" onProjectUpdated={(updated) => { onProjectUpdated(updated); setCurrentProject(updated) }} />
    }
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'プロジェクト名を変更' }))
    const input = screen.getByRole('textbox', { name: 'プロジェクト名' })
    await user.clear(input)
    await user.type(input, '変更後プロジェクト')
    await user.click(screen.getByRole('button', { name: 'プロジェクト名を保存' }))

    await waitFor(() => expect(mockedApi.updateProject).toHaveBeenCalledWith(project.id, { name: '変更後プロジェクト' }, 'user-1'))
    expect(onProjectUpdated).toHaveBeenCalledWith(updatedProject)
    expect(screen.getByRole('heading', { name: '変更後プロジェクト' })).toBeInTheDocument()
  })

  it('メンバーにはプロジェクト名の変更操作を表示しない', async () => {
    mockedApi.getTodos.mockResolvedValue([])
    render(<ProjectPage project={{ ...project, owner_id: 'owner-1' }} userId="member-1" nickname="佐藤" onProjectUpdated={onProjectUpdated} />)

    expect(await screen.findByRole('heading', { name: project.name })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'プロジェクト名を変更' })).not.toBeInTheDocument()
  })
})
