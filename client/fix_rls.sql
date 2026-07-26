-- Zayavka tashlash uchun ochiq ruxsat (anon)
CREATE POLICY "Allow anon insert applications" ON public.applications
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- Rasm yuklash uchun ochiq ruxsat (anon)
CREATE POLICY "Allow anon upload player-photos" ON storage.objects
    FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'player-photos');
