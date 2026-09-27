-- Link tasks to board columns by ID instead of by (renamable, possibly duplicated) title.
ALTER TABLE todos ADD COLUMN column_id TEXT;

UPDATE todos SET column_id = (
  SELECT bc.id FROM board_columns bc
  WHERE bc.project_id = todos.project_id AND bc.title = todos.column_name
  ORDER BY bc.position ASC LIMIT 1
);

-- Tasks whose column_name matches no column (e.g. created as 'To Do' after a rename)
-- were invisible on the board; place them in the project's first column.
UPDATE todos SET column_id = (
  SELECT bc.id FROM board_columns bc
  WHERE bc.project_id = todos.project_id
  ORDER BY bc.position ASC LIMIT 1
) WHERE column_id IS NULL;

UPDATE todos SET column_name = (SELECT bc.title FROM board_columns bc WHERE bc.id = todos.column_id)
WHERE column_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_todos_column_id ON todos(column_id);
