import { useEffect, useState } from 'react'
import './App.css'
import ProjectPage from './pages/ProjectPage'
import { apiClient, type Project } from './services/api'

const Icon = ({ children, size = 20 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

function App() {
  const [userId] = useState(() => localStorage.getItem('userId') || `user_${Math.random().toString(36).slice(2, 9)}`)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    localStorage.setItem('userId', userId)
    apiClient.getProjects(userId).then((data) => {
      setProjects(data)
      setSelectedProjectId((current) => current ?? data[0]?.id ?? null)
    }).catch(() => {
      setProjects([])
      setSelectedProjectId(null)
    })
  }, [userId])

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newProjectName.trim()) return
    setIsCreating(true)
    try {
      const created = await apiClient.createProject(newProjectName.trim(), undefined, userId)
      setProjects((items) => [...items, created]); setSelectedProjectId(created.id)
    } catch {
      const now = new Date().toISOString()
      const created: Project = { id: crypto.randomUUID(), name: newProjectName.trim(), owner_id: userId, created_at: now, updated_at: now }
      setProjects((items) => [...items, created]); setSelectedProjectId(created.id)
    } finally {
      setIsCreating(false); setNewProjectName(''); setIsCreateOpen(false)
    }
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId)

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Icon size={22}><path d="M9 11l2 2 4-4"/><path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/></Icon></span><span>Team Todo</span></div>
        <div className="sidebar-section">
          <div className="sidebar-heading"><span>プロジェクト</span><span className="project-count">{projects.length}</span></div>
          <nav className="project-list" aria-label="プロジェクト一覧">
            {projects.map((project, index) => (
              <button key={project.id} className={`project-item ${project.id === selectedProjectId ? 'active' : ''}`} onClick={() => setSelectedProjectId(project.id)}>
                <span className={`project-icon project-icon-${index % 4}`}>{project.name.slice(0, 1).toUpperCase()}</span><span className="project-name">{project.name}</span>
              </button>
            ))}
          </nav>
          <button className="add-project-button" onClick={() => setIsCreateOpen(true)}><Icon size={18}><path d="M12 5v14M5 12h14"/></Icon>プロジェクトを追加</button>
        </div>
        {projects.length > 0 && <div className="sidebar-footer"><span className="avatar">{userId.slice(-2).toUpperCase()}</span><div><strong>マイワークスペース</strong><small>オンライン</small></div></div>}
      </aside>

      <main className="main-area">
        {selectedProject ? <ProjectPage key={selectedProject.id} project={selectedProject} userId={userId} /> : (
          <div className="empty-workspace"><span className="empty-illustration"><Icon size={34}><path d="M4 5h16v14H4zM4 10h16M9 10v9"/></Icon></span><h1>プロジェクトを作成しましょう</h1><p>サイドバーの追加ボタンから、最初のボードを作成できます。</p><button onClick={() => setIsCreateOpen(true)}>プロジェクトを追加</button></div>
        )}
      </main>

      {isCreateOpen && (
        <div className="modal-backdrop" onMouseDown={() => setIsCreateOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">NEW PROJECT</span><h2 id="create-project-title">プロジェクトを追加</h2></div><button className="icon-button" onClick={() => setIsCreateOpen(false)} aria-label="閉じる">×</button></div>
            <form onSubmit={createProject}>
              <label>プロジェクト名<input autoFocus value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="例：Webサイトリニューアル" /></label>
              <p className="enter-hint">Enterキーでも作成できます</p>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setIsCreateOpen(false)}>キャンセル</button><button type="submit" className="primary-button" disabled={!newProjectName.trim() || isCreating}>{isCreating ? '作成中…' : '決定'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
