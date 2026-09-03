import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { apiClient, type Project, type UserAccount } from './services/api'

vi.mock('./services/api', () => ({
  apiClient: {
    registerUser: vi.fn(),
    connectUserEvents: vi.fn(),
    connectProjectEvents: vi.fn(),
    getProjects: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    getTodos: vi.fn(),
    getColumns: vi.fn(),
    createTodo: vi.fn(),
    deleteTodo: vi.fn(),
    updateTodo: vi.fn(),
    updateColumn: vi.fn(),
    getProjectNotifications: vi.fn(),
    acknowledgeProjectNotifications: vi.fn(),
    getUsers: vi.fn(),
    getProjectMembers: vi.fn(),
    addProjectMember: vi.fn(),
    removeProjectMember: vi.fn(),
    leaveProject: vi.fn(),
    getTodoComments: vi.fn(),
    createTodoComment: vi.fn(),
  },
}))

const mockedApi = vi.mocked(apiClient)
const now = '2026-09-03T00:00:00.000Z'
const project = (id: string, name: string): Project => ({ id, name, owner_id: 'user-test', created_at: now, updated_at: now })
let userSocket: WebSocket

const websocketStub = () => ({
  onmessage: null,
  onclose: null,
  onerror: null,
  close: vi.fn(),
}) as unknown as WebSocket

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getProjects.mockResolvedValue([])
    mockedApi.getTodos.mockResolvedValue([])
    mockedApi.getColumns.mockResolvedValue([])
    mockedApi.getProjectNotifications.mockResolvedValue([])
    mockedApi.getUsers.mockResolvedValue([])
    mockedApi.getProjectMembers.mockResolvedValue([])
    userSocket = websocketStub()
    mockedApi.connectUserEvents.mockReturnValue(userSocket)
    mockedApi.connectProjectEvents.mockImplementation(() => websocketStub())
  })

  it('オーナー／メンバープロジェクトを分類し、オーナーがメンバーを追加する', async () => {
    const user = userEvent.setup()
    localStorage.setItem('userId', 'user-test'); localStorage.setItem('nickname', '山田')
    mockedApi.getProjects.mockResolvedValue([project('owner-project', '所有プロジェクト'), { ...project('member-project', '参加プロジェクト'), owner_id: 'other-user' }])
    mockedApi.getUsers.mockResolvedValue([{ id: 'member-1', nickname: '佐藤', created_at: now, updated_at: now }])
    mockedApi.getProjectMembers.mockResolvedValue([])
    mockedApi.addProjectMember.mockResolvedValue({ project_id: 'owner-project', user_id: 'member-1', role: 'member', nickname: '佐藤' })
    render(<App />)

    expect(await screen.findByText('オーナープロジェクト')).toBeInTheDocument()
    expect(screen.getByText('メンバープロジェクト')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '所有プロジェクト' }))
    await user.click(screen.getByRole('menuitem', { name: /メンバー追加/ }))
    await user.click(await screen.findByRole('checkbox', { name: /佐藤/ }))
    await user.click(screen.getByRole('button', { name: '実行' }))

    await waitFor(() => expect(mockedApi.addProjectMember).toHaveBeenCalledWith('owner-project', 'user-test', 'member-1'))
  })

  it('招待通知を確認してからメンバープロジェクトを表示する', async () => {
    const user = userEvent.setup()
    localStorage.setItem('userId', 'user-test'); localStorage.setItem('nickname', '山田')
    mockedApi.getProjects.mockResolvedValue([{ ...project('member-project', '参加プロジェクト'), owner_id: 'other-user' }])
    mockedApi.getProjectNotifications.mockResolvedValue([{ project_id: 'member-project', project_name: '参加プロジェクト' }])
    mockedApi.acknowledgeProjectNotifications.mockResolvedValue({ success: true })
    render(<App />)

    expect(await screen.findByText('「参加プロジェクト」プロジェクトに追加されました。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(mockedApi.acknowledgeProjectNotifications).toHaveBeenCalledWith('user-test', ['member-project']))
    expect(screen.queryByRole('dialog', { name: 'プロジェクトに追加されました' })).not.toBeInTheDocument()
  })

  it('画面に戻ったとき追加されたプロジェクトを自動取得して通知する', async () => {
    localStorage.setItem('userId', 'user-test'); localStorage.setItem('nickname', '山田')
    render(<App />)
    await screen.findByText('オーナープロジェクト')

    mockedApi.getProjects.mockResolvedValue([{ ...project('member-project', '新しい参加プロジェクト'), owner_id: 'other-user' }])
    mockedApi.getProjectNotifications.mockResolvedValue([{ project_id: 'member-project', project_name: '新しい参加プロジェクト' }])
    fireEvent.focus(window)

    expect(await screen.findByText('「新しい参加プロジェクト」プロジェクトに追加されました。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新しい参加プロジェクト' })).toBeInTheDocument()
  })

  it('WebSocketで招待イベントを受信するとポップアップを自動表示する', async () => {
    localStorage.setItem('userId', 'user-test'); localStorage.setItem('nickname', '山田')
    render(<App />)
    await screen.findByText('オーナープロジェクト')

    mockedApi.getProjects.mockResolvedValue([{ ...project('member-project', 'リアルタイム参加'), owner_id: 'other-user' }])
    mockedApi.getProjectNotifications.mockResolvedValue([{ project_id: 'member-project', project_name: 'リアルタイム参加' }])
    userSocket.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'membership.added', project_id: 'member-project' }) }))

    expect(await screen.findByText('「リアルタイム参加」プロジェクトに追加されました。')).toBeInTheDocument()
  })

  it('メンバープロジェクトから確認入力後に脱退する', async () => {
    const user = userEvent.setup()
    localStorage.setItem('userId', 'user-test'); localStorage.setItem('nickname', '山田')
    mockedApi.getProjects.mockResolvedValue([{ ...project('member-project', '参加プロジェクト'), owner_id: 'other-user' }])
    mockedApi.leaveProject.mockResolvedValue({ success: true })
    render(<App />)

    const projectButton = await screen.findByRole('button', { name: '参加プロジェクト' })
    fireEvent.contextMenu(projectButton)
    await user.click(screen.getByRole('menuitem', { name: '脱退' }))
    await user.type(screen.getByRole('textbox', { name: /確認のため「脱退」/ }), '脱退')
    await user.click(screen.getByRole('button', { name: '実行' }))

    await waitFor(() => expect(mockedApi.leaveProject).toHaveBeenCalledWith('member-project', 'user-test'))
    expect(screen.queryByRole('button', { name: '参加プロジェクト' })).not.toBeInTheDocument()
  })

  it('オーナーが確認入力後に選択したメンバーを削除する', async () => {
    const user = userEvent.setup()
    localStorage.setItem('userId', 'user-test'); localStorage.setItem('nickname', '山田')
    mockedApi.getProjects.mockResolvedValue([project('owner-project', '所有プロジェクト')])
    mockedApi.getUsers.mockResolvedValue([{ id: 'member-1', nickname: '佐藤', created_at: now, updated_at: now }])
    mockedApi.getProjectMembers.mockResolvedValue([{ project_id: 'owner-project', user_id: 'member-1', role: 'member', nickname: '佐藤' }])
    mockedApi.removeProjectMember.mockResolvedValue({ success: true })
    render(<App />)

    fireEvent.contextMenu(await screen.findByRole('button', { name: '所有プロジェクト' }))
    await user.click(screen.getByRole('menuitem', { name: 'メンバー削除' }))
    await user.click(await screen.findByRole('checkbox', { name: /佐藤/ }))
    const executeButton = screen.getByRole('button', { name: '実行' })
    expect(executeButton).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: '確認入力' }), '削除')
    await user.click(executeButton)

    await waitFor(() => expect(mockedApi.removeProjectMember).toHaveBeenCalledWith('owner-project', 'user-test', 'member-1'))
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
    await user.click(screen.getByRole('menuitem', { name: 'プロジェクト削除' }))
    const executeButton = screen.getByRole('button', { name: '実行' })
    expect(executeButton).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: /確認のため/ }), '削除')
    await user.click(executeButton)

    await waitFor(() => expect(mockedApi.deleteProject).toHaveBeenCalledWith('project-2', 'user-test'))
    expect(screen.queryByRole('button', { name: '新規プロジェクト' })).not.toBeInTheDocument()
  })
})
