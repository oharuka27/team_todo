ALTER TABLE project_members ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_project_members_user_order
ON project_members(user_id, sort_order);
