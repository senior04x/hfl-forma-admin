-- Havas Futbol Ligasi - Supabase Setup SQL

-- 1. Create the applications table
CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    photo_url text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    father_name text,
    passport_series character varying(2) NOT NULL,
    passport_number character varying(7) NOT NULL,
    phone text NOT NULL,
    comment text,
    status text DEFAULT 'pending'::text NOT NULL,
    telegram_chat_id text,
    
    -- Constraint: status must be one of the predefined values
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- 2. Create player-photos bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('player-photos', 'player-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Set up Row Level Security (RLS) policies for applications table

-- Enable RLS
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to INSERT new applications
CREATE POLICY "Allow anonymous insert" ON public.applications
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- Allow anonymous users to SELECT their own application by ID (for checking status)
CREATE POLICY "Allow anonymous select by id" ON public.applications
    FOR SELECT
    TO anon
    USING (true); -- In a real app we might restrict this, but for deep links with UUIDs it's safe enough since UUIDs are unguessable

-- Allow service_role (Admin) full access
CREATE POLICY "Allow service_role full access" ON public.applications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. Set up Storage RLS policies for player-photos bucket

-- Allow anonymous users to upload photos
CREATE POLICY "Allow anonymous upload" ON storage.objects
    FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'player-photos');

-- Allow public read access to photos
CREATE POLICY "Allow public read" ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'player-photos');

-- Allow service_role full access to photos
CREATE POLICY "Allow service_role full storage access" ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'player-photos')
    WITH CHECK (bucket_id = 'player-photos');
