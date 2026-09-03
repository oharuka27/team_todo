import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectPage from './ProjectPage'
import { apiClient, type BoardColumn, type Project, type TodoItem } from '../services/api'

vi.mock('../services/api', () => ({
  apiClient: {
    getTodos: vi.fn(),
    getColumns: vi.fn(),
    createTodo: vi.fn(),
    deleteTodo: vi.fn(),
    updateTodo: vi.fn(),
    updateColumn: vi.fn(),
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
  created_at: now,
  updated_at: now,
})

describe('ProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getColumns.mockResolvedValue(columns)
  })

  it('タスクを追加し、削除する', async () => {
    const user = userEvent.setup()
    mockedApi.getTodos.mockResolvedValue([todo('todo-1', '既存タスク')])
    mockedApi.createTodo.mockResolvedValue(todo('todo-2', '追加タスク'))
    mockedApi.deleteTodo.mockResolvedValue({ success: true })

    render(<ProjectPage project={project} userId="user-1" nickname="山田" />)
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

  it('ドラッグ＆ドロップでタスクの状態を変更する', async () => {
    mockedApi.getTodos.mockResolvedValue([todo('todo-1', '移動するタスク')])
    mockedApi.updateTodo.mockResolvedValue(todo('todo-1', '移動するタスク', 'In Progress'))
    render(<ProjectPage project={project} userId="user-1" nickname="山田" />)

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

  it('検索文字に一致するタスクだけを表示する', async () => {
    const user = userEvent.setup()
    mockedApi.getTodos.mockResolvedValue([todo('todo-1', '設計書を作る'), todo('todo-2', 'テストを書く')])
    render(<ProjectPage project={project} userId="user-1" nickname="山田" />)

    await screen.findByText('設計書を作る')
    await user.type(screen.getByPlaceholderText('ボードを検索'), 'テスト')

    expect(screen.getByText('テストを書く')).toBeInTheDocument()
    expect(screen.queryByText('設計書を作る')).not.toBeInTheDocument()
  })
})
