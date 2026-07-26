-- 1. Create teams table
CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    name text NOT NULL,
    logo_url text NOT NULL,
    captain_phone text NOT NULL,
    telegram_chat_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT valid_team_status CHECK (status IN ('pending', 'approved', 'rejected', 'partially_approved'))
);

-- 2. Add team_id to applications table
ALTER TABLE public.applications 
ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

-- 3. Update applications status constraint to include 'partially_approved' if needed
ALTER TABLE public.applications DROP CONSTRAINT valid_status;
ALTER TABLE public.applications ADD CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'partially_approved'));

-- 4. Enable RLS on teams table
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- 5. Policies for teams table
CREATE POLICY "Allow anonymous insert on teams" ON public.teams
    FOR INSERT 
    TO anon
    WITH CHECK (true);

CREATE POLICY "Allow anonymous select on teams" ON public.teams
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Allow service_role full access on teams" ON public.teams
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 6. Add league column to teams table
ALTER TABLE public.teams ADD COLUMN league text DEFAULT 'Super liga';

