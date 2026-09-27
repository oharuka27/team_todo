import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MemberDialog from './MemberDialog'
import { apiClient, type Project } from '../services/api'

vi.mock('../services/api', () => ({
  apiClient: {
    getUsers: vi.fn(),
    getProjectMembers: vi.fn(),
    addProjectMember: vi.fn(),
    removeProjectMember: vi.fn(),
  },
}))

const mockedApi = vi.mocked(apiClient)
const now = '2026-09-03T00:00:00.000Z'
const project: Project = { id: 'project-1', name: '共同プロジェクト', owner_id: 'owner-1', created_at: now, updated_at: now }

describe('MemberDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getUsers.mockResolvedValue([
      { id: 'owner-1', nickname: '山田', created_at: now, updated_at: now },
      { id: 'member-1', nickname: '佐藤', created_at: now, updated_at: now },
      { id: 'user-3', nickname: '鈴木', created_at: now, updated_at: now },
    ])
    mockedApi.getProjectMembers.mockResolvedValue([
      { project_id: project.id, user_id: 'owner-1', role: 'owner', nickname: '山田' },
      { project_id: project.id, user_id: 'member-1', role: 'member', nickname: '佐藤' },
    ])
  })

  it('追加候補にはオーナーと既存メンバーを表示しない', async () => {
    render(<MemberDialog project={project} mode="add" onClose={vi.fn()} />)

    expect(await screen.findByRole('checkbox', { name: /鈴木/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /山田/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /佐藤/ })).not.toBeInTheDocument()
  })

  it('onAdded を渡さなくてもメンバーを追加してから閉じる', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockedApi.addProjectMember.mockResolvedValue({ project_id: project.id, user_id: 'user-3', role: 'member', nickname: '鈴木' })
    render(<MemberDialog project={project} mode="add" onClose={onClose} />)

    await user.click(await screen.findByRole('checkbox', { name: /鈴木/ }))
    await user.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockedApi.addProjectMember).toHaveBeenCalledWith(project.id, 'user-3')
  })

  it('追加したメンバーを onAdded に渡す', async () => {
    const user = userEvent.setup()
    const added = { project_id: project.id, user_id: 'user-3', role: 'member' as const, nickname: '鈴木' }
    const onAdded = vi.fn()
    mockedApi.addProjectMember.mockResolvedValue(added)
    render(<MemberDialog project={project} mode="add" onAdded={onAdded} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('checkbox', { name: /鈴木/ }))
    await user.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith([added]))
  })

  it('削除は一般メンバーだけを候補にし、確認入力後に実行する', async () => {
    const user = userEvent.setup()
    mockedApi.removeProjectMember.mockResolvedValue({ success: true })
    render(<MemberDialog project={project} mode="remove" onClose={vi.fn()} />)

    await user.click(await screen.findByRole('checkbox', { name: /佐藤/ }))
    expect(screen.queryByRole('checkbox', { name: /山田/ })).not.toBeInTheDocument()
    expect(mockedApi.getUsers).not.toHaveBeenCalled()
    const execute = screen.getByRole('button', { name: '実行' })
    expect(execute).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '確認入力' }), '削除')
    await user.click(execute)

    await waitFor(() => expect(mockedApi.removeProjectMember).toHaveBeenCalledWith(project.id, 'member-1'))
  })

  it('失敗したらダイアログを開いたままエラーを表示する', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockedApi.addProjectMember.mockRejectedValue(new Error('network'))
    render(<MemberDialog project={project} mode="add" onClose={onClose} />)

    await user.click(await screen.findByRole('checkbox', { name: /鈴木/ }))
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('メンバーを追加できませんでした。')
    expect(onClose).not.toHaveBeenCalled()
  })
})
