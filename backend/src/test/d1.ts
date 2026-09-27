import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

type Row = Record<string, unknown>

const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url))
const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(`${migrationsDir}${file}`, 'utf8'))

class TestStatement {
  private params: SQLInputValue[] = []

  constructor(private readonly db: DatabaseSync, private readonly sql: string) {}

  bind(...params: unknown[]) {
    this.params = params.map((param) => (param === undefined ? null : param) as SQLInputValue)
    return this
  }

  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) ?? null) as T | null
  }

  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] }
  }

  async run() {
    return this.runSync()
  }

  runSync() {
    const result = this.db.prepare(this.sql).run(...this.params)
    return { meta: { changes: Number(result.changes) } }
  }
}

/**
 * An in-memory SQLite database with every migration applied, exposing the subset of the
 * D1 API the worker uses. Tests therefore exercise the real SQL and schema.
 */
export class TestD1 {
  private readonly db = new DatabaseSync(':memory:')

  constructor() {
    for (const migration of migrations) this.db.exec(migration)
  }

  prepare(sql: string) {
    return new TestStatement(this.db, sql)
  }

  // D1 runs a batch as a single transaction.
  async batch(statements: TestStatement[]) {
    this.db.exec('BEGIN')
    try {
      const results = statements.map((statement) => statement.runSync())
      this.db.exec('COMMIT')
      return results
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  query<T = Row>(sql: string, ...params: SQLInputValue[]) {
    return this.db.prepare(sql).all(...params) as T[]
  }

  execute(sql: string, ...params: SQLInputValue[]) {
    this.db.prepare(sql).run(...params)
  }

  seedUser(id: string, nickname: string, avatarColor = '#4a9c9b') {
    this.execute('INSERT INTO users (id, nickname, avatar_color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, nickname, avatarColor, 'now', 'now')
  }

  private table(name: string) {
    return this.query(`SELECT * FROM ${name} ORDER BY rowid`)
  }

  get users() { return this.table('users') }
  get projects() { return this.table('projects') }
  get members() { return this.table('project_members') }
  get columns() { return this.table('board_columns') }
  get topics() { return this.table('topics') }
  get todos() { return this.table('todos') }
  get comments() { return this.table('todo_comments') }
}
