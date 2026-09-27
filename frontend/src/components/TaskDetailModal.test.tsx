import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TaskDetailModal from './TaskDetailModal'
import { apiClient, type ProjectMember, type TodoComment, type TodoItem } from '../services/api'

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
const members: ProjectMember[] = [
  { project_id: 'project-1', user_id: 'user-1', role: 'owner', nickname: '山田' },
  { project_id: 'project-1', user_id: 'user-2', role: 'member', nickname: '佐藤' },
]
const todo: TodoItem = { id: 'todo-1', project_id: 'project-1', title: '詳細タスク', description: '', status: 'not_started', column_name: 'To Do', user_id: 'user-1', assignee_id: 'user-1', created_at: now, updated_at: now }

describe('TaskDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    render(<TaskDetailModal todo={todo} members={members} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={onUpdated} />)

    expect(screen.getByText('作成者').closest('div')).toHaveTextContent('山田')
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
    expect(mockedApi.createTodoComment).toHaveBeenCalledWith(todo.id, '確認しました')
  })

  it('担当者の選択肢をプロジェクトメンバーに限定する', async () => {
    render(<TaskDetailModal todo={todo} members={members.slice(0, 1)} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={vi.fn()} />)

    const assignee = screen.getByRole('combobox', { name: '担当者' })
    expect(within(assignee).getAllByRole('option').map((option) => option.textContent)).toEqual(['未割り当て', '山田'])
    expect(mockedApi.getUsers).not.toHaveBeenCalled()
  })

  it('他の変更で再描画されても、入力中の説明を保持する', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TaskDetailModal todo={todo} members={members} refreshToken={0} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: '説明' }), '書きかけの説明')
    rerender(<TaskDetailModal todo={{ ...todo, title: '他のメンバーが変更' }} members={members} refreshToken={1} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: '説明' })).toHaveValue('書きかけの説明')
    expect(screen.getByRole('heading', { name: '他のメンバーが変更' })).toBeInTheDocument()
  })

  it('未編集の説明はサーバー側の変更に追従する', () => {
    const { rerender } = render(<TaskDetailModal todo={todo} members={members} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={vi.fn()} />)

    rerender(<TaskDetailModal todo={{ ...todo, description: '他のメンバーが書いた説明' }} members={members} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: '説明' })).toHaveValue('他のメンバーが書いた説明')
  })

  it('タスクの所属トピックを変更する', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    const topic = { id: 'topic-1', project_id: todo.project_id, name: '設計', created_at: now, updated_at: now }
    mockedApi.updateTodo.mockResolvedValue({ ...todo, topic_id: topic.id })
    render(<TaskDetailModal todo={todo} topics={[topic]} userId="user-1" nickname="山田" onClose={vi.fn()} onUpdated={onUpdated} />)

    const topicSection = screen.getByRole('combobox', { name: 'トピック' }).closest('.task-detail-section') as HTMLElement
    const descriptionSection = screen.getByRole('textbox', { name: '説明' }).closest('.task-detail-section') as HTMLElement
    expect(topicSection.compareDocumentPosition(descriptionSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.selectOptions(screen.getByRole('combobox', { name: 'トピック' }), topic.id)
    await waitFor(() => expect(mockedApi.updateTodo).toHaveBeenCalledWith(todo.id, { topic_id: topic.id }))
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ topic_id: topic.id }))
  })
})
