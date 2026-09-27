import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url))
const migrationFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
const applyMigrations = (db: DatabaseSync, files: string[]) => {
  for (const file of files) db.exec(readFileSync(`${migrationsDir}${file}`, 'utf8'))
}

describe('D1 migrations', () => {
  it('0010 links existing tasks to columns by ID and rescues tasks with unknown column names', () => {
    const db = new DatabaseSync(':memory:')
    const columnIdMigration = migrationFiles.indexOf('0010_add_todo_column_id.sql')
    applyMigrations(db, migrationFiles.slice(0, columnIdMigration))
    db.exec(`
      INSERT INTO projects VALUES ('p1', 'Project', NULL, 'u1', 't', 't');
      INSERT INTO board_columns VALUES ('c1', 'p1', '未着手', 0, 't', 't'), ('c2', 'p1', 'In Progress', 1, 't', 't');
      INSERT INTO todos (id, project_id, title, column_name, user_id, created_at, updated_at)
      VALUES ('matched', 'p1', 'ok', 'In Progress', 'u1', 't', 't'), ('orphaned', 'p1', 'lost', 'To Do', 'u1', 't', 't');
    `)

    applyMigrations(db, migrationFiles.slice(columnIdMigration, columnIdMigration + 1))

    expect(db.prepare('SELECT id, column_id, column_name FROM todos ORDER BY id').all()).toEqual([
      { id: 'matched', column_id: 'c2', column_name: 'In Progress' },
      { id: 'orphaned', column_id: 'c1', column_name: '未着手' },
    ])
  })

  it('applies every migration to an empty database', () => {
    expect(() => applyMigrations(new DatabaseSync(':memory:'), migrationFiles)).not.toThrow()
  })
})
