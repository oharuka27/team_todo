import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { v4 as uuidv4 } from 'uuid';

interface Bindings { DB: D1Database; ENVIRONMENT: string; REALTIME?: DurableObjectNamespace }
interface Project { id: string; name: string; description: string | null; owner_id: string; created_at: string; updated_at: string }
interface UserAccount { id: string; nickname: string; avatar_color?: string; created_at: string; updated_at: string }
interface ProjectMember { project_id: string; user_id: string; role: string; created_at: string; notified_at: string | null; sort_order: number }
interface BoardColumn { id: string; project_id: string; title: string; position: number; created_at: string; updated_at: string }
interface TodoItem { id: string; project_id: string; topic_id?: string | null; title: string; description: string | null; status: string; column_name: string; user_id: string; assignee_id: string | null; created_at: string; updated_at: string }
interface Topic { id: string; project_id: string; name: string; created_at: string; updated_at: string }
interface TodoComment { id: string; todo_id: string; user_id: string; body: string; created_at: string }

interface RealtimeEvent { type: string; project_id?: string; project_name?: string; user_id?: string }

export class RealtimeChannel {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const message = await request.text();
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(message); } catch { socket.close(1011, 'Broadcast failed'); }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') socket.send('pong');
  }
}

const broadcast = async (env: Bindings, channel: string, event: RealtimeEvent) => {
  if (!env.REALTIME) return;
  const stub = env.REALTIME.get(env.REALTIME.idFromName(channel));
  await stub.fetch('https://realtime.internal/broadcast', { method: 'POST', body: JSON.stringify(event) });
};

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', cors());
app.onError((error, c) => { console.error('Unhandled API error:', error); return c.json({ error: 'Internal server error' }, 500) });
app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/api/realtime/users/:userId', async (c) => {
  const userId = c.req.param('userId');
  if (c.req.query('user_id') !== userId) return c.json({ error: 'Forbidden' }, 403);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserAccount>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  if (!c.env.REALTIME) return c.json({ error: 'Realtime is not configured' }, 503);
  return c.env.REALTIME.get(c.env.REALTIME.idFromName(`user:${userId}`)).fetch(c.req.raw);
});

app.get('/api/realtime/projects/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  const userId = c.req.query('user_id');
  if (!userId) return c.json({ error: 'user_id is required' }, 400);
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<Project>();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const member = await c.env.DB.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').bind(projectId, userId).first<ProjectMember>();
  if (project.owner_id !== userId && !member) return c.json({ error: 'Forbidden' }, 403);
  if (!c.env.REALTIME) return c.json({ error: 'Realtime is not configured' }, 503);
  return c.env.REALTIME.get(c.env.REALTIME.idFromName(`project:${projectId}`)).fetch(c.req.raw);
});

app.post('/api/users', async (c) => {
  const body = await c.req.json() as { id?: string; nickname?: string };
  const id = body.id?.trim();
  const nickname = body.nickname?.trim();
  if (!id || !nickname) return c.json({ error: 'id and nickname are required' }, 400);
  if (nickname.length > 40) return c.json({ error: 'nickname must be 40 characters or fewer' }, 400);

  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserAccount>();
  if (existing) return c.json(existing);

  const user: UserAccount = { id, nickname, avatar_color: '#4a9c9b', created_at: now, updated_at: now };
  await c.env.DB.prepare('INSERT INTO users (id, nickname, avatar_color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(user.id, user.nickname, user.avatar_color, now, now).run();
  return c.json(user, 201);
});

app.put('/api/users/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { user_id?: string; nickname?: string; avatar_color?: string };
  if (body.user_id !== id) return c.json({ error: 'Forbidden' }, 403);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserAccount>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const nickname = body.nickname?.trim();
  if (!nickname || nickname.length > 40) return c.json({ error: 'nickname must be between 1 and 40 characters' }, 400);
  const avatarColor = body.avatar_color?.trim();
  if (!avatarColor || !/^#[0-9a-fA-F]{6}$/.test(avatarColor)) return c.json({ error: 'avatar_color must be a hex color' }, 400);
  const updated = { ...user, nickname, avatar_color: avatarColor.toLowerCase(), updated_at: new Date().toISOString() };
  await c.env.DB.prepare('UPDATE users SET nickname = ?, avatar_color = ?, updated_at = ? WHERE id = ?').bind(updated.nickname, updated.avatar_color, updated.updated_at, id).run();
  const { results: memberships } = await c.env.DB.prepare('SELECT project_id FROM project_members WHERE user_id = ?').bind(id).all<Pick<ProjectMember, 'project_id'>>();
  await Promise.all([
    broadcast(c.env, `user:${id}`, { type: 'user.updated', user_id: id }),
    ...memberships.map((membership) => broadcast(c.env, `project:${membership.project_id}`, { type: 'user.updated', project_id: membership.project_id, user_id: id })),
  ]);
  return c.json(updated);
});

app.get('/api/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM users ORDER BY nickname COLLATE NOCASE ASC').all<UserAccount>();
  return c.json(results);
});

app.get('/api/users/:id/project-notifications', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT p.id AS project_id, p.name AS project_name FROM project_members pm JOIN projects p ON p.id = pm.project_id WHERE pm.user_id = ? AND pm.role = 'member' AND pm.notified_at IS NULL ORDER BY pm.created_at ASC`).bind(c.req.param('id')).all<{ project_id: string; project_name: string }>();
  return c.json(results);
});

app.post('/api/users/:id/project-notifications/acknowledge', async (c) => {
  const userId = c.req.param('id');
  const projectIds = ((await c.req.json()) as { project_ids?: string[] }).project_ids;
  if (!Array.isArray(projectIds) || !projectIds.length) return c.json({ error: 'project_ids is required' }, 400);
  const now = new Date().toISOString();
  await c.env.DB.batch(projectIds.map((projectId) => c.env.DB.prepare(`UPDATE project_members SET notified_at = ? WHERE project_id = ? AND user_id = ? AND role = 'member'`).bind(now, projectId, userId)));
  return c.json({ success: true });
});

app.post('/api/projects', async (c) => {
  const body = await c.req.json() as { name?: string; description?: string; user_id?: string };
  const name = body.name?.trim();
  const userId = body.user_id?.trim();
  if (!name || !userId) return c.json({ error: 'name and user_id are required' }, 400);

  const now = new Date().toISOString();
  const order = await c.env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_members WHERE user_id = ? AND role = 'owner'").bind(userId).first<{ next_order: number }>();
  const project: Project = { id: uuidv4(), name, description: body.description?.trim() || null, owner_id: userId, created_at: now, updated_at: now };
  const columns = [
    { id: uuidv4(), title: 'To Do', position: 0 },
    { id: uuidv4(), title: 'In Progress', position: 1 },
    { id: uuidv4(), title: 'In Review', position: 2 },
    { id: uuidv4(), title: 'Done', position: 3 },
  ];

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO projects (id, name, description, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(project.id, project.name, project.description, project.owner_id, now, now),
    c.env.DB.prepare("INSERT INTO project_members (project_id, user_id, role, created_at, sort_order) VALUES (?, ?, 'owner', ?, ?)").bind(project.id, userId, now, order?.next_order ?? 0),
    ...columns.map((column) => c.env.DB.prepare('INSERT INTO board_columns (id, project_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(column.id, project.id, column.title, column.position, now, now)),
  ]);
  return c.json(project, 201);
});

app.get('/api/projects', async (c) => {
  const userId = c.req.query('user_id');
  if (!userId) return c.json({ error: 'user_id is required' }, 400);
  const { results } = await c.env.DB.prepare(`SELECT DISTINCT p.*, COALESCE(pm.sort_order, 0) AS sort_order FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ? WHERE p.owner_id = ? OR pm.user_id = ? ORDER BY sort_order ASC, p.created_at ASC`).bind(userId, userId, userId).all<Project & { sort_order: number }>();
  return c.json(results);
});

app.put('/api/users/:userId/project-order', async (c) => {
  const userId = c.req.param('userId');
  const body = await c.req.json() as { user_id?: string; group?: 'owner' | 'member'; project_ids?: string[] };
  if (body.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  if (!['owner', 'member'].includes(body.group ?? '') || !Array.isArray(body.project_ids)) return c.json({ error: 'group and project_ids are required' }, 400);
  if (new Set(body.project_ids).size !== body.project_ids.length) return c.json({ error: 'project_ids must be unique' }, 400);

  const { results } = body.group === 'owner'
    ? await c.env.DB.prepare('SELECT id, owner_id, created_at FROM projects WHERE owner_id = ?').bind(userId).all<Pick<Project, 'id' | 'owner_id' | 'created_at'>>()
    : await c.env.DB.prepare('SELECT p.id, p.owner_id, p.created_at FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = ? AND p.owner_id <> ?').bind(userId, userId).all<Pick<Project, 'id' | 'owner_id' | 'created_at'>>();
  const expectedIds = new Set(results.map((project) => project.id));
  if (body.project_ids.length !== expectedIds.size || body.project_ids.some((id) => !expectedIds.has(id))) return c.json({ error: 'Projects must stay within their group' }, 400);

  const statements = body.project_ids.flatMap((projectId, index) => {
    const project = results.find((item) => item.id === projectId)!;
    return body.group === 'owner' ? [
      c.env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at, notified_at, sort_order) VALUES (?, ?, 'owner', ?, ?, ?)").bind(projectId, userId, project.created_at, project.created_at, index),
      c.env.DB.prepare('UPDATE project_members SET sort_order = ? WHERE project_id = ? AND user_id = ?').bind(index, projectId, userId),
    ] : [c.env.DB.prepare('UPDATE project_members SET sort_order = ? WHERE project_id = ? AND user_id = ?').bind(index, projectId, userId)];
  });
  await c.env.DB.batch(statements);
  await broadcast(c.env, `user:${userId}`, { type: 'project.order.updated', user_id: userId });
  return c.json({ success: true });
});

app.get('/api/projects/:id', async (c) => {
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(c.req.param('id')).first<Project>();
  return project ? c.json(project) : c.json({ error: 'Project not found' }, 404);
});

app.put('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { name?: string; description?: string | null; user_id?: string };
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<Project>();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (!body.user_id || project.owner_id !== body.user_id) return c.json({ error: 'Only the owner can update the project' }, 403);
  const updated: Project = { ...project, name: body.name?.trim() || project.name, description: body.description === undefined ? project.description : body.description, updated_at: new Date().toISOString() };
  await c.env.DB.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?').bind(updated.name, updated.description, updated.updated_at, id).run();
  await broadcast(c.env, `project:${id}`, { type: 'project.updated', project_id: id, user_id: body.user_id });
  return c.json(updated);
});

app.delete('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<Project>();
  // DELETE is idempotent. A project created by the frontend's offline fallback
  // does not exist in D1, but removing it from the client is still successful.
  if (!project) return c.json({ success: true });
  if (!c.req.query('user_id') || project.owner_id !== c.req.query('user_id')) return c.json({ error: 'Only the owner can delete the project' }, 403);
  const { results: members } = await c.env.DB.prepare("SELECT user_id FROM project_members WHERE project_id = ? AND role = 'member'").bind(id).all<Pick<ProjectMember, 'user_id'>>();

  // Delete dependants explicitly so this also works if foreign-key enforcement is
  // disabled for an existing D1 database.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM todo_comments WHERE todo_id IN (SELECT id FROM todos WHERE project_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM todos WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM topics WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM board_columns WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM project_members WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id),
  ]);
  await Promise.all([
    broadcast(c.env, `project:${id}`, { type: 'project.deleted', project_id: id, project_name: project.name, user_id: project.owner_id }),
    ...members.map((member) => broadcast(c.env, `user:${member.user_id}`, { type: 'project.deleted', project_id: id, project_name: project.name, user_id: member.user_id })),
  ]);
  return c.json({ success: true });
});

app.get('/api/projects/:id/members', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT pm.project_id, pm.user_id, pm.role, pm.created_at, pm.notified_at, u.nickname FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY pm.role DESC, u.nickname COLLATE NOCASE ASC`).bind(c.req.param('id')).all<ProjectMember & { nickname: string }>();
  return c.json(results);
});

app.post('/api/projects/:id/members', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json() as { owner_id?: string; user_id?: string };
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<Project>();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (!body.owner_id || project.owner_id !== body.owner_id) return c.json({ error: 'Only the owner can add members' }, 403);
  if (!body.user_id || body.user_id === project.owner_id) return c.json({ error: 'A valid member user_id is required' }, 400);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(body.user_id).first<UserAccount>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const existing = await c.env.DB.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').bind(projectId, body.user_id).first<ProjectMember>();
  if (!existing) {
    const order = await c.env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_members WHERE user_id = ? AND role = 'member'").bind(body.user_id).first<{ next_order: number }>();
    await c.env.DB.prepare("INSERT INTO project_members (project_id, user_id, role, created_at, notified_at, sort_order) VALUES (?, ?, 'member', ?, NULL, ?)").bind(projectId, body.user_id, new Date().toISOString(), order?.next_order ?? 0).run();
    await Promise.all([
      broadcast(c.env, `user:${body.user_id}`, { type: 'membership.added', project_id: projectId, user_id: body.user_id }),
      broadcast(c.env, `project:${projectId}`, { type: 'member.added', project_id: projectId, user_id: body.user_id }),
    ]);
  }
  return c.json({ project_id: projectId, user_id: user.id, role: 'member', nickname: user.nickname }, existing ? 200 : 201);
});

app.delete('/api/projects/:id/members/:userId', async (c) => {
  const projectId = c.req.param('id');
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<Project>();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (project.owner_id !== c.req.query('owner_id')) return c.json({ error: 'Only the owner can remove members' }, 403);
  if (c.req.param('userId') === project.owner_id) return c.json({ error: 'The owner cannot be removed' }, 400);
  await c.env.DB.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ? AND role = 'member'").bind(projectId, c.req.param('userId')).run();
  await Promise.all([
    broadcast(c.env, `user:${c.req.param('userId')}`, { type: 'membership.removed', project_id: projectId, user_id: c.req.param('userId') }),
    broadcast(c.env, `project:${projectId}`, { type: 'member.removed', project_id: projectId, user_id: c.req.param('userId') }),
  ]);
  return c.json({ success: true });
});

app.post('/api/projects/:id/leave', async (c) => {
  const projectId = c.req.param('id');
  const userId = ((await c.req.json()) as { user_id?: string }).user_id;
  if (!userId) return c.json({ error: 'user_id is required' }, 400);
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<Project>();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (project.owner_id === userId) return c.json({ error: 'The owner cannot leave the project' }, 400);
  await c.env.DB.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ? AND role = 'member'").bind(projectId, userId).run();
  await broadcast(c.env, `project:${projectId}`, { type: 'member.left', project_id: projectId, user_id: userId });
  return c.json({ success: true });
});

app.get('/api/projects/:projectId/columns', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM board_columns WHERE project_id = ? ORDER BY position ASC').bind(c.req.param('projectId')).all<BoardColumn>();
  return c.json(results);
});

app.get('/api/projects/:projectId/topics', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM topics WHERE project_id = ? ORDER BY created_at ASC').bind(c.req.param('projectId')).all<Topic>();
  return c.json(results);
});

app.post('/api/projects/:projectId/topics', async (c) => {
  const projectId = c.req.param('projectId');
  const name = ((await c.req.json()) as { name?: string }).name?.trim();
  if (!name) return c.json({ error: 'name is required' }, 400);
  const now = new Date().toISOString();
  const topic: Topic = { id: uuidv4(), project_id: projectId, name, created_at: now, updated_at: now };
  await c.env.DB.prepare('INSERT INTO topics (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(topic.id, topic.project_id, topic.name, now, now).run();
  await broadcast(c.env, `project:${projectId}`, { type: 'topic.created', project_id: projectId });
  return c.json(topic, 201);
});

app.put('/api/columns/:id', async (c) => {
  const id = c.req.param('id');
  const title = ((await c.req.json()) as { title?: string }).title?.trim();
  if (!title) return c.json({ error: 'title is required' }, 400);
  const column = await c.env.DB.prepare('SELECT * FROM board_columns WHERE id = ?').bind(id).first<BoardColumn>();
  if (!column) return c.json({ error: 'Column not found' }, 404);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE board_columns SET title = ?, updated_at = ? WHERE id = ?').bind(title, now, id),
    c.env.DB.prepare('UPDATE todos SET column_name = ?, updated_at = ? WHERE project_id = ? AND column_name = ?').bind(title, now, column.project_id, column.title),
  ]);
  await broadcast(c.env, `project:${column.project_id}`, { type: 'column.updated', project_id: column.project_id });
  return c.json({ ...column, title, updated_at: now });
});

app.post('/api/todos', async (c) => {
  const body = await c.req.json() as { project_id?: string; topic_id?: string | null; title?: string; description?: string; column_name?: string; user_id?: string };
  const title = body.title?.trim();
  if (!body.project_id || !title || !body.column_name || !body.user_id) return c.json({ error: 'project_id, title, column_name and user_id are required' }, 400);
  const now = new Date().toISOString();
  const todo: TodoItem & { topic_id: string | null } = { id: uuidv4(), project_id: body.project_id, topic_id: body.topic_id || null, title, description: body.description?.trim() || null, status: 'not_started', column_name: body.column_name, user_id: body.user_id, assignee_id: body.user_id, created_at: now, updated_at: now };
  await c.env.DB.prepare('INSERT INTO todos (id, project_id, topic_id, title, description, status, column_name, user_id, assignee_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(todo.id, todo.project_id, todo.topic_id, todo.title, todo.description, todo.status, todo.column_name, todo.user_id, todo.assignee_id, todo.created_at, todo.updated_at).run();
  await broadcast(c.env, `project:${todo.project_id}`, { type: 'todo.created', project_id: todo.project_id, user_id: todo.user_id });
  return c.json(todo, 201);
});

app.get('/api/projects/:projectId/todos', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM todos WHERE project_id = ? ORDER BY created_at ASC').bind(c.req.param('projectId')).all<TodoItem>();
  return c.json(results);
});

app.put('/api/todos/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as Partial<Pick<TodoItem, 'title' | 'description' | 'status' | 'column_name' | 'assignee_id'>> & { topic_id?: string | null };
  const todo = await c.env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first<TodoItem>();
  if (!todo) return c.json({ error: 'Todo not found' }, 404);
  const updated = { ...todo, topic_id: body.topic_id === undefined ? (todo as TodoItem & { topic_id?: string | null }).topic_id ?? null : body.topic_id, title: body.title?.trim() || todo.title, description: body.description === undefined ? todo.description : body.description?.trim() || null, status: body.status ?? todo.status, column_name: body.column_name ?? todo.column_name, assignee_id: body.assignee_id === undefined ? todo.assignee_id : body.assignee_id, updated_at: new Date().toISOString() };
  await c.env.DB.prepare('UPDATE todos SET title = ?, description = ?, status = ?, column_name = ?, assignee_id = ?, topic_id = ?, updated_at = ? WHERE id = ?').bind(updated.title, updated.description, updated.status, updated.column_name, updated.assignee_id, updated.topic_id, updated.updated_at, id).run();
  await broadcast(c.env, `project:${todo.project_id}`, { type: 'todo.updated', project_id: todo.project_id });
  return c.json(updated);
});

app.get('/api/todos/:id/comments', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT c.*, u.nickname FROM todo_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.todo_id = ? ORDER BY c.created_at ASC').bind(c.req.param('id')).all<TodoComment & { nickname: string | null }>();
  return c.json(results);
});

app.post('/api/todos/:id/comments', async (c) => {
  const todoId = c.req.param('id');
  const body = await c.req.json() as { user_id?: string; body?: string };
  const commentBody = body.body?.trim();
  if (!body.user_id || !commentBody) return c.json({ error: 'user_id and body are required' }, 400);
  const todo = await c.env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(todoId).first<TodoItem>();
  if (!todo) return c.json({ error: 'Todo not found' }, 404);
  const comment: TodoComment = { id: uuidv4(), todo_id: todoId, user_id: body.user_id, body: commentBody, created_at: new Date().toISOString() };
  await c.env.DB.prepare('INSERT INTO todo_comments (id, todo_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(comment.id, comment.todo_id, comment.user_id, comment.body, comment.created_at).run();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(comment.user_id).first<UserAccount>();
  await broadcast(c.env, `project:${todo.project_id}`, { type: 'comment.created', project_id: todo.project_id, user_id: comment.user_id });
  return c.json({ ...comment, nickname: user?.nickname ?? null }, 201);
});

app.delete('/api/todos/:id', async (c) => {
  const id = c.req.param('id');
  const todo = await c.env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first<TodoItem>();
  await c.env.DB.prepare('DELETE FROM todo_comments WHERE todo_id = ?').bind(id).run();
  const result = await c.env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
  if (result.meta.changes && todo) await broadcast(c.env, `project:${todo.project_id}`, { type: 'todo.deleted', project_id: todo.project_id });
  return result.meta.changes ? c.json({ success: true }) : c.json({ error: 'Todo not found' }, 404);
});

export default app;
