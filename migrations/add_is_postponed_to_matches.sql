-- Migration: Add is_postponed column to matches table
-- Purpose: Track postponed matches for OBS Scoreboard prematch screen
-- Safe: Uses DEFAULT false, existing rows not affected
-- Date: 2026-09-21

-- Add column if not exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'matches'
        AND column_name = 'is_postponed'
    ) THEN
        ALTER TABLE matches
        ADD COLUMN is_postponed BOOLEAN DEFAULT false;

        RAISE NOTICE 'Column is_postponed added to matches table';
    ELSE
        RAISE NOTICE 'Column is_postponed already exists in matches table';
    END IF;
END $$;

-- Add index for performance (OBS frequently queries scheduled matches)
CREATE INDEX IF NOT EXISTS idx_matches_is_postponed
ON matches(is_postponed)
WHERE is_postponed = true;

-- Comment for documentation
COMMENT ON COLUMN matches.is_postponed IS
'Indicates if match has been postponed. Used by OBS Scoreboard to skip postponed matches when selecting next prematch. Managed via admin panel Schedule screen.';
