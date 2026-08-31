import { useState, useEffect } from 'react'
import './App.css'
import HomePage from './pages/HomePage'
import ProjectPage from './pages/ProjectPage'

type Page = 'home' | 'project'

interface AppState {
  page: Page
  selectedProjectId?: string
}

function App() {
  const [state, setState] = useState<AppState>({ page: 'home' })
  const [userId] = useState(() => localStorage.getItem('userId') || `user_${Math.random().toString(36).slice(2, 9)}`)

  useEffect(() => {
    localStorage.setItem('userId', userId)
  }, [userId])

  const handleSelectProject = (projectId: string) => {
    setState({ page: 'project', selectedProjectId: projectId })
  }

  const handleBackToHome = () => {
    setState({ page: 'home' })
  }

  return (
    <div className="app">
      {state.page === 'home' && (
        <HomePage userId={userId} onSelectProject={handleSelectProject} />
      )}
      {state.page === 'project' && state.selectedProjectId && (
        <ProjectPage 
          projectId={state.selectedProjectId} 
          userId={userId}
          onBack={handleBackToHome}
        />
      )}
    </div>
  )
}

export default App
