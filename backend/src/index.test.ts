import { beforeEach, describe, expect, it } from 'vitest'
import app from './index'

type Row = Record<string, unknown>

class MemoryStatement {
  private params: unknown[] = []

  constructor(private readonly database: MemoryD1, private readonly sql: string) {}

  bind(...params: unknown[]) {
    this.params = params
    return this
  }

  async first<T>() {
    return (this.database.first(this.sql, this.params) ?? null) as T | null
  }

  async all<T>() {
    return { results: this.database.all(this.sql, this.params) as T[] }
  }

  async run() {
    return { meta: { changes: this.database.run(this.sql, this.params) } }
  }
}

class MemoryD1 {
  users: Row[] = []
  projects: Row[] = []
  members: Row[] = []
  columns: Row[] = []
  todos: Row[] = []

  prepare(sql: string) {
    return new MemoryStatement(this, sql)
  }

  async batch(statements: MemoryStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()))
  }

  first(sql: string, params: unknown[]) {
    if (sql.includes('FROM users WHERE id')) return this.users.find((row) => row.id === params[0])
    if (sql.includes('SELECT id FROM projects')) {
      const row = this.projects.find((item) => item.id === params[0])
      return row ? { id: row.id } : undefined
    }
    if (sql.includes('FROM projects WHERE id')) return this.projects.find((row) => row.id === params[0])
    if (sql.includes('FROM board_columns WHERE id')) return this.columns.find((row) => row.id === params[0])
    if (sql.includes('FROM todos WHERE id')) return this.todos.find((row) => row.id === params[0])
    return undefined
  }

  all(sql: string, params: unknown[]) {
    if (sql.includes('SELECT DISTINCT p.* FROM projects')) {
      return this.projects.filter((project) => project.owner_id === params[0] || this.members.some((member) => member.project_id === project.id && member.user_id === params[1]))
    }
    if (sql.includes('FROM board_columns WHERE project_id')) return this.columns.filter((row) => row.project_id === params[0]).sort((a, b) => Number(a.position) - Number(b.position))
    if (sql.includes('FROM todos WHERE project_id')) return this.todos.filter((row) => row.project_id === params[0])
    return []
  }

  run(sql: string, params: unknown[]) {
    if (sql.startsWith('INSERT INTO users')) {
      this.users.push({ id: params[0], nickname: params[1], created_at: params[2], updated_at: params[3] })
      return 1
    }
    if (sql.startsWith('INSERT INTO projects')) {
      this.projects.push({ id: params[0], name: params[1], description: params[2], owner_id: params[3], created_at: params[4], updated_at: params[5] })
      return 1
    }
    if (sql.startsWith('INSERT INTO project_members')) {
      this.members.push({ project_id: params[0], user_id: params[1], role: 'owner', created_at: params[2] })
      return 1
    }
    if (sql.startsWith('INSERT INTO board_columns')) {
      this.columns.push({ id: params[0], project_id: params[1], title: params[2], position: params[3], created_at: params[4], updated_at: params[5] })
      return 1
    }
    if (sql.startsWith('INSERT INTO todos')) {
      this.todos.push({ id: params[0], project_id: params[1], title: params[2], description: params[3], status: params[4], column_name: params[5], user_id: params[6], created_at: params[7], updated_at: params[8] })
      return 1
    }
    if (sql.startsWith('UPDATE todos SET title')) {
      const todo = this.todos.find((row) => row.id === params[5])
      if (!todo) return 0
      Object.assign(todo, { title: params[0], description: params[1], status: params[2], column_name: params[3], updated_at: params[4] })
      return 1
    }
    if (sql.startsWith('UPDATE projects SET name')) {
      const project = this.projects.find((row) => row.id === params[3])
      if (!project) return 0
      Object.assign(project, { name: params[0], description: params[1], updated_at: params[2] })
      return 1
    }
    if (sql.startsWith('DELETE FROM todos WHERE id')) return this.remove(this.todos, 'id', params[0])
    if (sql.startsWith('DELETE FROM todos WHERE project_id')) return this.remove(this.todos, 'project_id', params[0])
    if (sql.startsWith('DELETE FROM board_columns WHERE project_id')) return this.remove(this.columns, 'project_id', params[0])
    if (sql.startsWith('DELETE FROM project_members WHERE project_id')) return this.remove(this.members, 'project_id', params[0])
    if (sql.startsWith('DELETE FROM projects WHERE id')) return this.remove(this.projects, 'id', params[0])
    return 0
  }

  private remove(rows: Row[], key: string, value: unknown) {
    const previousLength = rows.length
    const remaining = rows.filter((row) => row[key] !== value)
    rows.splice(0, rows.length, ...remaining)
    return previousLength - rows.length
  }
}

const jsonRequest = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('Team Todo API', () => {
  let database: MemoryD1
  let environment: { DB: D1Database; ENVIRONMENT: string }

  beforeEach(() => {
    database = new MemoryD1()
    environment = { DB: database as unknown as D1Database, ENVIRONMENT: 'test' }
  })

  it('ニックネームを整形してユーザー登録する', async () => {
    const response = await app.request('/api/users', jsonRequest({ id: 'user-1', nickname: '  山田  ' }), environment)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id: 'user-1', nickname: '山田' })
    expect(database.users).toHaveLength(1)
  })

  it('空のニックネームを拒否する', async () => {
    const response = await app.request('/api/users', jsonRequest({ id: 'user-1', nickname: '   ' }), environment)

    expect(response.status).toBe(400)
    expect(database.users).toHaveLength(0)
  })

  it('プロジェクトと標準カラムを作成する', async () => {
    const response = await app.request('/api/projects', jsonRequest({ name: '新規プロジェクト', user_id: 'user-1' }), environment)
    const project = await response.json() as { id: string; name: string }

    expect(response.status).toBe(201)
    expect(project.name).toBe('新規プロジェクト')
    expect(database.projects).toHaveLength(1)
    expect(database.members).toHaveLength(1)
    expect(database.columns.map((column) => column.title)).toEqual(['To Do', 'In Progress', 'In Review', 'Done'])
  })

  it('プロジェクト名を更新する', async () => {
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '変更前', user_id: 'user-1' }), environment)
    const project = await createResponse.json() as { id: string }

    const response = await app.request(`/api/projects/${project.id}`, jsonRequest({ name: '  変更後  ' }, 'PUT'), environment)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: project.id, name: '変更後' })
    expect(database.projects[0].name).toBe('変更後')
  })

  it('タスクを作成し、状態を変更して削除する', async () => {
    const createResponse = await app.request('/api/todos', jsonRequest({ project_id: 'project-1', title: 'テストを書く', column_name: 'To Do', user_id: 'user-1' }), environment)
    const created = await createResponse.json() as { id: string }

    expect(createResponse.status).toBe(201)
    const updateResponse = await app.request(`/api/todos/${created.id}`, jsonRequest({ column_name: 'In Progress' }, 'PUT'), environment)
    expect(updateResponse.status).toBe(200)
    expect(await updateResponse.json()).toMatchObject({ id: created.id, column_name: 'In Progress' })

    const deleteResponse = await app.request(`/api/todos/${created.id}`, { method: 'DELETE' }, environment)
    expect(deleteResponse.status).toBe(200)
    expect(database.todos).toHaveLength(0)
  })

  it('タスク名を更新する', async () => {
    const createResponse = await app.request('/api/todos', jsonRequest({ project_id: 'project-1', title: '変更前タスク', column_name: 'To Do', user_id: 'user-1' }), environment)
    const created = await createResponse.json() as { id: string }

    const response = await app.request(`/api/todos/${created.id}`, jsonRequest({ title: '  変更後タスク  ' }, 'PUT'), environment)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: created.id, title: '変更後タスク' })
    expect(database.todos[0].title).toBe('変更後タスク')
  })

  it('プロジェクト削除時に関連データも削除し、再実行も成功する', async () => {
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '削除対象', user_id: 'user-1' }), environment)
    const project = await createResponse.json() as { id: string }
    await app.request('/api/todos', jsonRequest({ project_id: project.id, title: '関連タスク', column_name: 'To Do', user_id: 'user-1' }), environment)

    const response = await app.request(`/api/projects/${project.id}`, { method: 'DELETE' }, environment)
    expect(response.status).toBe(200)
    expect(database.projects).toHaveLength(0)
    expect(database.members).toHaveLength(0)
    expect(database.columns).toHaveLength(0)
    expect(database.todos).toHaveLength(0)

    const repeatedResponse = await app.request(`/api/projects/${project.id}`, { method: 'DELETE' }, environment)
    expect(repeatedResponse.status).toBe(200)
  })
})
