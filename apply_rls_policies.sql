-- ====================================================================
-- HFL MULTI-ORGANIZATION SECURITY & ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
-- Yo'riqnoma: Bu kodni nusxalab, Supabase Dashboard -> SQL Editor
-- sahifasiga tashlang va "RUN" tugmasini bosing.
-- ====================================================================

-- 1. APPLICATONS (ARIZALAR VA O'YINCHILAR)
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Eski siyosatlarni tozalash (xatolik bo'lmasligi uchun)
DROP POLICY IF EXISTS "Allow anon insert applications" ON public.applications;
DROP POLICY IF EXISTS "applications_org_isolation" ON public.applications;

-- Anonim foydalanuvchilar (forma sayti) faqat zayavka topshira oladi
CREATE POLICY "Allow anon insert applications" ON public.applications
    FOR INSERT TO anon
    WITH CHECK (status = 'pending');

-- Adminlar uchun: Super admin hamma arizalarni, Org admin faqat o'zining arizalarini ko'radi/tahrirlaydi
CREATE POLICY "applications_org_isolation" ON public.applications
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.admin_users WHERE id = auth.uid()) = 'super_admin'
        OR organization_id = (SELECT organization_id FROM public.admin_users WHERE id = auth.uid())
        OR organization_id IS NULL
    );


-- 2. TEAMS (JAMOALAR)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_org_isolation" ON public.teams;
DROP POLICY IF EXISTS "Allow anon select approved teams" ON public.teams;

-- Ochiq sayt uchun tasdiqlangan jamoalarni ko'rish ruxsati
CREATE POLICY "Allow anon select approved teams" ON public.teams
    FOR SELECT TO anon
    USING (status IN ('approved', 'partially_approved'));

-- Adminlar uchun tashkilotlar bo'yicha ajratish
CREATE POLICY "teams_org_isolation" ON public.teams
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.admin_users WHERE id = auth.uid()) = 'super_admin'
        OR organization_id = (SELECT organization_id FROM public.admin_users WHERE id = auth.uid())
        OR organization_id IS NULL
    );

-- Anonim jamoaviy zayavka topshirish ruxsati
CREATE POLICY "Allow anon insert pending teams" ON public.teams
    FOR INSERT TO anon
    WITH CHECK (status = 'pending');


-- 3. MATCHES (O'YINLAR JADVALI)
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matches_org_isolation" ON public.matches;
DROP POLICY IF EXISTS "Allow anon select matches" ON public.matches;

-- Ochiq sayt uchun o'yinlarni ko'rish ruxsati
CREATE POLICY "Allow anon select matches" ON public.matches
    FOR SELECT TO anon
    USING (true);

-- Adminlar uchun o'yinlarni boshqarish
CREATE POLICY "matches_org_isolation" ON public.matches
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.admin_users WHERE id = auth.uid()) = 'super_admin'
        OR organization_id = (SELECT organization_id FROM public.admin_users WHERE id = auth.uid())
        OR organization_id IS NULL
    );


-- 4. LEAGUES (LIGALAR)
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leagues_org_isolation" ON public.leagues;
DROP POLICY IF EXISTS "Allow anon select leagues" ON public.leagues;

CREATE POLICY "Allow anon select leagues" ON public.leagues
    FOR SELECT TO anon
    USING (true);

CREATE POLICY "leagues_org_isolation" ON public.leagues
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.admin_users WHERE id = auth.uid()) = 'super_admin'
        OR organization_id = (SELECT organization_id FROM public.admin_users WHERE id = auth.uid())
        OR organization_id IS NULL
    );


-- 5. STORAGE OBJECTS (PLAYER PHOTOS & LOGOS)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon upload player-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public view player-photos" ON storage.objects;

-- Rasm yuklash ruxsati (zayavka topshirayotganda)
CREATE POLICY "Allow anon upload player-photos" ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (bucket_id = 'player-photos');

-- Rasmlarni ochiq ko'rish ruxsati
CREATE POLICY "Allow public view player-photos" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'player-photos');


-- ====================================================================
-- RLS SIYOSATLARI MUVAFFAQIYATLI O'RNATILDI
-- ====================================================================
