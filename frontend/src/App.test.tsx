import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { apiClient, type Project, type UserAccount } from './services/api'

vi.mock('./services/api', () => ({
  apiClient: {
    registerUser: vi.fn(),
    getProjects: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
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
const project = (id: string, name: string): Project => ({ id, name, owner_id: 'user-test', created_at: now, updated_at: now })

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getProjects.mockResolvedValue([])
    mockedApi.getTodos.mockResolvedValue([])
    mockedApi.getColumns.mockResolvedValue([])
  })

  it('登録したニックネームと先頭文字を表示する', async () => {
    const user = userEvent.setup()
    const account: UserAccount = { id: 'user-test', nickname: 'Haruka', created_at: now, updated_at: now }
    mockedApi.registerUser.mockResolvedValue(account)

    render(<App />)
    await user.type(screen.getByRole('textbox', { name: 'ニックネーム' }), 'Haruka')
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByText('Haruka')).toBeInTheDocument()
    expect(screen.getByText('H')).toHaveClass('avatar')
    expect(localStorage.getItem('nickname')).toBe('Haruka')
    expect(mockedApi.registerUser).toHaveBeenCalledWith(expect.stringMatching(/^user_/), 'Haruka')
  })

  it('プロジェクトを追加し、確認入力後に削除する', async () => {
    const user = userEvent.setup()
    localStorage.setItem('userId', 'user-test')
    localStorage.setItem('nickname', '山田')
    mockedApi.getProjects.mockResolvedValue([project('project-1', '既存プロジェクト')])
    mockedApi.createProject.mockResolvedValue(project('project-2', '新規プロジェクト'))
    mockedApi.deleteProject.mockResolvedValue({ success: true })

    render(<App />)
    await screen.findByRole('button', { name: '既存プロジェクト' })
    await user.click(screen.getByRole('button', { name: 'プロジェクトを追加' }))
    await user.type(screen.getByRole('textbox', { name: 'プロジェクト名' }), '新規プロジェクト')
    await user.click(screen.getByRole('button', { name: '決定' }))

    const newProjectButton = await screen.findByRole('button', { name: '新規プロジェクト' })
    expect(mockedApi.createProject).toHaveBeenCalledWith('新規プロジェクト', undefined, 'user-test')

    fireEvent.contextMenu(newProjectButton, { clientX: 100, clientY: 100 })
    await user.click(screen.getByRole('menuitem', { name: /削除/ }))
    const executeButton = screen.getByRole('button', { name: '実行' })
    expect(executeButton).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: /確認のため/ }), '削除')
    await user.click(executeButton)

    await waitFor(() => expect(mockedApi.deleteProject).toHaveBeenCalledWith('project-2'))
    expect(screen.queryByRole('button', { name: '新規プロジェクト' })).not.toBeInTheDocument()
  })
})
