ALTER TABLE project_members ADD COLUMN notified_at TEXT;

-- Existing memberships predate the notification feature and must not generate
-- historical notifications on the first deployment.
UPDATE project_members SET notified_at = created_at WHERE notified_at IS NULL;
