-- Create team_messages table in Supabase for real-time team chat
CREATE TABLE IF NOT EXISTS public.team_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    team_id text NOT NULL,
    sender_id text NOT NULL,
    sender_name text,
    sender_photo text,
    text text NOT NULL,
    reply_to jsonb
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Enable Supabase Realtime for team_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;

-- Create Policies
CREATE POLICY "Allow public read team_messages" ON public.team_messages
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public insert team_messages" ON public.team_messages
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public update team_messages" ON public.team_messages
    FOR UPDATE TO public USING (true);

CREATE POLICY "Allow public delete team_messages" ON public.team_messages
    FOR DELETE TO public USING (true);
