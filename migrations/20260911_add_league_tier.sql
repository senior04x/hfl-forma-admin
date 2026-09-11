-- Shared by web admin, mobile admin and the OBS controller.
-- Existing leagues stay unclassified until an administrator selects a tier.
-- NULL must not grant replay permission; only tier = 1 can do so.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS tier smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leagues'::regclass
      AND conname = 'leagues_tier_valid'
  ) THEN
    ALTER TABLE public.leagues ADD CONSTRAINT leagues_tier_valid
      CHECK (tier IN (1, 2)) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.leagues VALIDATE CONSTRAINT leagues_tier_valid;
COMMENT ON COLUMN public.leagues.tier IS
  '1 = first tier, 2 = second tier, NULL = unclassified. Replay requires explicit first-tier eligibility.';

NOTIFY pgrst, 'reload schema';
COMMIT;
