CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

ALTER TABLE todos ADD COLUMN topic_id TEXT;

CREATE INDEX IF NOT EXISTS idx_topics_project_id ON topics(project_id);
CREATE INDEX IF NOT EXISTS idx_todos_topic_id ON todos(topic_id);
