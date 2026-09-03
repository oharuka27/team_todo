import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { v4 as uuidv4 } from 'uuid';

interface Bindings { DB: D1Database; ENVIRONMENT: string }
interface Project { id: string; name: string; description: string | null; owner_id: string; created_at: string; updated_at: string }
interface BoardColumn { id: string; project_id: string; title: string; position: number; created_at: string; updated_at: string }
interface TodoItem { id: string; project_id: string; title: string; description: string | null; status: string; column_name: string; user_id: string; created_at: string; updated_at: string }

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', cors());
app.onError((error, c) => { console.error('Unhandled API error:', error); return c.json({ error: 'Internal server error' }, 500) });
app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/api/projects', async (c) => {
  const body = await c.req.json() as { name?: string; description?: string; user_id?: string };
  const name = body.name?.trim();
  const userId = body.user_id?.trim();
  if (!name || !userId) return c.json({ error: 'name and user_id are required' }, 400);

  const now = new Date().toISOString();
  const project: Project = { id: uuidv4(), name, description: body.description?.trim() || null, owner_id: userId, created_at: now, updated_at: now };
  const columns = [
    { id: uuidv4(), title: 'To Do', position: 0 },
    { id: uuidv4(), title: 'In Progress', position: 1 },
    { id: uuidv4(), title: 'In Review', position: 2 },
    { id: uuidv4(), title: 'Done', position: 3 },
  ];

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO projects (id, name, description, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(project.id, project.name, project.description, project.owner_id, now, now),
    c.env.DB.prepare("INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(project.id, userId, now),
    ...columns.map((column) => c.env.DB.prepare('INSERT INTO board_columns (id, project_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(column.id, project.id, column.title, column.position, now, now)),
  ]);
  return c.json(project, 201);
});

app.get('/api/projects', async (c) => {
  const userId = c.req.query('user_id');
  if (!userId) return c.json({ error: 'user_id is required' }, 400);
  const { results } = await c.env.DB.prepare(`SELECT DISTINCT p.* FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.id WHERE p.owner_id = ? OR pm.user_id = ? ORDER BY p.created_at ASC`).bind(userId, userId).all<Project>();
  return c.json(results);
});

app.get('/api/projects/:id', async (c) => {
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(c.req.param('id')).first<Project>();
  return project ? c.json(project) : c.json({ error: 'Project not found' }, 404);
});

app.put('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { name?: string; description?: string | null };
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<Project>();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const updated: Project = { ...project, name: body.name?.trim() || project.name, description: body.description === undefined ? project.description : body.description, updated_at: new Date().toISOString() };
  await c.env.DB.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?').bind(updated.name, updated.description, updated.updated_at, id).run();
  return c.json(updated);
});

app.delete('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(id).first<Pick<Project, 'id'>>();
  // DELETE is idempotent. A project created by the frontend's offline fallback
  // does not exist in D1, but removing it from the client is still successful.
  if (!project) return c.json({ success: true });

  // Delete dependants explicitly so this also works if foreign-key enforcement is
  // disabled for an existing D1 database.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM todos WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM board_columns WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM project_members WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id),
  ]);
  return c.json({ success: true });
});

app.get('/api/projects/:projectId/columns', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM board_columns WHERE project_id = ? ORDER BY position ASC').bind(c.req.param('projectId')).all<BoardColumn>();
  return c.json(results);
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
  return c.json({ ...column, title, updated_at: now });
});

app.post('/api/todos', async (c) => {
  const body = await c.req.json() as { project_id?: string; title?: string; description?: string; column_name?: string; user_id?: string };
  const title = body.title?.trim();
  if (!body.project_id || !title || !body.column_name || !body.user_id) return c.json({ error: 'project_id, title, column_name and user_id are required' }, 400);
  const now = new Date().toISOString();
  const todo: TodoItem = { id: uuidv4(), project_id: body.project_id, title, description: body.description?.trim() || null, status: 'not_started', column_name: body.column_name, user_id: body.user_id, created_at: now, updated_at: now };
  await c.env.DB.prepare('INSERT INTO todos (id, project_id, title, description, status, column_name, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(todo.id, todo.project_id, todo.title, todo.description, todo.status, todo.column_name, todo.user_id, todo.created_at, todo.updated_at).run();
  return c.json(todo, 201);
});

app.get('/api/projects/:projectId/todos', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM todos WHERE project_id = ? ORDER BY created_at ASC').bind(c.req.param('projectId')).all<TodoItem>();
  return c.json(results);
});

app.put('/api/todos/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as Partial<Pick<TodoItem, 'title' | 'description' | 'status' | 'column_name'>>;
  const todo = await c.env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first<TodoItem>();
  if (!todo) return c.json({ error: 'Todo not found' }, 404);
  const updated: TodoItem = { ...todo, title: body.title?.trim() || todo.title, description: body.description === undefined ? todo.description : body.description, status: body.status ?? todo.status, column_name: body.column_name ?? todo.column_name, updated_at: new Date().toISOString() };
  await c.env.DB.prepare('UPDATE todos SET title = ?, description = ?, status = ?, column_name = ?, updated_at = ? WHERE id = ?').bind(updated.title, updated.description, updated.status, updated.column_name, updated.updated_at, id).run();
  return c.json(updated);
});

app.delete('/api/todos/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(c.req.param('id')).run();
  return result.meta.changes ? c.json({ success: true }) : c.json({ error: 'Todo not found' }, 404);
});

app.get('/ws', (c) => c.text('WebSocket endpoint not supported in this environment'));
export default app;
