import { SignIn, useAuth, useClerk } from '@clerk/react'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import './App.css'
import AccountRegistrationDialog from './components/AccountRegistrationDialog'
import ConfirmTextDialog from './components/ConfirmTextDialog'
import CreateProjectDialog from './components/CreateProjectDialog'
import Icon from './components/Icon'
import MemberDialog from './components/MemberDialog'
import NoticeDialog from './components/NoticeDialog'
import ProjectList, { type ProjectGroup } from './components/ProjectList'
import UserSettingsDialog from './components/UserSettingsDialog'
import { useRealtimeSocket } from './hooks/useRealtimeSocket'
import ProjectPage from './pages/ProjectPage'
import { ApiError, apiClient, type Project, type ProjectNotification, type UserAccount } from './services/api'

const DEFAULT_AVATAR_COLOR = '#4a9c9b'

function App() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  // Layout effects run before the workspace's data-fetching effects, so every request carries the session token.
  useLayoutEffect(() => { apiClient.setTokenProvider(() => getToken()) }, [getToken])

  if (!isLoaded) return <div className="auth-screen"><div className="board-loading"><span /><p>読み込んでいます…</p></div></div>
  if (!isSignedIn || !userId) return <div className="auth-screen"><SignIn withSignUp /></div>
  return <Workspace key={userId} userId={userId} />
}

type ContextMenu = { project: Project; x: number; y: number }
type ProjectDialog =
  | { kind: 'create' }
  | { kind: 'delete' | 'leave'; project: Project }
  | { kind: 'members'; project: Project; mode: 'add' | 'remove' }

function Workspace({ userId }: { userId: string }) {
  const { signOut } = useClerk()
  const [account, setAccount] = useState<{ nickname: string; avatarColor: string } | null>(null)
  const [isAccountLoaded, setIsAccountLoaded] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false)
  const [notifications, setNotifications] = useState<ProjectNotification[]>([])
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [deletedProjectNotices, setDeletedProjectNotices] = useState<ProjectNotification[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [dialog, setDialog] = useState<ProjectDialog | null>(null)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const nickname = account?.nickname ?? ''
  const avatarColor = account?.avatarColor ?? DEFAULT_AVATAR_COLOR
  const applyAccount = (user: UserAccount) => setAccount({ nickname: user.nickname, avatarColor: user.avatar_color || DEFAULT_AVATAR_COLOR })

  useEffect(() => {
    let active = true
    apiClient.getCurrentUser()
      .then((user) => { if (active && user) setAccount({ nickname: user.nickname, avatarColor: user.avatar_color || DEFAULT_AVATAR_COLOR }) })
      .catch(() => { if (active) setAccountError('アカウント情報を取得できませんでした。バックエンドへの接続を確認してください。') })
      .finally(() => { if (active) setIsAccountLoaded(true) })
    return () => { active = false }
  }, [])

  const isRegistered = account !== null
  useEffect(() => {
    if (!isRegistered) return
    let active = true
    const refreshWorkspace = async () => {
      const [projectsResult, notificationsResult] = await Promise.allSettled([apiClient.getProjects(), apiClient.getProjectNotifications(userId)])
      if (!active) return
      if (projectsResult.status === 'fulfilled') {
        const data = projectsResult.value
        setProjects(data)
        setSelectedProjectId((current) => current && data.some((project) => project.id === current) ? current : data[0]?.id ?? null)
      }
      if (notificationsResult.status === 'fulfilled') setNotifications(notificationsResult.value)
      setIsWorkspaceLoaded(true)
    }

    void refreshWorkspace()
    const refresh = () => void refreshWorkspace()
    window.addEventListener('focus', refresh)
    window.addEventListener('team-todo-refresh', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('team-todo-refresh', refresh)
    }
  }, [userId, isRegistered])

  useRealtimeSocket(isRegistered ? `user:${userId}` : null, () => apiClient.connectUserEvents(userId), (event) => {
    try {
      const message = JSON.parse(String(event.data)) as { type?: string; project_id?: string; project_name?: string }
      const { type, project_id: projectId, project_name: projectName } = message
      if (type === 'project.deleted' && projectId && projectName) {
        setDeletedProjectNotices((items) => items.some((item) => item.project_id === projectId) ? items : [...items, { project_id: projectId, project_name: projectName }])
      }
    } catch { /* ignore malformed realtime messages */ }
    window.dispatchEvent(new Event('team-todo-refresh'))
  })

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

  const selectedProject = projects.find((project) => project.id === selectedProjectId)
  const ownerProjects = projects.filter((project) => project.owner_id === userId)
  const memberProjects = projects.filter((project) => project.owner_id !== userId)

  const updateProjectInList = useCallback((updatedProject: Project) => {
    setProjects((items) => items.map((project) => project.id === updatedProject.id ? updatedProject : project))
  }, [])

  const removeProjectFromList = (projectId: string) => {
    const removedIndex = projects.findIndex((project) => project.id === projectId)
    const remaining = projects.filter((project) => project.id !== projectId)
    setProjects(remaining)
    if (selectedProjectId === projectId) setSelectedProjectId(remaining[Math.min(removedIndex, remaining.length - 1)]?.id ?? null)
  }

  const openDialog = (next: ProjectDialog) => {
    setContextMenu(null)
    setDialog(next)
  }

  const deleteProject = async (project: Project) => {
    // A 404 means the project is already gone, which is the outcome the user asked for.
    await apiClient.deleteProject(project.id).catch((error: unknown) => {
      if (!(error instanceof ApiError && error.status === 404)) throw error
    })
    removeProjectFromList(project.id)
    setDialog(null)
  }

  const leaveProject = async (project: Project) => {
    await apiClient.leaveProject(project.id)
    removeProjectFromList(project.id)
    setDialog(null)
  }

  const reorderProjects = async (group: ProjectGroup, reordered: Project[]) => {
    const previous = projects
    setProjects(group === 'owner' ? [...reordered, ...memberProjects] : [...ownerProjects, ...reordered])
    try {
      await apiClient.updateProjectOrder(userId, group, reordered.map((project) => project.id))
    } catch {
      setProjects(previous)
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

  const isOwnerMenu = contextMenu?.project.owner_id === userId

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon size={22}><path d="M9 11l2 2 4-4" /><path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" /></Icon>
          </span>
          <span>Team Todo</span>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-heading"><span>プロジェクト</span><span className="project-count">{projects.length}</span></div>
          <ProjectList
            ownerProjects={ownerProjects}
            memberProjects={memberProjects}
            selectedProjectId={selectedProjectId}
            onSelect={setSelectedProjectId}
            onContextMenu={(project, x, y) => setContextMenu({ project, x, y })}
            onReorder={(group, reordered) => void reorderProjects(group, reordered)}
          />
          <button className="add-project-button" onClick={() => openDialog({ kind: 'create' })}>
            <Icon size={18}><path d="M12 5v14M5 12h14" /></Icon>プロジェクトを追加
          </button>
        </div>
        {account && (
          <div className="sidebar-footer">
            <button className="avatar avatar-button" style={{ backgroundColor: avatarColor }} onClick={() => setIsUserMenuOpen((open) => !open)} aria-label="ユーザーメニュー">
              {Array.from(nickname)[0]?.toUpperCase() || '?'}
            </button>
            <div><strong>{nickname}</strong><small>オンライン</small></div>
            {isUserMenuOpen && (
              <div className="user-settings-menu" role="menu">
                <button role="menuitem" onClick={() => { setIsUserMenuOpen(false); setIsSettingsOpen(true) }}>⚙ 設定</button>
                <button role="menuitem" onClick={() => void signOut()}>↪ ログアウト</button>
              </div>
            )}
          </div>
        )}
      </aside>

      <main className="main-area">
        {!isAccountLoaded || (account && !isWorkspaceLoaded) ? (
          <div className="board-loading"><span /><p>ワークスペースを読み込んでいます…</p></div>
        ) : selectedProject ? (
          <ProjectPage key={selectedProject.id} project={selectedProject} userId={userId} nickname={nickname} avatarColor={avatarColor} onProjectUpdated={updateProjectInList} />
        ) : (
          <div className="empty-workspace">
            <span className="empty-illustration"><Icon size={34}><path d="M4 5h16v14H4zM4 10h16M9 10v9" /></Icon></span>
            <h1>プロジェクトを作成しましょう</h1>
            <p>サイドバーの追加ボタンから、最初のボードを作成できます。</p>
            <button onClick={() => openDialog({ kind: 'create' })}>プロジェクトを追加</button>
          </div>
        )}
      </main>

      {isAccountLoaded && !account && <AccountRegistrationDialog initialError={accountError} onRegistered={applyAccount} />}

      {isSettingsOpen && (
        <UserSettingsDialog
          userId={userId}
          nickname={nickname}
          avatarColor={avatarColor}
          onSaved={(user) => { applyAccount(user); setIsSettingsOpen(false) }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {contextMenu && (
        <div
          className="project-context-menu"
          role="menu"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - (isOwnerMenu ? 140 : 56)) }}
          onClick={(event) => event.stopPropagation()}
        >
          {isOwnerMenu ? (
            <>
              <button className="member-menu-item" role="menuitem" onClick={() => openDialog({ kind: 'members', project: contextMenu.project, mode: 'add' })}>
                <span aria-hidden="true">＋</span>メンバー追加
              </button>
              <button className="member-menu-item" role="menuitem" onClick={() => openDialog({ kind: 'members', project: contextMenu.project, mode: 'remove' })}>
                <span aria-hidden="true">−</span>メンバー削除
              </button>
              <button role="menuitem" onClick={() => openDialog({ kind: 'delete', project: contextMenu.project })}>
                <span aria-hidden="true">×</span>プロジェクト削除
              </button>
            </>
          ) : (
            <button role="menuitem" onClick={() => openDialog({ kind: 'leave', project: contextMenu.project })}>
              <span aria-hidden="true">↩</span>脱退
            </button>
          )}
        </div>
      )}

      {isWorkspaceLoaded && notifications.length > 0 && (
        <NoticeDialog
          titleId="invitation-title"
          title="プロジェクトに追加されました"
          icon={<Icon size={25}><path d="M5 12h14M12 5v14" /></Icon>}
          messages={notifications.map((item) => ({ key: item.project_id, text: `「${item.project_name}」プロジェクトに追加されました。` }))}
          error={notificationError}
          onAcknowledge={acknowledgeNotifications}
        />
      )}

      {deletedProjectNotices.length > 0 && (
        <NoticeDialog
          titleId="project-deleted-title"
          title="プロジェクトが削除されました"
          icon={<Icon size={25}><path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12" /></Icon>}
          symbolClassName="deleted-project-symbol"
          messages={deletedProjectNotices.map((item) => ({ key: item.project_id, text: `「${item.project_name}」プロジェクトはオーナーによって削除されました。` }))}
          onAcknowledge={() => setDeletedProjectNotices([])}
        />
      )}

      {dialog?.kind === 'create' && (
        <CreateProjectDialog
          onCreated={(created) => {
            setProjects((items) => [...items, created])
            setSelectedProjectId(created.id)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'members' && <MemberDialog project={dialog.project} mode={dialog.mode} onClose={() => setDialog(null)} />}

      {dialog?.kind === 'delete' && (
        <ConfirmTextDialog
          className="delete-project-modal"
          eyebrow="DELETE PROJECT"
          title={`「${dialog.project.name}」を削除`}
          warning="この操作は取り消せません。プロジェクト内のタスクもすべて削除されます。"
          confirmWord="削除"
          busyLabel="削除中…"
          errorMessage="プロジェクトを削除できませんでした。時間をおいてもう一度お試しください。"
          onConfirm={() => deleteProject(dialog.project)}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'leave' && (
        <ConfirmTextDialog
          eyebrow="LEAVE PROJECT"
          title={`「${dialog.project.name}」から脱退`}
          warning="プロジェクトから脱退しますか？再び参加するにはオーナーからの追加が必要です。"
          confirmWord="脱退"
          busyLabel="処理中…"
          errorMessage="プロジェクトから脱退できませんでした。"
          onConfirm={() => leaveProject(dialog.project)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

export default App
