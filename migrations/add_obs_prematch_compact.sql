-- Per-match OBS prematch presentation. Existing matches keep the full announcement.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS obs_prematch_compact boolean NOT NULL DEFAULT false;
