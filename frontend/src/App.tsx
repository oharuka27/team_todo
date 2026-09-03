import { useEffect, useState } from 'react'
import './App.css'
import ProjectPage from './pages/ProjectPage'
import { apiClient, type Project, type ProjectNotification, type UserAccount } from './services/api'

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
  const [notifications, setNotifications] = useState<ProjectNotification[]>([])
  const [notificationsChecked, setNotificationsChecked] = useState(false)
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [memberDialog, setMemberDialog] = useState<{ project: Project; mode: 'add' | 'remove' } | null>(null)
  const [memberCandidates, setMemberCandidates] = useState<UserAccount[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [memberConfirmation, setMemberConfirmation] = useState('')
  const [isUpdatingMembers, setIsUpdatingMembers] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [projectToLeave, setProjectToLeave] = useState<Project | null>(null)
  const [leaveConfirmation, setLeaveConfirmation] = useState('')

  useEffect(() => {
    localStorage.setItem('userId', userId)
    if (!nickname) return
    let active = true
    setNotificationsChecked(false)

    const refreshWorkspace = async (initial = false) => {
      const [projectsResult, notificationsResult] = await Promise.allSettled([
        apiClient.getProjects(userId),
        apiClient.getProjectNotifications(userId),
      ])
      if (!active) return

      if (projectsResult.status === 'fulfilled') {
        const data = projectsResult.value
        setProjects(data)
        setSelectedProjectId((current) => current && data.some((project) => project.id === current) ? current : data[0]?.id ?? null)
      } else if (initial) {
        setProjects([])
        setSelectedProjectId(null)
      }
      if (notificationsResult.status === 'fulfilled') setNotifications(notificationsResult.value)
      if (initial) setNotificationsChecked(true)
    }

    void refreshWorkspace(true)
    const intervalId = window.setInterval(() => void refreshWorkspace(), 10_000)
    const refreshOnFocus = () => void refreshWorkspace()
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshOnFocus)
    }
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
  const ownerProjects = projects.filter((project) => project.owner_id === userId)
  const memberProjects = projects.filter((project) => project.owner_id !== userId)
  const nicknameInitial = Array.from(nickname)[0]?.toUpperCase() || '?'
  const updateProjectInList = (updatedProject: Project) => {
    setProjects((items) => items.map((project) => project.id === updatedProject.id ? updatedProject : project))
  }

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
      await apiClient.deleteProject(projectToDelete.id, userId)
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

  const acknowledgeNotifications = async () => {
    setNotificationError(null)
    try {
      await apiClient.acknowledgeProjectNotifications(userId, notifications.map((item) => item.project_id))
      setNotifications([])
    } catch {
      setNotificationError('通知を確認済みにできませんでした。もう一度お試しください。')
    }
  }

  const openMemberDialog = async (project: Project, mode: 'add' | 'remove') => {
    setContextMenu(null); setMemberDialog({ project, mode }); setSelectedMemberIds([]); setMemberConfirmation(''); setMemberError(null)
    try {
      const [users, members] = await Promise.all([apiClient.getUsers(), apiClient.getProjectMembers(project.id)])
      const memberIds = new Set(members.map((member) => member.user_id))
      setMemberCandidates(mode === 'add' ? users.filter((user) => !memberIds.has(user.id) && user.id !== userId) : users.filter((user) => memberIds.has(user.id) && user.id !== userId))
    } catch {
      setMemberCandidates([]); setMemberError('メンバーリストを取得できませんでした。')
    }
  }

  const toggleMember = (memberId: string) => setSelectedMemberIds((items) => items.includes(memberId) ? items.filter((id) => id !== memberId) : [...items, memberId])
  const updateMembers = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!memberDialog || !selectedMemberIds.length || isUpdatingMembers || (memberDialog.mode === 'remove' && memberConfirmation !== '削除')) return
    setIsUpdatingMembers(true); setMemberError(null)
    try {
      if (memberDialog.mode === 'add') await Promise.all(selectedMemberIds.map((memberId) => apiClient.addProjectMember(memberDialog.project.id, userId, memberId)))
      else await Promise.all(selectedMemberIds.map((memberId) => apiClient.removeProjectMember(memberDialog.project.id, userId, memberId)))
      setMemberDialog(null)
    } catch {
      setMemberError(`メンバーを${memberDialog.mode === 'add' ? '追加' : '削除'}できませんでした。`)
    } finally { setIsUpdatingMembers(false) }
  }

  const leaveProject = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!projectToLeave || leaveConfirmation !== '脱退' || isDeleting) return
    setIsDeleting(true); setDeleteError(null)
    try {
      await apiClient.leaveProject(projectToLeave.id, userId)
      const remaining = projects.filter((project) => project.id !== projectToLeave.id)
      setProjects(remaining)
      if (selectedProjectId === projectToLeave.id) setSelectedProjectId(remaining[0]?.id ?? null)
      setProjectToLeave(null); setLeaveConfirmation('')
    } catch { setDeleteError('プロジェクトから脱退できませんでした。') }
    finally { setIsDeleting(false) }
  }

  const renderProjectItems = (items: Project[], offset: number) => items.map((project, index) => (
    <button key={project.id} className={`project-item ${project.id === selectedProjectId ? 'active' : ''}`} onClick={() => setSelectedProjectId(project.id)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ project, x: event.clientX, y: event.clientY }) }}>
      <span className={`project-icon project-icon-${(index + offset) % 4}`} aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span><span className="project-name">{project.name}</span>
    </button>
  ))

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Icon size={22}><path d="M9 11l2 2 4-4"/><path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/></Icon></span><span>Team Todo</span></div>
        <div className="sidebar-section">
          <div className="sidebar-heading"><span>プロジェクト</span><span className="project-count">{projects.length}</span></div>
          <nav className="project-list" aria-label="プロジェクト一覧">
            <div className="project-group"><div className="project-group-heading"><span>オーナープロジェクト</span><b>{ownerProjects.length}</b></div>{renderProjectItems(ownerProjects, 0)}</div>
            <div className="project-group"><div className="project-group-heading"><span>メンバープロジェクト</span><b>{memberProjects.length}</b></div>{renderProjectItems(memberProjects, ownerProjects.length)}</div>
          </nav>
          <button className="add-project-button" onClick={() => setIsCreateOpen(true)}><Icon size={18}><path d="M12 5v14M5 12h14"/></Icon>プロジェクトを追加</button>
        </div>
        {nickname && <div className="sidebar-footer"><span className="avatar">{nicknameInitial}</span><div><strong>{nickname}</strong><small>オンライン</small></div></div>}
      </aside>

      <main className="main-area">
        {!notificationsChecked && nickname ? <div className="board-loading"><span/><p>ワークスペースを読み込んでいます…</p></div> : selectedProject ? <ProjectPage key={selectedProject.id} project={selectedProject} userId={userId} nickname={nickname} onProjectUpdated={updateProjectInList} /> : (
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
        <div className="project-context-menu" role="menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - (contextMenu.project.owner_id === userId ? 140 : 56)) }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.project.owner_id === userId ? <><button className="member-menu-item" role="menuitem" onClick={() => openMemberDialog(contextMenu.project, 'add')}><span aria-hidden="true">＋</span>メンバー追加</button><button className="member-menu-item" role="menuitem" onClick={() => openMemberDialog(contextMenu.project, 'remove')}><span aria-hidden="true">−</span>メンバー削除</button><button role="menuitem" onClick={() => openDeleteDialog(contextMenu.project)}><span aria-hidden="true">×</span>プロジェクト削除</button></> : <button role="menuitem" onClick={() => { setContextMenu(null); setProjectToLeave(contextMenu.project); setLeaveConfirmation(''); setDeleteError(null) }}><span aria-hidden="true">↩</span>脱退</button>}
        </div>
      )}

      {notificationsChecked && notifications.length > 0 && (
        <div className="modal-backdrop invitation-backdrop"><div className="modal invitation-modal" role="dialog" aria-modal="true" aria-labelledby="invitation-title"><span className="account-symbol"><Icon size={25}><path d="M5 12h14M12 5v14"/></Icon></span><h2 id="invitation-title">プロジェクトに追加されました</h2><ul>{notifications.map((item) => <li key={item.project_id}>「{item.project_name}」プロジェクトに追加されました。</li>)}</ul>{notificationError && <p className="delete-error" role="alert">{notificationError}</p>}<button className="primary-button invitation-ok" onClick={acknowledgeNotifications}>OK</button></div></div>
      )}

      {memberDialog && (
        <div className="modal-backdrop" onMouseDown={() => !isUpdatingMembers && setMemberDialog(null)}><div className="modal member-modal" role="dialog" aria-modal="true" aria-labelledby="member-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><span className={`eyebrow ${memberDialog.mode === 'remove' ? 'danger-eyebrow' : ''}`}>PROJECT MEMBERS</span><h2 id="member-dialog-title">メンバーを{memberDialog.mode === 'add' ? '追加' : '削除'}</h2><p>「{memberDialog.project.name}」</p></div><button className="icon-button" onClick={() => setMemberDialog(null)} disabled={isUpdatingMembers}>×</button></div><form onSubmit={updateMembers}><div className="member-selection" role="group" aria-label="メンバーリスト">{memberCandidates.length ? memberCandidates.map((user) => <label key={user.id}><input type="checkbox" checked={selectedMemberIds.includes(user.id)} onChange={() => toggleMember(user.id)}/><span className="member-avatar">{Array.from(user.nickname)[0]}</span><strong>{user.nickname}</strong></label>) : <p>選択できるメンバーはいません。</p>}</div>{memberDialog.mode === 'remove' && <><p className="delete-warning">選択したメンバーをプロジェクトから削除します。この操作を実行するには「削除」と入力してください。</p><label>確認入力<input value={memberConfirmation} onChange={(event) => setMemberConfirmation(event.target.value)} disabled={isUpdatingMembers}/></label></>}{memberError && <p className="delete-error" role="alert">{memberError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setMemberDialog(null)} disabled={isUpdatingMembers}>キャンセル</button><button type="submit" className={memberDialog.mode === 'remove' ? 'danger-button' : 'primary-button'} disabled={!selectedMemberIds.length || isUpdatingMembers || (memberDialog.mode === 'remove' && memberConfirmation !== '削除')}>{isUpdatingMembers ? '処理中…' : '実行'}</button></div></form></div></div>
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

      {projectToLeave && (
        <div className="modal-backdrop" onMouseDown={() => !isDeleting && setProjectToLeave(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="leave-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow danger-eyebrow">LEAVE PROJECT</span><h2 id="leave-project-title">「{projectToLeave.name}」から脱退</h2></div><button className="icon-button" onClick={() => setProjectToLeave(null)} disabled={isDeleting}>×</button></div>
            <form onSubmit={leaveProject}><p className="delete-warning">プロジェクトから脱退しますか？再び参加するにはオーナーからの追加が必要です。</p><label>確認のため「脱退」と入力して実行ボタンを押してください。<input autoFocus value={leaveConfirmation} onChange={(event) => setLeaveConfirmation(event.target.value)} disabled={isDeleting}/></label>{deleteError && <p className="delete-error" role="alert">{deleteError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setProjectToLeave(null)} disabled={isDeleting}>キャンセル</button><button type="submit" className="danger-button" disabled={leaveConfirmation !== '脱退' || isDeleting}>{isDeleting ? '処理中…' : '実行'}</button></div></form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
