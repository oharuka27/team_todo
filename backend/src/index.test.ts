import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from './index'
import { TestD1 } from './test/d1'

// Tests use the Clerk user ID itself as the session token; 'invalid' simulates a rejected token.
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(async (token: string) => {
    if (token === 'invalid') throw new Error('Invalid token')
    return { sub: token }
  }),
}))

class MemoryRealtime {
  messages: Array<{ channel: string; event: { type: string; project_id?: string; user_id?: string } }> = []
  idFromName(name: string) { return name }
  get(channel: string) {
    return { fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) this.messages.push({ channel, event: JSON.parse(String(init.body)) })
      return new Response(null, { status: 204 })
    } }
  }
}

const auth = (userId: string) => ({ Authorization: `Bearer ${userId}` })

const jsonRequest = (body: unknown, method = 'POST', userId = 'user-1'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...auth(userId) },
  body: JSON.stringify(body),
})

const request = (method = 'GET', userId = 'user-1'): RequestInit => ({ method, headers: auth(userId) })

describe('Team Todo API', () => {
  let database: TestD1
  let realtime: MemoryRealtime
  let environment: { DB: D1Database; ENVIRONMENT: string; REALTIME: DurableObjectNamespace; CLERK_SECRET_KEY: string }

  const createProject = async (name = 'テストプロジェクト', ownerId = 'user-1') => {
    const response = await app.request('/api/projects', jsonRequest({ name }, 'POST', ownerId), environment)
    return await response.json() as { id: string }
  }

  beforeEach(() => {
    database = new TestD1()
    realtime = new MemoryRealtime()
    environment = { DB: database as unknown as D1Database, ENVIRONMENT: 'test', REALTIME: realtime as unknown as DurableObjectNamespace, CLERK_SECRET_KEY: 'sk_test' }
  })

  it('セッショントークンのないリクエストや不正なトークンを拒否する', async () => {
    expect((await app.request('/api/projects', undefined, environment)).status).toBe(401)
    expect((await app.request('/api/projects', request('GET', 'invalid'), environment)).status).toBe(401)
    expect((await app.request('/health', undefined, environment)).status).toBe(200)
  })

  it('ニックネームを整形し、トークンのユーザーIDで登録する', async () => {
    const response = await app.request('/api/users', jsonRequest({ id: 'spoofed-user', nickname: '  山田  ' }), environment)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id: 'user-1', nickname: '山田' })
    expect(database.users).toHaveLength(1)
  })

  it('ログイン中のユーザー情報を取得し、未登録なら404を返す', async () => {
    expect((await app.request('/api/users/me', request(), environment)).status).toBe(404)
    database.seedUser('user-1', '山田')

    const response = await app.request('/api/users/me', request(), environment)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 'user-1', nickname: '山田' })
  })

  it('空のニックネームを拒否する', async () => {
    const response = await app.request('/api/users', jsonRequest({ nickname: '   ' }), environment)

    expect(response.status).toBe(400)
    expect(database.users).toHaveLength(0)
  })

  it('ユーザー名とアイコン背景色を更新する', async () => {
    await app.request('/api/users', jsonRequest({ nickname: '変更前' }), environment)
    const response = await app.request('/api/users/user-1', jsonRequest({ nickname: '変更後', avatar_color: '#336699' }, 'PUT'), environment)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ nickname: '変更後', avatar_color: '#336699' })
    expect(database.users[0]).toMatchObject({ nickname: '変更後', avatar_color: '#336699' })
  })

  it('他のユーザーの設定変更や通知の取得を拒否する', async () => {
    database.seedUser('user-1', '山田')

    expect((await app.request('/api/users/user-1', jsonRequest({ user_id: 'user-1', nickname: '乗っ取り', avatar_color: '#336699' }, 'PUT', 'attacker'), environment)).status).toBe(403)
    expect((await app.request('/api/users/user-1/project-notifications', request('GET', 'attacker'), environment)).status).toBe(403)
    expect((await app.request('/api/users/user-1/project-notifications/acknowledge', jsonRequest({ project_ids: ['project-1'] }, 'POST', 'attacker'), environment)).status).toBe(403)
    expect(database.users[0].nickname).toBe('山田')
  })

  it('プロジェクトと標準カラムを作成する', async () => {
    const response = await app.request('/api/projects', jsonRequest({ name: '新規プロジェクト', user_id: 'spoofed-user' }), environment)
    const project = await response.json() as { id: string; name: string; owner_id: string }

    expect(response.status).toBe(201)
    expect(project.name).toBe('新規プロジェクト')
    expect(project.owner_id).toBe('user-1')
    expect(database.projects).toHaveLength(1)
    expect(database.members).toHaveLength(1)
    expect(database.columns.map((column) => column.title)).toEqual(['To Do', 'In Progress', 'In Review', 'Done'])
  })

  it('プロジェクト名を更新する', async () => {
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '変更前' }), environment)
    const project = await createResponse.json() as { id: string }

    const response = await app.request(`/api/projects/${project.id}`, jsonRequest({ name: '  変更後  ' }, 'PUT'), environment)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: project.id, name: '変更後' })
    expect(database.projects[0].name).toBe('変更後')
  })

  it('同じグループ内のプロジェクト表示順を保存する', async () => {
    const firstResponse = await app.request('/api/projects', jsonRequest({ name: '一番目' }), environment)
    const secondResponse = await app.request('/api/projects', jsonRequest({ name: '二番目' }), environment)
    const first = await firstResponse.json() as { id: string }
    const second = await secondResponse.json() as { id: string }
    // Simulate a project created before owners had a project_members row (migration 0006).
    database.execute('DELETE FROM project_members WHERE project_id = ?', first.id)

    const response = await app.request('/api/users/user-1/project-order', jsonRequest({ group: 'owner', project_ids: [second.id, first.id] }, 'PUT'), environment)

    expect(response.status).toBe(200)
    expect(database.members.find((member) => member.project_id === second.id)?.sort_order).toBe(0)
    expect(database.members.find((member) => member.project_id === first.id)?.sort_order).toBe(1)
    const invalidResponse = await app.request('/api/users/user-1/project-order', jsonRequest({ group: 'owner', project_ids: [second.id, 'member-project'] }, 'PUT'), environment)
    expect(invalidResponse.status).toBe(400)
    const forbiddenResponse = await app.request('/api/users/user-1/project-order', jsonRequest({ group: 'owner', project_ids: [first.id, second.id] }, 'PUT', 'attacker'), environment)
    expect(forbiddenResponse.status).toBe(403)
  })

  it('タスクを作成し、状態を変更して削除する', async () => {
    const project = await createProject()
    const createResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: 'テストを書く', column_name: 'To Do', user_id: 'spoofed-user' }), environment)
    const created = await createResponse.json() as { id: string; user_id: string; assignee_id: string }

    expect(createResponse.status).toBe(201)
    expect(created).toMatchObject({ user_id: 'user-1', assignee_id: 'user-1' })
    const updateResponse = await app.request(`/api/todos/${created.id}`, jsonRequest({ column_name: 'In Progress' }, 'PUT'), environment)
    expect(updateResponse.status).toBe(200)
    expect(await updateResponse.json()).toMatchObject({ id: created.id, column_name: 'In Progress' })

    const deleteResponse = await app.request(`/api/todos/${created.id}`, request('DELETE'), environment)
    expect(deleteResponse.status).toBe(200)
    expect(database.todos).toHaveLength(0)
  })

  it('タスク名を更新する', async () => {
    const project = await createProject()
    const createResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: '変更前タスク', column_name: 'To Do' }), environment)
    const created = await createResponse.json() as { id: string }

    const response = await app.request(`/api/todos/${created.id}`, jsonRequest({ title: '  変更後タスク  ' }, 'PUT'), environment)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: created.id, title: '変更後タスク' })
    expect(database.todos[0].title).toBe('変更後タスク')
  })

  it('トピックを作成し、タスクの所属トピックを設定する', async () => {
    const project = await createProject()
    const topicResponse = await app.request(`/api/projects/${project.id}/topics`, jsonRequest({ name: 'フロントエンド' }), environment)
    const topic = await topicResponse.json() as { id: string }
    expect(topicResponse.status).toBe(201)
    const colorResponse = await app.request(`/api/topics/${topic.id}`, jsonRequest({ color: '#336699' }, 'PUT'), environment)
    expect(await colorResponse.json()).toMatchObject({ color: '#336699' })

    const todoResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, topic_id: topic.id, title: '画面を作る', column_name: 'To Do' }), environment)
    const todo = await todoResponse.json() as { id: string; topic_id: string }
    expect(todo.topic_id).toBe(topic.id)

    const updateResponse = await app.request(`/api/todos/${todo.id}`, jsonRequest({ topic_id: null }, 'PUT'), environment)
    expect(await updateResponse.json()).toMatchObject({ topic_id: null })
  })

  it('タスクの説明・担当者・コメントを保存する', async () => {
    database.seedUser('user-1', '山田')
    database.seedUser('user-2', '佐藤')
    const project = await createProject()
    await app.request(`/api/projects/${project.id}/members`, jsonRequest({ user_id: 'user-2' }), environment)
    const createResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: '詳細タスク', column_name: 'To Do' }), environment)
    const created = await createResponse.json() as { id: string }

    const updateResponse = await app.request(`/api/todos/${created.id}`, jsonRequest({ description: '詳細な説明', assignee_id: 'user-2' }, 'PUT'), environment)
    expect(await updateResponse.json()).toMatchObject({ description: '詳細な説明', assignee_id: 'user-2', user_id: 'user-1' })

    const commentResponse = await app.request(`/api/todos/${created.id}/comments`, jsonRequest({ user_id: 'user-2', body: '確認しました' }), environment)
    expect(commentResponse.status).toBe(201)
    expect(await commentResponse.json()).toMatchObject({ body: '確認しました', user_id: 'user-1', nickname: '山田' })

    const listResponse = await app.request(`/api/todos/${created.id}/comments`, request(), environment)
    expect(await listResponse.json()).toEqual([expect.objectContaining({ body: '確認しました' })])
  })

  it('メンバー以外によるプロジェクト配下のデータの閲覧・変更を拒否する', async () => {
    database.seedUser('user-1', '山田')
    database.seedUser('outsider', '部外者')
    const project = await createProject()
    const todoResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: '機密タスク', column_name: 'To Do' }), environment)
    const todo = await todoResponse.json() as { id: string }
    const topicResponse = await app.request(`/api/projects/${project.id}/topics`, jsonRequest({ name: '機密トピック' }), environment)
    const topic = await topicResponse.json() as { id: string }
    const column = database.columns[0] as { id: string }

    const attempts: Array<[string, RequestInit]> = [
      [`/api/projects/${project.id}`, request('GET', 'outsider')],
      [`/api/projects/${project.id}/members`, request('GET', 'outsider')],
      [`/api/projects/${project.id}/columns`, request('GET', 'outsider')],
      [`/api/projects/${project.id}/topics`, request('GET', 'outsider')],
      [`/api/projects/${project.id}/topics`, jsonRequest({ name: '侵入' }, 'POST', 'outsider')],
      [`/api/projects/${project.id}/todos`, request('GET', 'outsider')],
      ['/api/todos', jsonRequest({ project_id: project.id, title: '侵入', column_name: 'To Do' }, 'POST', 'outsider')],
      [`/api/todos/${todo.id}`, jsonRequest({ title: '改ざん' }, 'PUT', 'outsider')],
      [`/api/todos/${todo.id}/comments`, request('GET', 'outsider')],
      [`/api/todos/${todo.id}/comments`, jsonRequest({ body: '侵入' }, 'POST', 'outsider')],
      [`/api/todos/${todo.id}`, request('DELETE', 'outsider')],
      [`/api/topics/${topic.id}`, jsonRequest({ color: '#000000' }, 'PUT', 'outsider')],
      [`/api/columns/${column.id}`, jsonRequest({ title: '改ざん' }, 'PUT', 'outsider')],
    ]
    for (const [path, init] of attempts) {
      expect((await app.request(path, init, environment)).status, path).toBe(403)
    }
    expect(database.todos).toEqual([expect.objectContaining({ id: todo.id, title: '機密タスク' })])
    expect(database.topics).toHaveLength(1)
    expect(database.comments).toHaveLength(0)
    expect(database.columns[0].title).toBe('To Do')
  })

  it('別プロジェクトのトピックやメンバー以外の担当者を拒否する', async () => {
    database.seedUser('user-1', '山田')
    database.seedUser('outsider', '部外者')
    const project = await createProject()
    const otherProject = await createProject('別プロジェクト', 'outsider')
    const otherTopicResponse = await app.request(`/api/projects/${otherProject.id}/topics`, jsonRequest({ name: '他所のトピック' }, 'POST', 'outsider'), environment)
    const otherTopic = await otherTopicResponse.json() as { id: string }

    const createResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, topic_id: otherTopic.id, title: 'タスク', column_name: 'To Do' }), environment)
    expect(createResponse.status).toBe(400)
    const todoResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: 'タスク', column_name: 'To Do' }), environment)
    const todo = await todoResponse.json() as { id: string }
    expect((await app.request(`/api/todos/${todo.id}`, jsonRequest({ topic_id: otherTopic.id }, 'PUT'), environment)).status).toBe(400)
    expect((await app.request(`/api/todos/${todo.id}`, jsonRequest({ assignee_id: 'outsider' }, 'PUT'), environment)).status).toBe(400)
    expect((await app.request(`/api/todos/${todo.id}`, jsonRequest({ assignee_id: null }, 'PUT'), environment)).status).toBe(200)
  })

  it('プロジェクトに存在しない列名を拒否する', async () => {
    const project = await createProject()
    const createResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: 'タスク', column_name: '存在しない列' }), environment)
    expect(createResponse.status).toBe(400)

    const todoResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: 'タスク', column_name: 'To Do' }), environment)
    const todo = await todoResponse.json() as { id: string }
    expect((await app.request(`/api/todos/${todo.id}`, jsonRequest({ column_name: '存在しない列' }, 'PUT'), environment)).status).toBe(400)
    expect((await app.request(`/api/todos/${todo.id}`, jsonRequest({ column_name: 'Done' }, 'PUT'), environment)).status).toBe(200)
  })

  it('タスクを列IDで紐づけ、同じ名前の列があっても混ざらない', async () => {
    const project = await createProject()
    const [todoColumn, progressColumn] = database.query<{ id: string }>('SELECT id FROM board_columns WHERE project_id = ? ORDER BY position', project.id)
    const firstResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: '一つ目', column_id: todoColumn.id }), environment)
    const secondResponse = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: '二つ目', column_id: progressColumn.id }), environment)
    const first = await firstResponse.json() as { id: string; column_id: string; column_name: string }
    const second = await secondResponse.json() as { id: string }
    expect(first).toMatchObject({ column_id: todoColumn.id, column_name: 'To Do' })

    await app.request(`/api/columns/${progressColumn.id}`, jsonRequest({ title: 'To Do' }, 'PUT'), environment)
    await app.request(`/api/columns/${progressColumn.id}`, jsonRequest({ title: '作業中' }, 'PUT'), environment)

    expect(database.todos.find((todo) => todo.id === first.id)).toMatchObject({ column_id: todoColumn.id, column_name: 'To Do' })
    expect(database.todos.find((todo) => todo.id === second.id)).toMatchObject({ column_id: progressColumn.id, column_name: '作業中' })

    const moveResponse = await app.request(`/api/todos/${first.id}`, jsonRequest({ column_id: progressColumn.id }, 'PUT'), environment)
    expect(await moveResponse.json()).toMatchObject({ column_id: progressColumn.id, column_name: '作業中' })
  })

  it('別プロジェクトの列IDを拒否する', async () => {
    const project = await createProject()
    const otherProject = await createProject('別プロジェクト')
    const [otherColumn] = database.query<{ id: string }>('SELECT id FROM board_columns WHERE project_id = ?', otherProject.id)
    const response = await app.request('/api/todos', jsonRequest({ project_id: project.id, title: 'タスク', column_id: otherColumn.id }), environment)
    expect(response.status).toBe(400)
  })

  it('不正なJSONには400を返す', async () => {
    const response = await app.request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth('user-1') }, body: '{invalid' }, environment)
    expect(response.status).toBe(400)
  })

  it('許可されたフロントエンドのオリジンだけにCORSを許可する', async () => {
    const corsEnvironment = { ...environment, CLERK_AUTHORIZED_PARTIES: 'https://team-todo.mitenecolab.com' }
    const preflight = (origin: string) => app.request('/api/projects', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } }, corsEnvironment)

    expect((await preflight('https://team-todo.mitenecolab.com')).headers.get('Access-Control-Allow-Origin')).toBe('https://team-todo.mitenecolab.com')
    expect((await preflight('https://evil.example.com')).headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('プロジェクト削除時に関連データも削除し、再実行は404を返す', async () => {
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '削除対象' }), environment)
    const project = await createResponse.json() as { id: string }
    await app.request('/api/todos', jsonRequest({ project_id: project.id, title: '関連タスク', column_name: 'To Do' }), environment)

    const response = await app.request(`/api/projects/${project.id}`, request('DELETE'), environment)
    expect(response.status).toBe(200)
    expect(database.projects).toHaveLength(0)
    expect(database.members).toHaveLength(0)
    expect(database.columns).toHaveLength(0)
    expect(database.todos).toHaveLength(0)

    const repeatedResponse = await app.request(`/api/projects/${project.id}`, request('DELETE'), environment)
    expect(repeatedResponse.status).toBe(404)
  })

  it('プロジェクト削除を各メンバーのユーザーチャンネルへ通知する', async () => {
    database.seedUser('member-1', '佐藤')
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '削除通知対象' }, 'POST', 'owner-1'), environment)
    const project = await createResponse.json() as { id: string }
    await app.request(`/api/projects/${project.id}/members`, jsonRequest({ user_id: 'member-1' }, 'POST', 'owner-1'), environment)
    realtime.messages = []

    const response = await app.request(`/api/projects/${project.id}`, request('DELETE', 'owner-1'), environment)

    expect(response.status).toBe(200)
    expect(realtime.messages).toContainEqual({ channel: 'user:member-1', event: { type: 'project.deleted', project_id: project.id, project_name: '削除通知対象', user_id: 'member-1' } })
  })

  it('オーナー以外によるプロジェクト名変更と削除を拒否する', async () => {
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '保護対象' }, 'POST', 'owner-1'), environment)
    const project = await createResponse.json() as { id: string }

    const updateResponse = await app.request(`/api/projects/${project.id}`, jsonRequest({ name: '不正な変更', user_id: 'owner-1' }, 'PUT', 'member-1'), environment)
    expect(updateResponse.status).toBe(403)
    const deleteResponse = await app.request(`/api/projects/${project.id}?user_id=owner-1`, request('DELETE', 'member-1'), environment)
    expect(deleteResponse.status).toBe(403)
    expect(database.projects).toEqual([expect.objectContaining({ id: project.id, name: '保護対象' })])
  })

  it('オーナーIDを偽装したメンバー追加・削除を拒否する', async () => {
    database.seedUser('member-1', '佐藤')
    database.seedUser('attacker', '攻撃者')
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '保護対象' }, 'POST', 'owner-1'), environment)
    const project = await createResponse.json() as { id: string }
    await app.request(`/api/projects/${project.id}/members`, jsonRequest({ user_id: 'member-1' }, 'POST', 'owner-1'), environment)

    const addResponse = await app.request(`/api/projects/${project.id}/members`, jsonRequest({ owner_id: 'owner-1', user_id: 'attacker' }, 'POST', 'attacker'), environment)
    expect(addResponse.status).toBe(403)
    const removeResponse = await app.request(`/api/projects/${project.id}/members/member-1?owner_id=owner-1`, request('DELETE', 'attacker'), environment)
    expect(removeResponse.status).toBe(403)
    expect(database.members.map((member) => member.user_id).sort()).toEqual(['member-1', 'owner-1'])
  })

  it('オーナーがメンバーを追加し、対象ユーザーが通知を確認できる', async () => {
    database.seedUser('owner-1', '山田', '#336699')
    database.seedUser('member-1', '佐藤', '#993366')
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '共同プロジェクト' }, 'POST', 'owner-1'), environment)
    const project = await createResponse.json() as { id: string }

    const addResponse = await app.request(`/api/projects/${project.id}/members`, jsonRequest({ user_id: 'member-1' }, 'POST', 'owner-1'), environment)
    expect(addResponse.status).toBe(201)
    expect(await addResponse.json()).toMatchObject({ user_id: 'member-1', nickname: '佐藤', role: 'member', avatar_color: '#993366' })
    const membersResponse = await app.request(`/api/projects/${project.id}/members`, request('GET', 'owner-1'), environment)
    expect(await membersResponse.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: 'owner-1', nickname: '山田', avatar_color: '#336699' }),
      expect.objectContaining({ user_id: 'member-1', nickname: '佐藤', avatar_color: '#993366' }),
    ]))
    expect(realtime.messages).toEqual(expect.arrayContaining([
      { channel: 'user:member-1', event: { type: 'membership.added', project_id: project.id, user_id: 'member-1' } },
      { channel: `project:${project.id}`, event: { type: 'member.added', project_id: project.id, user_id: 'member-1' } },
    ]))

    const notificationResponse = await app.request('/api/users/member-1/project-notifications', request('GET', 'member-1'), environment)
    expect(await notificationResponse.json()).toEqual([{ project_id: project.id, project_name: '共同プロジェクト' }])

    const acknowledgeResponse = await app.request('/api/users/member-1/project-notifications/acknowledge', jsonRequest({ project_ids: [project.id] }, 'POST', 'member-1'), environment)
    expect(acknowledgeResponse.status).toBe(200)
    const afterAcknowledge = await app.request('/api/users/member-1/project-notifications', request('GET', 'member-1'), environment)
    expect(await afterAcknowledge.json()).toEqual([])
  })

  it('リアルタイム接続をトークンのユーザーで認可する', async () => {
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '限定プロジェクト' }, 'POST', 'owner-1'), environment)
    const project = await createResponse.json() as { id: string }
    const websocket = { headers: { Upgrade: 'websocket' } }

    expect((await app.request(`/api/realtime/projects/${project.id}?user_id=owner-1`, websocket, environment)).status).toBe(401)
    expect((await app.request(`/api/realtime/projects/${project.id}?token=outsider-1&user_id=owner-1`, websocket, environment)).status).toBe(403)
    expect((await app.request('/api/realtime/users/owner-1?token=outsider-1&user_id=owner-1', websocket, environment)).status).toBe(403)
  })

  it('オーナーによるメンバー削除とメンバー自身の脱退に対応する', async () => {
    database.seedUser('owner-1', '山田')
    database.seedUser('member-1', '佐藤')
    const createResponse = await app.request('/api/projects', jsonRequest({ name: '共同プロジェクト' }, 'POST', 'owner-1'), environment)
    const project = await createResponse.json() as { id: string }
    await app.request(`/api/projects/${project.id}/members`, jsonRequest({ user_id: 'member-1' }, 'POST', 'owner-1'), environment)

    const removeResponse = await app.request(`/api/projects/${project.id}/members/member-1`, request('DELETE', 'owner-1'), environment)
    expect(removeResponse.status).toBe(200)
    expect(database.members.some((member) => member.user_id === 'member-1')).toBe(false)

    await app.request(`/api/projects/${project.id}/members`, jsonRequest({ user_id: 'member-1' }, 'POST', 'owner-1'), environment)
    const leaveResponse = await app.request(`/api/projects/${project.id}/leave`, jsonRequest({}, 'POST', 'member-1'), environment)
    expect(leaveResponse.status).toBe(200)
    expect(database.members.some((member) => member.user_id === 'member-1')).toBe(false)
    expect(database.projects).toHaveLength(1)
  })
})
