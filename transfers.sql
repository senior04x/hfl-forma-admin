-- Create transfers table in Supabase
CREATE TABLE IF NOT EXISTS public.transfers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    player_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
    current_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    new_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL, -- pending, approved, rejected
    player_name text,
    player_photo text,
    current_team_name text,
    current_team_logo text,
    new_team_name text,
    new_team_logo text
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Allow public read transfers" ON public.transfers
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public insert transfers" ON public.transfers
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public update transfers" ON public.transfers
    FOR UPDATE TO public USING (true);

CREATE POLICY "Allow public delete transfers" ON public.transfers
    FOR DELETE TO public USING (true);
