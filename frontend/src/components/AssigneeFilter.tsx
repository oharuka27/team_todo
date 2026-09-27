import { useEffect, useRef, useState } from 'react'
import type { ProjectMember } from '../services/api'
import { DEFAULT_AVATAR_COLOR, initialOf } from '../utils/avatar'

export const ALL_ASSIGNEES = 'all'
export const UNASSIGNED = 'unassigned'

interface AssigneeFilterProps {
  members: ProjectMember[]
  /** Selected member IDs and/or UNASSIGNED; [ALL_ASSIGNEES] selects everything. */
  filters: string[]
  onChange: (filters: string[]) => void
}

export default function AssigneeFilter({ members, filters, onChange }: AssigneeFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAll = filters.includes(ALL_ASSIGNEES)

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [isOpen])

  const toggle = (filter: string) => {
    if (filter === ALL_ASSIGNEES) {
      onChange(isAll ? [] : [ALL_ASSIGNEES])
      return
    }
    const allFilters = [UNASSIGNED, ...members.map((member) => member.user_id)]
    if (isAll) {
      onChange(allFilters.filter((item) => item !== filter))
      return
    }
    const next = filters.includes(filter) ? filters.filter((item) => item !== filter) : [...filters, filter]
    onChange(allFilters.every((item) => next.includes(item)) ? [ALL_ASSIGNEES] : next)
  }

  const isChecked = (filter: string) => isAll || filters.includes(filter)

  return (
    <div className="assignee-filter" ref={containerRef}>
      <button type="button" aria-haspopup="true" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <span>担当者</span>
        <strong>{isAll ? 'すべての担当者' : `${filters.length}件選択`}</strong>
        <i aria-hidden="true">⌄</i>
      </button>
      {isOpen && (
        <div className="assignee-filter-menu" role="group" aria-label="担当者で絞り込む">
          <label><input type="checkbox" checked={isAll} onChange={() => toggle(ALL_ASSIGNEES)} />すべての担当者</label>
          <label><input type="checkbox" checked={isChecked(UNASSIGNED)} onChange={() => toggle(UNASSIGNED)} />未アサイン</label>
          {members.map((member) => (
            <label key={member.user_id}>
              <input type="checkbox" checked={isChecked(member.user_id)} onChange={() => toggle(member.user_id)} />
              <span className="filter-member-avatar" aria-hidden="true" style={{ backgroundColor: member.avatar_color || DEFAULT_AVATAR_COLOR }}>{initialOf(member.nickname)}</span>
              {member.nickname}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
