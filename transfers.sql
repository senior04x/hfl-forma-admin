-- Transfers table for HFL
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.transfers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    player_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
    old_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    new_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    player_name text,
    player_photo text,
    old_team_name text,
    old_team_logo text,
    new_team_name text,
    new_team_logo text,
    CONSTRAINT valid_transfer_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Enable RLS
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- Allow anonymous insert (from mobile app)
CREATE POLICY "Allow anonymous insert on transfers" ON public.transfers
    FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous select (for reading status)
CREATE POLICY "Allow anonymous select on transfers" ON public.transfers
    FOR SELECT TO anon USING (true);

-- Allow anonymous update (for admin actions via anon key)
CREATE POLICY "Allow anonymous update on transfers" ON public.transfers
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Allow service_role full access
CREATE POLICY "Allow service_role full access on transfers" ON public.transfers
    FOR ALL TO service_role USING (true) WITH CHECK (true);
