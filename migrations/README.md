# Database Migrations

## How to apply migrations

### Option 1: Supabase Dashboard (Recommended)
1. Go to https://xzzyhfyazwohdqqbjiiy.supabase.co/project/_/sql
2. Open `add_is_postponed_to_matches.sql` in a text editor
3. Copy the SQL content
4. Paste into Supabase SQL Editor
5. Click "Run" button

### Option 2: Command Line (if you have direct DB access)
```bash
psql -h db.xzzyhfyazwohdqqbjiiy.supabase.co -U postgres -d postgres -f migrations/add_is_postponed_to_matches.sql
```

## Current Migrations

### `add_is_postponed_to_matches.sql` (2026-09-21)
**Purpose:** Add `is_postponed` column to `matches` table

**Why:** OBS Scoreboard needs to skip postponed matches when showing prematch screen. Without this column, feature relies on localStorage which doesn't work cross-device (admin panel → OBS Browser Source).

**Safe:** 
- Uses `DEFAULT false` — existing rows unaffected
- Idempotent (can run multiple times safely)
- Adds index only for `true` values (performance)

**Dependencies:** None

**Rollback (if needed):**
```sql
DROP INDEX IF EXISTS idx_matches_is_postponed;
ALTER TABLE matches DROP COLUMN IF EXISTS is_postponed;
```
