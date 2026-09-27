import { Fragment, useState } from 'react'
import type { Project } from '../services/api'

export type ProjectGroup = 'owner' | 'member'

interface ProjectListProps {
  ownerProjects: Project[]
  memberProjects: Project[]
  selectedProjectId: string | null
  onSelect: (projectId: string) => void
  onContextMenu: (project: Project, x: number, y: number) => void
  /** Called with the group's projects in their new order; projects never move between groups. */
  onReorder: (group: ProjectGroup, reordered: Project[]) => void
}

/** The sidebar's owner / member project groups, reorderable by drag and drop within a group. */
export default function ProjectList({ ownerProjects, memberProjects, selectedProjectId, onSelect, onContextMenu, onReorder }: ProjectListProps) {
  const [draggedProject, setDraggedProject] = useState<{ id: string; group: ProjectGroup } | null>(null)
  const [dropPreview, setDropPreview] = useState<{ group: ProjectGroup; index: number } | null>(null)

  const endDrag = () => {
    setDraggedProject(null)
    setDropPreview(null)
  }

  const drop = (group: ProjectGroup, targetIndex: number) => {
    const dragged = draggedProject
    endDrag()
    if (!dragged || dragged.group !== group) return
    const groupProjects = group === 'owner' ? ownerProjects : memberProjects
    const sourceIndex = groupProjects.findIndex((project) => project.id === dragged.id)
    if (sourceIndex < 0) return
    const reordered = [...groupProjects]
    const [moved] = reordered.splice(sourceIndex, 1)
    const insertIndex = Math.max(0, Math.min(targetIndex - (sourceIndex < targetIndex ? 1 : 0), reordered.length))
    reordered.splice(insertIndex, 0, moved)
    if (reordered.some((project, index) => project.id !== groupProjects[index]?.id)) onReorder(group, reordered)
  }

  const renderDropZone = (group: ProjectGroup, index: number) => (
    <div
      className={`project-drop-zone ${dropPreview?.group === group && dropPreview.index === index ? 'active' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        if (draggedProject?.group === group) setDropPreview({ group, index })
      }}
      onDragOver={(event) => { if (draggedProject?.group === group) event.preventDefault() }}
      onDrop={(event) => {
        event.preventDefault()
        drop(group, index)
      }}
      aria-hidden="true"
    />
  )

  const renderGroup = (title: string, group: ProjectGroup, projects: Project[], iconOffset: number) => (
    <div className="project-group">
      <div className="project-group-heading"><span>{title}</span><b>{projects.length}</b></div>
      {projects.map((project, index) => (
        <Fragment key={project.id}>
          {renderDropZone(group, index)}
          <button
            draggable
            className={`project-item ${project.id === selectedProjectId ? 'active' : ''} ${draggedProject?.id === project.id ? 'dragging' : ''}`}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', project.id)
              setDraggedProject({ id: project.id, group })
            }}
            onDragEnd={endDrag}
            onClick={() => onSelect(project.id)}
            onContextMenu={(event) => {
              event.preventDefault()
              onContextMenu(project, event.clientX, event.clientY)
            }}
          >
            <span className={`project-icon project-icon-${(index + iconOffset) % 4}`} aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
            <span className="project-name">{project.name}</span>
          </button>
        </Fragment>
      ))}
      {renderDropZone(group, projects.length)}
    </div>
  )

  return (
    <nav className="project-list" aria-label="プロジェクト一覧">
      {renderGroup('オーナープロジェクト', 'owner', ownerProjects, 0)}
      {renderGroup('メンバープロジェクト', 'member', memberProjects, ownerProjects.length)}
    </nav>
  )
}
