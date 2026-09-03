import { useEffect, useState } from 'react'
import './App.css'
import ProjectPage from './pages/ProjectPage'
import { apiClient, type Project } from './services/api'

const Icon = ({ children, size = 20 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

function App() {
  const [userId] = useState(() => localStorage.getItem('userId') || `user_${Math.random().toString(36).slice(2, 9)}`)
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '')
  const [nicknameInput, setNicknameInput] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ project: Project; x: number; y: number } | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem('userId', userId)
    if (!nickname) return
    apiClient.getProjects(userId).then((data) => {
      setProjects(data)
      setSelectedProjectId((current) => current ?? data[0]?.id ?? null)
    }).catch(() => {
      setProjects([])
      setSelectedProjectId(null)
    })
  }, [userId, nickname])

  useEffect(() => {
    if (!contextMenu) return
    const closeMenu = () => setContextMenu(null)
    const closeMenuWithEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu() }
    window.addEventListener('click', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', closeMenuWithEscape)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', closeMenuWithEscape)
    }
  }, [contextMenu])

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

  const registerAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = nicknameInput.trim()
    if (!value || isRegistering) return
    setIsRegistering(true)
    setRegistrationError(null)
    try {
      const account = await apiClient.registerUser(userId, value)
      localStorage.setItem('nickname', account.nickname)
      setNickname(account.nickname)
      setNicknameInput('')
    } catch {
      setRegistrationError('アカウントを登録できませんでした。バックエンドへの接続を確認して、もう一度お試しください。')
    } finally {
      setIsRegistering(false)
    }
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId)
  const nicknameInitial = Array.from(nickname)[0]?.toUpperCase() || '?'

  const openDeleteDialog = (project: Project) => {
    setContextMenu(null)
    setProjectToDelete(project)
    setDeleteConfirmation('')
    setDeleteError(null)
  }

  const closeDeleteDialog = () => {
    if (isDeleting) return
    setProjectToDelete(null)
    setDeleteConfirmation('')
    setDeleteError(null)
  }

  const deleteProject = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!projectToDelete || deleteConfirmation !== '削除' || isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await apiClient.deleteProject(projectToDelete.id)
      const deletedIndex = projects.findIndex((project) => project.id === projectToDelete.id)
      const remainingProjects = projects.filter((project) => project.id !== projectToDelete.id)
      setProjects(remainingProjects)
      if (selectedProjectId === projectToDelete.id) {
        setSelectedProjectId(remainingProjects[Math.min(deletedIndex, remainingProjects.length - 1)]?.id ?? null)
      }
      setProjectToDelete(null)
      setDeleteConfirmation('')
    } catch {
      setDeleteError('プロジェクトを削除できませんでした。時間をおいてもう一度お試しください。')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Icon size={22}><path d="M9 11l2 2 4-4"/><path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/></Icon></span><span>Team Todo</span></div>
        <div className="sidebar-section">
          <div className="sidebar-heading"><span>プロジェクト</span><span className="project-count">{projects.length}</span></div>
          <nav className="project-list" aria-label="プロジェクト一覧">
            {projects.map((project, index) => (
              <button key={project.id} className={`project-item ${project.id === selectedProjectId ? 'active' : ''}`} onClick={() => setSelectedProjectId(project.id)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ project, x: event.clientX, y: event.clientY }) }}>
                <span className={`project-icon project-icon-${index % 4}`} aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span><span className="project-name">{project.name}</span>
              </button>
            ))}
          </nav>
          <button className="add-project-button" onClick={() => setIsCreateOpen(true)}><Icon size={18}><path d="M12 5v14M5 12h14"/></Icon>プロジェクトを追加</button>
        </div>
        {nickname && <div className="sidebar-footer"><span className="avatar">{nicknameInitial}</span><div><strong>{nickname}</strong><small>オンライン</small></div></div>}
      </aside>

      <main className="main-area">
        {selectedProject ? <ProjectPage key={selectedProject.id} project={selectedProject} userId={userId} nickname={nickname} /> : (
          <div className="empty-workspace"><span className="empty-illustration"><Icon size={34}><path d="M4 5h16v14H4zM4 10h16M9 10v9"/></Icon></span><h1>プロジェクトを作成しましょう</h1><p>サイドバーの追加ボタンから、最初のボードを作成できます。</p><button onClick={() => setIsCreateOpen(true)}>プロジェクトを追加</button></div>
        )}
      </main>

      {!nickname && (
        <div className="modal-backdrop account-backdrop">
          <div className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-registration-title">
            <div className="account-symbol"><Icon size={28}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></Icon></div>
            <div className="account-heading"><span className="eyebrow">WELCOME</span><h2 id="account-registration-title">アカウント登録</h2><p>はじめに、Team Todoで使用するニックネームを入力してください。</p></div>
            <form onSubmit={registerAccount}>
              <label>ニックネーム<input autoFocus maxLength={40} value={nicknameInput} onChange={(event) => setNicknameInput(event.target.value)} placeholder="例：山田" disabled={isRegistering} /></label>
              <p className="account-hint">先頭の1文字がタスクのアサイン表示に使用されます。</p>
              {registrationError && <p className="delete-error" role="alert">{registrationError}</p>}
              <button type="submit" className="primary-button account-submit" disabled={!nicknameInput.trim() || isRegistering}>{isRegistering ? '登録中…' : '登録する'}</button>
            </form>
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="project-context-menu" role="menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - 56) }} onClick={(event) => event.stopPropagation()}>
          <button role="menuitem" onClick={() => openDeleteDialog(contextMenu.project)}><span aria-hidden="true">×</span>削除</button>
        </div>
      )}

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


      {projectToDelete && (
        <div className="modal-backdrop" onMouseDown={closeDeleteDialog}>
          <div className="modal delete-project-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow danger-eyebrow">DELETE PROJECT</span><h2 id="delete-project-title">「{projectToDelete.name}」を削除</h2></div><button className="icon-button" onClick={closeDeleteDialog} aria-label="閉じる" disabled={isDeleting}>×</button></div>
            <form onSubmit={deleteProject}>
              <p className="delete-warning">この操作は取り消せません。プロジェクト内のタスクもすべて削除されます。</p>
              <label>確認のため「削除」と入力して実行ボタンを押してください。<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} disabled={isDeleting} /></label>
              {deleteError && <p className="delete-error" role="alert">{deleteError}</p>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeDeleteDialog} disabled={isDeleting}>キャンセル</button><button type="submit" className="danger-button" disabled={deleteConfirmation !== '削除' || isDeleting}>{isDeleting ? '削除中…' : '実行'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
