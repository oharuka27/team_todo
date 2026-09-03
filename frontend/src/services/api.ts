// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export interface Project {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface UserAccount {
  id: string;
  nickname: string;
  created_at: string;
  updated_at: string;
}

export interface TodoItem {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  status: string;
  column_name: string;
  user_id: string;
  assignee_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TodoComment {
  id: string;
  todo_id: string;
  user_id: string;
  body: string;
  nickname?: string | null;
  created_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: 'owner' | 'member';
  nickname: string;
  created_at?: string;
  notified_at?: string | null;
}

export interface ProjectNotification {
  project_id: string;
  project_name: string;
}

export interface BoardColumn {
  id: string;
  title: string;
  position: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private websocketUrl(path: string): string {
    const url = new URL(`${this.baseUrl}${path}`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  connectUserEvents(userId: string): WebSocket {
    return new WebSocket(this.websocketUrl(`/api/realtime/users/${encodeURIComponent(userId)}?user_id=${encodeURIComponent(userId)}`));
  }

  connectProjectEvents(projectId: string, userId: string): WebSocket {
    return new WebSocket(this.websocketUrl(`/api/realtime/projects/${encodeURIComponent(projectId)}?user_id=${encodeURIComponent(userId)}`));
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API Error [${method} ${path}]:`, error);
      throw error;
    }
  }

  async registerUser(id: string, nickname: string): Promise<UserAccount> {
    return this.request('POST', '/api/users', { id, nickname });
  }

  async getUsers(): Promise<UserAccount[]> {
    return this.request('GET', '/api/users');
  }

  async getProjectNotifications(userId: string): Promise<ProjectNotification[]> {
    return this.request('GET', `/api/users/${userId}/project-notifications`);
  }

  async acknowledgeProjectNotifications(userId: string, projectIds: string[]): Promise<{ success: boolean }> {
    return this.request('POST', `/api/users/${userId}/project-notifications/acknowledge`, { project_ids: projectIds });
  }

  // Project APIs
  async createProject(
    name: string,
    description: string | undefined,
    userId: string
  ): Promise<Project> {
    return this.request('POST', '/api/projects', {
      name,
      description,
      user_id: userId,
    });
  }

  async getProjects(userId: string): Promise<Project[]> {
    return this.request('GET', `/api/projects?user_id=${userId}`);
  }

  async getProject(projectId: string): Promise<Project> {
    return this.request('GET', `/api/projects/${projectId}`);
  }

  async updateProject(
    projectId: string,
    updates: Partial<Project>,
    userId: string
  ): Promise<Project> {
    return this.request('PUT', `/api/projects/${projectId}`, { ...updates, user_id: userId });
  }

  async deleteProject(projectId: string, userId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/projects/${projectId}?user_id=${encodeURIComponent(userId)}`);
  }

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return this.request('GET', `/api/projects/${projectId}/members`);
  }

  async addProjectMember(projectId: string, ownerId: string, userId: string): Promise<ProjectMember> {
    return this.request('POST', `/api/projects/${projectId}/members`, { owner_id: ownerId, user_id: userId });
  }

  async removeProjectMember(projectId: string, ownerId: string, userId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/projects/${projectId}/members/${userId}?owner_id=${encodeURIComponent(ownerId)}`);
  }

  async leaveProject(projectId: string, userId: string): Promise<{ success: boolean }> {
    return this.request('POST', `/api/projects/${projectId}/leave`, { user_id: userId });
  }

  // Todo APIs
  async createTodo(
    projectId: string,
    title: string,
    columnName: string,
    userId: string,
    description?: string
  ): Promise<TodoItem> {
    return this.request('POST', '/api/todos', {
      project_id: projectId,
      title,
      description,
      column_name: columnName,
      user_id: userId,
    });
  }

  async getTodos(projectId: string): Promise<TodoItem[]> {
    return this.request('GET', `/api/projects/${projectId}/todos`);
  }

  async updateTodo(todoId: string, updates: Partial<TodoItem>): Promise<TodoItem> {
    return this.request('PUT', `/api/todos/${todoId}`, updates);
  }

  async deleteTodo(todoId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/todos/${todoId}`);
  }

  async getTodoComments(todoId: string): Promise<TodoComment[]> {
    return this.request('GET', `/api/todos/${todoId}/comments`);
  }

  async createTodoComment(todoId: string, userId: string, body: string): Promise<TodoComment> {
    return this.request('POST', `/api/todos/${todoId}/comments`, { user_id: userId, body });
  }

  // Column APIs
  async getColumns(projectId: string): Promise<BoardColumn[]> {
    return this.request('GET', `/api/projects/${projectId}/columns`);
  }

  async updateColumn(columnId: string, title: string): Promise<BoardColumn> {
    return this.request('PUT', `/api/columns/${columnId}`, { title });
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.request('GET', '/health');
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
