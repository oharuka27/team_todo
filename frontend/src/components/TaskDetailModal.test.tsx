import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TaskDetailModal from './TaskDetailModal'
import { apiClient, type TodoComment, type TodoItem, type UserAccount } from '../services/api'

vi.mock('../services/api', () => ({
  apiClient: {
    getUsers: vi.fn(),
    getTodoComments: vi.fn(),
    updateTodo: vi.fn(),
    createTodoComment: vi.fn(),
  },
}))

const mockedApi = vi.mocked(apiClient)
const now = '2026-09-03T00:00:00.000Z'
const users: UserAccount[] = [
  { id: 'user-1', nickname: '山田', created_at: now, updated_at: now },
  { id: 'user-2', nickname: '佐藤', created_at: now, updated_at: now },
]
const todo: TodoItem = { id: 'todo-1', project_id: 'project-1', title: '詳細タスク', description: '', status: 'not_started', column_name: 'To Do', user_id: 'user-1', assignee_id: 'user-1', created_at: now, updated_at: now }

describe('TaskDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getUsers.mockResolvedValue(users)
    mockedApi.getTodoComments.mockResolvedValue([])
  })

  it('タスク名・説明・担当者を更新し、作成者とコメントを表示する', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    mockedApi.updateTodo
      .mockResolvedValueOnce({ ...todo, title: '変更後タスク' })
      .mockResolvedValueOnce({ ...todo, title: '変更後タスク', description: '詳細な説明' })
      .mockResolvedValueOnce({ ...todo, title: '変更後タスク', description: '詳細な説明', assignee_id: 'user-2' })
    const createdComment: TodoComment = { id: 'comment-1', todo_id: todo.id, user_id: 'user-1', nickname: '山田', body: '確認しました', created_at: now }
    mockedApi.createTodoComment.mockResolvedValue(createdComment)
    render(<TaskDetailModal todo={todo} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={onUpdated} />)

    expect(await screen.findByText('山田')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'タスク名を編集' }))
    const titleInput = screen.getByRole('textbox', { name: '詳細のタスク名' })
    await user.clear(titleInput)
    await user.type(titleInput, '変更後タスク')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mockedApi.updateTodo).toHaveBeenCalledWith(todo.id, { title: '変更後タスク' }))

    await user.type(screen.getByRole('textbox', { name: '説明' }), '詳細な説明')
    await user.click(screen.getByRole('button', { name: '説明を保存' }))
    await waitFor(() => expect(mockedApi.updateTodo).toHaveBeenCalledWith(todo.id, { description: '詳細な説明' }))

    await user.selectOptions(screen.getByRole('combobox', { name: '担当者' }), 'user-2')
    await waitFor(() => expect(mockedApi.updateTodo).toHaveBeenCalledWith(todo.id, { assignee_id: 'user-2' }))

    await user.type(screen.getByRole('textbox', { name: 'コメント' }), '確認しました')
    await user.click(screen.getByRole('button', { name: '追加' }))
    expect(await screen.findByText('確認しました')).toBeInTheDocument()
    expect(mockedApi.createTodoComment).toHaveBeenCalledWith(todo.id, 'user-1', '確認しました')
  })

  it('タスクの所属トピックを変更する', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    const topic = { id: 'topic-1', project_id: todo.project_id, name: '設計', created_at: now, updated_at: now }
    mockedApi.updateTodo.mockResolvedValue({ ...todo, topic_id: topic.id })
    render(<TaskDetailModal todo={todo} topics={[topic]} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={onUpdated} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'トピック' }), topic.id)
    await waitFor(() => expect(mockedApi.updateTodo).toHaveBeenCalledWith(todo.id, { topic_id: topic.id }))
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ topic_id: topic.id }))
  })
})
