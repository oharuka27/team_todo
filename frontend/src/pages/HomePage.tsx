import { useState, useEffect } from 'react'
import { apiClient, type Project } from '../services/api'
import '../styles/HomePage.css'

interface HomePageProps {
  userId: string
  onSelectProject: (projectId: string) => void
}

export default function HomePage({ userId, onSelectProject }: HomePageProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDesc, setNewProjectDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [userId])

  const fetchProjects = async () => {
    try {
      setError(null)
      const projectsData = await apiClient.getProjects(userId)
      setProjects(projectsData)
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setError('プロジェクトの取得に失敗しました')
      // Fallback to mock data
      const mockProjects: Project[] = [
        {
          id: 'demo-1',
          name: 'サンプルプロジェクト',
          description: 'デモ用のプロジェクト',
          owner_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]
      setProjects(mockProjects)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectName.trim()) return

    setLoading(true)
    setError(null)
    try {
      const newProject = await apiClient.createProject(
        newProjectName,
        newProjectDesc || undefined,
        userId
      )
      setProjects([...projects, newProject])
      setNewProjectName('')
      setNewProjectDesc('')
    } catch (err) {
      console.error('Failed to create project:', err)
      setError('プロジェクトの作成に失敗しました')
      // Fallback to mock project
      const mockProject: Project = {
        id: Math.random().toString(36).slice(2, 9),
        name: newProjectName,
        description: newProjectDesc,
        owner_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setProjects([...projects, mockProject])
      setNewProjectName('')
      setNewProjectDesc('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-page">
      <header className="app-header">
        <h1>チーム ToDoアプリ</h1>
        <p className="user-info">ユーザーID: {userId}</p>
      </header>

      <main className="home-content">
        <section className="create-project-section">
          <h2>新しいプロジェクトを作成</h2>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleCreateProject} className="create-form">
            <div className="form-group">
              <label htmlFor="projectName">プロジェクト名</label>
              <input
                id="projectName"
                type="text"
                placeholder="プロジェクト名を入力"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label htmlFor="projectDesc">説明（オプション）</label>
              <textarea
                id="projectDesc"
                placeholder="プロジェクトの説明"
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                disabled={loading}
                rows={3}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? '作成中...' : '作成'}
            </button>
          </form>
        </section>

        <section className="projects-section">
          <h2>プロジェクト一覧</h2>
          {projects.length === 0 ? (
            <p className="empty-message">プロジェクトがまだ作成されていません</p>
          ) : (
            <div className="projects-grid">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="project-card"
                  onClick={() => onSelectProject(project.id)}
                  title="クリックして開く"
                >
                  <h3>{project.name}</h3>
                  {project.description && <p>{project.description}</p>}
                  <small>作成日: {new Date(project.created_at).toLocaleDateString('ja-JP')}</small>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
