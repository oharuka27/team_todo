INSERT OR IGNORE INTO project_members (
  project_id,
  user_id,
  role,
  created_at,
  notified_at,
  sort_order
)
SELECT
  id,
  owner_id,
  'owner',
  created_at,
  created_at,
  0
FROM projects;
