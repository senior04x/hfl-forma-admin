-- Migration: Team-Initiated Transfer System
-- Date: 2026-09-22
-- Description: Add support for team-initiated transfers and career history

-- ============================================
-- 1. Add new columns to transfers table
-- ============================================

-- Compatibility flag retained for older clients; admin approval is authoritative.
ALTER TABLE public.transfers
ADD COLUMN IF NOT EXISTS player_confirmed boolean DEFAULT false;

-- Track which team requested the transfer
ALTER TABLE public.transfers
ADD COLUMN IF NOT EXISTS requested_by_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- Add comment to requested_by_team_id
COMMENT ON COLUMN public.transfers.requested_by_team_id IS 'Team that initiated the transfer request (for team-initiated transfers)';
COMMENT ON COLUMN public.transfers.player_confirmed IS 'Legacy compatibility field; not used as an approval gate';

-- ============================================
-- 2. Create player_career_history table
-- ============================================

CREATE TABLE IF NOT EXISTS public.player_career_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    team_name text,
    organization_id bigint REFERENCES public.organizations(id) ON DELETE SET NULL,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    left_at timestamp with time zone,
    created_via text DEFAULT 'registration' CHECK (created_via IN ('registration', 'transfer')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_player_career_history_player_id ON public.player_career_history(player_id);
CREATE INDEX IF NOT EXISTS idx_player_career_history_team_id ON public.player_career_history(team_id);
CREATE INDEX IF NOT EXISTS idx_player_career_history_organization_id ON public.player_career_history(organization_id);

-- Enable RLS
ALTER TABLE public.player_career_history ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Allow public read player_career_history" ON public.player_career_history
    FOR SELECT TO public USING (true);

-- Only service role can write
-- (No public INSERT/UPDATE/DELETE policies - Edge Function will use service role)

COMMENT ON TABLE public.player_career_history IS 'Track player career history across teams';
COMMENT ON COLUMN public.player_career_history.created_via IS 'How player joined this team: registration or transfer';
COMMENT ON COLUMN public.player_career_history.left_at IS 'When player left the team (NULL if currently in team)';

-- ============================================
-- 3. Create team_sessions table for captain authentication
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    token text NOT NULL UNIQUE,
    phone text NOT NULL,
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_team_sessions_token ON public.team_sessions(token);
CREATE INDEX IF NOT EXISTS idx_team_sessions_phone ON public.team_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_team_sessions_expires_at ON public.team_sessions(expires_at);

-- Enable RLS
ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can manage sessions (no public access)
-- Sessions are created by backend after OTP verification
-- Sessions are read by Edge Functions for authentication

COMMENT ON TABLE public.team_sessions IS 'Captain authentication sessions after OTP verification - managed by service role only';
COMMENT ON COLUMN public.team_sessions.token IS 'Random secure token (UUID or 32-byte hex) used for Bearer authentication';
COMMENT ON COLUMN public.team_sessions.expires_at IS 'Token expiry time (typically 24 hours from creation)';

-- ============================================
-- 4. Fix RLS policies for transfers table
-- ============================================

-- Drop existing public write policies (security vulnerability)
DROP POLICY IF EXISTS "Allow public insert transfers" ON public.transfers;
DROP POLICY IF EXISTS "Allow public update transfers" ON public.transfers;
DROP POLICY IF EXISTS "Allow public delete transfers" ON public.transfers;

-- Keep only public read access (anon + authenticated)
-- Public INSERT removed - only Edge Function (service role) can create transfers

-- Authenticated admins can UPDATE transfers in their organization
CREATE POLICY "Org admins can update org transfers" ON public.transfers
    FOR UPDATE TO authenticated
    USING (
        organization_id = public.get_user_org_id()
    )
    WITH CHECK (
        organization_id = public.get_user_org_id()
    );

-- Authenticated admins can DELETE transfers in their organization
CREATE POLICY "Org admins can delete org transfers" ON public.transfers
    FOR DELETE TO authenticated
    USING (
        organization_id = public.get_user_org_id()
    );

-- Summary:
-- - Public (anon): SELECT only
-- - Authenticated admins: SELECT, UPDATE, DELETE (own org only)
-- - Edge Function (service role): INSERT (transfer requests)
-- - Bot (service role): reads the durable notification queue only
-- - No direct public INSERT/UPDATE/DELETE

COMMENT ON TABLE public.transfers IS 'Transfer requests - admins can manage via authenticated session, new requests via Edge Function only';
