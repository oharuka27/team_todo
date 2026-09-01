import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { v4 as uuidv4 } from 'uuid';

// Types
interface TodoItem {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  status: string;
  column_name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface BoardColumn {
  id: string;
  project_id: string;
  title: string;
  position: number;
}

// In-memory storage for demonstration (should be replaced with actual DB)
const projects = new Map<string, Project>();
const todos = new Map<string, TodoItem>();
const boardColumns = new Map<string, BoardColumn>();
const projectMembers = new Map<string, Set<string>>();

// WebSocket clients storage for real-time sync
const clients = new Map<string, Set<WebSocket>>();

const app = new Hono();

// Enable CORS
app.use('*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// === Project APIs ===

// Create project
app.post('/api/projects', async (c) => {
  const body = await c.req.json() as { name: string; description?: string; user_id: string };
  const projectId = uuidv4();
  const now = new Date().toISOString();

  const project: Project = {
    id: projectId,
    name: body.name,
    description: body.description,
    owner_id: body.user_id,
    created_at: now,
    updated_at: now,
  };

  projects.set(projectId, project);
  projectMembers.set(projectId, new Set([body.user_id]));

  // Initialize default columns
  const defaultColumns = [
    { title: 'To Do', position: 0 },
    { title: 'In Progress', position: 1 },
    { title: 'In Review', position: 2 },
    { title: 'Done', position: 3 },
  ];

  defaultColumns.forEach((col, index) => {
    const colId = uuidv4();
    boardColumns.set(colId, {
      id: colId,
      project_id: projectId,
      title: col.title,
      position: col.position,
    });
  });

  broadcastUpdate('project_created', project);
  return c.json(project, 201);
});

// Get all projects for a user
app.get('/api/projects', (c) => {
  const userId = c.req.query('user_id');
  const userProjects = Array.from(projects.values()).filter((p) => {
    return p.owner_id === userId || projectMembers.get(p.id)?.has(userId);
  });
  return c.json(userProjects);
});

// Get specific project
app.get('/api/projects/:id', (c) => {
  const project = projects.get(c.req.param('id'));
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }
  return c.json(project);
});

// Update project
app.put('/api/projects/:id', async (c) => {
  const body = await c.req.json() as Partial<Project>;
  const project = projects.get(c.req.param('id'));

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const updated: Project = {
    ...project,
    ...body,
    id: project.id,
    owner_id: project.owner_id,
    created_at: project.created_at,
    updated_at: new Date().toISOString(),
  };

  projects.set(project.id, updated);
  broadcastUpdate('project_updated', updated);
  return c.json(updated);
});

// === Board Column APIs ===

// Get columns for a project
app.get('/api/projects/:projectId/columns', (c) => {
  const projectId = c.req.param('projectId');
  const cols = Array.from(boardColumns.values()).filter((col) => col.project_id === projectId);
  return c.json(cols.sort((a, b) => a.position - b.position));
});

// Update column title
app.put('/api/columns/:id', async (c) => {
  const body = await c.req.json() as { title: string };
  const column = boardColumns.get(c.req.param('id'));

  if (!column) {
    return c.json({ error: 'Column not found' }, 404);
  }

  column.title = body.title;
  boardColumns.set(column.id, column);
  broadcastUpdate('column_updated', column);
  return c.json(column);
});

// === Todo APIs ===

// Create todo
app.post('/api/todos', async (c) => {
  const body = await c.req.json() as {
    project_id: string;
    title: string;
    description?: string;
    column_name: string;
    user_id: string;
  };

  const todoId = uuidv4();
  const now = new Date().toISOString();

  const todo: TodoItem = {
    id: todoId,
    project_id: body.project_id,
    title: body.title,
    description: body.description,
    status: 'not_started',
    column_name: body.column_name,
    user_id: body.user_id,
    created_at: now,
    updated_at: now,
  };

  todos.set(todoId, todo);
  broadcastUpdate('todo_created', todo);
  return c.json(todo, 201);
});

// Get todos for a project
app.get('/api/projects/:projectId/todos', (c) => {
  const projectId = c.req.param('projectId');
  const projectTodos = Array.from(todos.values()).filter((t) => t.project_id === projectId);
  return c.json(projectTodos);
});

// Update todo
app.put('/api/todos/:id', async (c) => {
  const body = await c.req.json() as Partial<TodoItem>;
  const todo = todos.get(c.req.param('id'));

  if (!todo) {
    return c.json({ error: 'Todo not found' }, 404);
  }

  const updated: TodoItem = {
    ...todo,
    ...body,
    id: todo.id,
    project_id: todo.project_id,
    user_id: todo.user_id,
    created_at: todo.created_at,
    updated_at: new Date().toISOString(),
  };

  todos.set(todo.id, updated);
  broadcastUpdate('todo_updated', updated);
  return c.json(updated);
});

// Delete todo
app.delete('/api/todos/:id', (c) => {
  const todo = todos.get(c.req.param('id'));
  if (!todo) {
    return c.json({ error: 'Todo not found' }, 404);
  }

  todos.delete(c.req.param('id'));
  broadcastUpdate('todo_deleted', { id: c.req.param('id') });
  return c.json({ success: true });
});

// === WebSocket for Real-time Updates ===

app.get('/ws', (c) => {
  return c.text('WebSocket endpoint not supported in this environment');
});

// Broadcast update to all connected clients
function broadcastUpdate(type: string, data: unknown) {
  clients.forEach((clientSet) => {
    clientSet.forEach((ws) => {
      try {
        ws.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
      } catch {
        // Client disconnected
      }
    });
  });
}

export default app;
