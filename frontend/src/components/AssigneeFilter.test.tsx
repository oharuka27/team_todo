import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AssigneeFilter, { ALL_ASSIGNEES, UNASSIGNED } from './AssigneeFilter'
import type { ProjectMember } from '../services/api'

const members: ProjectMember[] = [
  { project_id: 'project-1', user_id: 'user-1', role: 'owner', nickname: '山田' },
  { project_id: 'project-1', user_id: 'user-2', role: 'member', nickname: '佐藤' },
]

function Harness({ onChange }: { onChange?: (filters: string[]) => void }) {
  const [filters, setFilters] = useState([ALL_ASSIGNEES])
  return <AssigneeFilter members={members} filters={filters} onChange={(next) => { setFilters(next); onChange?.(next) }} />
}

describe('AssigneeFilter', () => {
  it('「すべて」から1人外すと残りの担当者が選択される', async () => {
    const user = userEvent.setup()
    const changes: string[][] = []
    render(<Harness onChange={(next) => changes.push(next)} />)

    await user.click(screen.getByRole('button', { name: /担当者/ }))
    await user.click(screen.getByRole('checkbox', { name: /佐藤/ }))

    expect(changes.at(-1)).toEqual([UNASSIGNED, 'user-1'])
    expect(screen.getByRole('button', { name: /2件選択/ })).toBeInTheDocument()
  })

  it('全員を選び直すと「すべて」に戻る', async () => {
    const user = userEvent.setup()
    const changes: string[][] = []
    render(<Harness onChange={(next) => changes.push(next)} />)

    await user.click(screen.getByRole('button', { name: /担当者/ }))
    await user.click(screen.getByRole('checkbox', { name: /佐藤/ }))
    await user.click(screen.getByRole('checkbox', { name: /佐藤/ }))

    expect(changes.at(-1)).toEqual([ALL_ASSIGNEES])
  })

  it('「すべて」を外すと何も選択されない', async () => {
    const user = userEvent.setup()
    const changes: string[][] = []
    render(<Harness onChange={(next) => changes.push(next)} />)

    await user.click(screen.getByRole('button', { name: /担当者/ }))
    await user.click(screen.getByRole('checkbox', { name: 'すべての担当者' }))

    expect(changes.at(-1)).toEqual([])
  })
})
