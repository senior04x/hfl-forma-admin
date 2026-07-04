CREATE POLICY "Allow authenticated full access on teams" ON public.teams
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
