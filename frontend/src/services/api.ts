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

export interface TodoItem {
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
    updates: Partial<Project>
  ): Promise<Project> {
    return this.request('PUT', `/api/projects/${projectId}`, updates);
  }

  async deleteProject(projectId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/projects/${projectId}`);
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
