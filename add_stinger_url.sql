-- Tashkilotlarga shaxsiy Stinger animation videosini saqlash uchun ustun qo'shish
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS stinger_url TEXT;

-- O'yin voqelari / replaylar uchun gol videosi havola ustunini qo'shish
ALTER TABLE public.match_events ADD COLUMN IF NOT EXISTS replay_video_url TEXT;

COMMENT ON COLUMN public.organizations.stinger_url IS 'Tashkilotning OBS Stinger o-tish videosi (webm / alpha) URL manzili';
COMMENT ON COLUMN public.match_events.replay_video_url IS '20-sekundlik saqlangan gol videosining bulutli URL manzili';
