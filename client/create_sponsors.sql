-- 1. Create a sponsors table
CREATE TABLE IF NOT EXISTS public.sponsors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    logo_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for the table
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access for the sake of the admin panel (or restrict if needed)
CREATE POLICY "Enable read access for all users" ON public.sponsors FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.sponsors FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete access for all users" ON public.sponsors FOR DELETE USING (true);

-- 2. Create the storage bucket for sponsors
INSERT INTO storage.buckets (id, name, public) 
VALUES ('sponsors', 'sponsors', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the new bucket
CREATE POLICY "Sponsors images are publicly accessible." 
ON storage.objects FOR SELECT USING ( bucket_id = 'sponsors' );

CREATE POLICY "Anyone can upload sponsors images." 
ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'sponsors' );

CREATE POLICY "Anyone can update/delete sponsors images." 
ON storage.objects FOR DELETE USING ( bucket_id = 'sponsors' );
CREATE POLICY "Anyone can update sponsors images." 
ON storage.objects FOR UPDATE USING ( bucket_id = 'sponsors' );
