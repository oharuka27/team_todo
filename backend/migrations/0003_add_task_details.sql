ALTER TABLE todos ADD COLUMN assignee_id TEXT;

UPDATE todos SET assignee_id = user_id WHERE assignee_id IS NULL;

CREATE TABLE IF NOT EXISTS todo_comments (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_todo_comments_todo_id ON todo_comments(todo_id);
