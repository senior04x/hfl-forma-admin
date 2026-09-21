-- Migration: Add player_sessions for player-initiated transfer authentication
-- Date: 2026-09-22
-- Description: Session tokens for players after OTP verification (similar to team_sessions)

-- ============================================
-- Create player_sessions table
-- ============================================

CREATE TABLE IF NOT EXISTS public.player_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    token text NOT NULL UNIQUE,
    phone text NOT NULL,
    player_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_player_sessions_token ON public.player_sessions(token);
CREATE INDEX IF NOT EXISTS idx_player_sessions_phone ON public.player_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_player_sessions_player_id ON public.player_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_expires_at ON public.player_sessions(expires_at);

-- Enable RLS
ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can manage sessions (no public access)
-- Sessions are created by Edge Functions after OTP verification
-- Sessions are read by Edge Functions for authentication

COMMENT ON TABLE public.player_sessions IS 'Player authentication sessions after OTP verification - managed by service role only';
COMMENT ON COLUMN public.player_sessions.token IS 'Random secure token (UUID) used for Bearer authentication';
COMMENT ON COLUMN public.player_sessions.player_id IS 'Reference to applications table (player ID)';
COMMENT ON COLUMN public.player_sessions.expires_at IS 'Token expiry time (typically 24 hours from creation)';
