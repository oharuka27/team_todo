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
  avatar_color?: string;
  created_at: string;
  updated_at: string;
}

export interface TodoItem {
  id: string;
  project_id: string;
  topic_id?: string | null;
  title: string;
  description?: string;
  status: string;
  column_name: string;
  user_id: string;
  assignee_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  project_id: string;
  name: string;
  color?: string | null;
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
  avatar_color?: string;
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

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type TokenProvider = () => Promise<string | null>;

class ApiClient {
  private baseUrl: string;
  private getToken: TokenProvider = async () => null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Clerk session tokens are short-lived, so a fresh one is requested for every call.
  setTokenProvider(provider: TokenProvider) {
    this.getToken = provider;
  }

  private async websocketUrl(path: string): Promise<string> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    // Browsers cannot send an Authorization header with a WebSocket handshake.
    const token = await this.getToken();
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }

  async connectUserEvents(userId: string): Promise<WebSocket> {
    return new WebSocket(await this.websocketUrl(`/api/realtime/users/${encodeURIComponent(userId)}`));
  }

  async connectProjectEvents(projectId: string): Promise<WebSocket> {
    return new WebSocket(await this.websocketUrl(`/api/realtime/projects/${encodeURIComponent(projectId)}`));
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const token = await this.getToken();
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new ApiError(response.status, `HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API Error [${method} ${path}]:`, error);
      throw error;
    }
  }

  async registerUser(nickname: string): Promise<UserAccount> {
    return this.request('POST', '/api/users', { nickname });
  }

  // Returns null when the signed-in Clerk user has not registered a nickname yet.
  async getCurrentUser(): Promise<UserAccount | null> {
    try {
      return await this.request<UserAccount>('GET', '/api/users/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  async getUsers(): Promise<UserAccount[]> {
    return this.request('GET', '/api/users');
  }

  async updateUser(id: string, nickname: string, avatarColor: string): Promise<UserAccount> {
    return this.request('PUT', `/api/users/${encodeURIComponent(id)}`, { nickname, avatar_color: avatarColor });
  }

  async getProjectNotifications(userId: string): Promise<ProjectNotification[]> {
    return this.request('GET', `/api/users/${userId}/project-notifications`);
  }

  async acknowledgeProjectNotifications(userId: string, projectIds: string[]): Promise<{ success: boolean }> {
    return this.request('POST', `/api/users/${userId}/project-notifications/acknowledge`, { project_ids: projectIds });
  }

  // Project APIs
  async createProject(name: string, description: string | undefined): Promise<Project> {
    return this.request('POST', '/api/projects', { name, description });
  }

  async getProjects(): Promise<Project[]> {
    return this.request('GET', '/api/projects');
  }

  async updateProjectOrder(userId: string, group: 'owner' | 'member', projectIds: string[]): Promise<{ success: boolean }> {
    return this.request('PUT', `/api/users/${encodeURIComponent(userId)}/project-order`, { group, project_ids: projectIds });
  }

  async getProject(projectId: string): Promise<Project> {
    return this.request('GET', `/api/projects/${projectId}`);
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    return this.request('PUT', `/api/projects/${projectId}`, updates);
  }

  async deleteProject(projectId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/projects/${projectId}`);
  }

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return this.request('GET', `/api/projects/${projectId}/members`);
  }

  async addProjectMember(projectId: string, userId: string): Promise<ProjectMember> {
    return this.request('POST', `/api/projects/${projectId}/members`, { user_id: userId });
  }

  async removeProjectMember(projectId: string, userId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/projects/${projectId}/members/${userId}`);
  }

  async leaveProject(projectId: string): Promise<{ success: boolean }> {
    return this.request('POST', `/api/projects/${projectId}/leave`, {});
  }

  // Todo APIs
  async createTodo(
    projectId: string,
    title: string,
    columnName: string,
    description?: string,
    topicId?: string | null
  ): Promise<TodoItem> {
    return this.request('POST', '/api/todos', {
      project_id: projectId,
      title,
      description,
      column_name: columnName,
      topic_id: topicId,
    });
  }

  async getTodos(projectId: string): Promise<TodoItem[]> {
    return this.request('GET', `/api/projects/${projectId}/todos`);
  }

  async getTopics(projectId: string): Promise<Topic[]> {
    return this.request('GET', `/api/projects/${projectId}/topics`);
  }

  async createTopic(projectId: string, name: string, color?: string): Promise<Topic> {
    return this.request('POST', `/api/projects/${projectId}/topics`, { name, color });
  }

  async updateTopic(topicId: string, updates: Pick<Topic, 'color'>): Promise<Topic> {
    return this.request('PUT', `/api/topics/${topicId}`, updates);
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

  async createTodoComment(todoId: string, body: string): Promise<TodoComment> {
    return this.request('POST', `/api/todos/${todoId}/comments`, { body });
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
