-- Add is_archived column to teams table to support soft deletion (archiving)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Create index on is_archived for fast filtering
CREATE INDEX IF NOT EXISTS idx_teams_is_archived ON teams(is_archived);
