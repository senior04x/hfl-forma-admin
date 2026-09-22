-- Session-scoped reads for the captain transfer page; no public table access.
BEGIN;
CREATE INDEX IF NOT EXISTS applications_transfer_name_idx ON public.applications
    (lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) text_pattern_ops)
    WHERE team_id IS NOT NULL AND status='approved';
CREATE INDEX IF NOT EXISTS applications_transfer_surname_idx ON public.applications
    (lower(coalesce(last_name,'')) text_pattern_ops)
    WHERE team_id IS NOT NULL AND status='approved';
CREATE INDEX IF NOT EXISTS transfers_requesting_team_page_idx
    ON public.transfers(requested_by_team_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION public.team_transfer_page(
    p_token_hash text, p_action text, p_query text DEFAULT '', p_after uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    v_session public.team_sessions%ROWTYPE;
    v_team public.teams%ROWTYPE;
    v_window boolean;
    v_items jsonb;
    v_pattern text;
    v_after_time timestamptz;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status',401,'error','Invalid session');
    END IF;
    SELECT * INTO v_session FROM public.team_sessions
    WHERE token=p_token_hash AND expires_at>clock_timestamp();
    IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Invalid or expired session'); END IF;
    SELECT * INTO v_team FROM public.teams WHERE id=v_session.team_id;
    IF NOT FOUND OR v_team.organization_id IS NULL
       OR public.transfer_phone(v_team.captain_phone) IS DISTINCT FROM v_session.phone THEN
        RETURN jsonb_build_object('status',401,'error','Captain authorization changed');
    END IF;
    IF p_action='logout' THEN
        DELETE FROM public.team_sessions WHERE id=v_session.id;
        RETURN jsonb_build_object('status',200,'success',true);
    ELSIF p_action='context' THEN
        SELECT transfer_window_open INTO v_window FROM public.organizations WHERE id=v_team.organization_id;
        RETURN jsonb_build_object('status',200,'team',jsonb_build_object('id',v_team.id,'name',v_team.name),
            'transfer_window_open',coalesce(v_window,false));
    ELSIF p_action='players' THEN
        IF p_query IS NULL OR length(btrim(p_query)) NOT BETWEEN 2 AND 80 THEN
            RETURN jsonb_build_object('status',400,'error','Enter 2-80 characters');
        END IF;
        v_pattern:=replace(replace(replace(lower(btrim(p_query)),chr(92),chr(92)||chr(92)),
            '%',chr(92)||'%'),'_',chr(92)||'_')||'%';
        SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) INTO v_items FROM (
            SELECT a.id,a.first_name,a.last_name,t.name AS team_name,
                EXISTS (SELECT 1 FROM public.transfers tr WHERE tr.player_id=a.id AND tr.status='pending') AS has_pending
            FROM public.applications a JOIN public.teams t ON t.id=a.team_id
            WHERE t.organization_id=v_team.organization_id AND t.id<>v_team.id AND a.status='approved'
                AND (p_after IS NULL OR a.id>p_after)
                AND (lower(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')) LIKE v_pattern
                     OR lower(coalesce(a.last_name,'')) LIKE v_pattern)
            ORDER BY a.id LIMIT 21
        ) r;
    ELSIF p_action='history' THEN
        IF p_after IS NOT NULL THEN
            SELECT created_at INTO v_after_time FROM public.transfers
            WHERE id=p_after AND requested_by_team_id=v_team.id AND organization_id=v_team.organization_id;
            IF NOT FOUND THEN RETURN jsonb_build_object('status',400,'error','Invalid cursor'); END IF;
        END IF;
        SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_items FROM (
            SELECT id,player_name,old_team_name,status,created_at,reason
            FROM public.transfers
            WHERE requested_by_team_id=v_team.id AND organization_id=v_team.organization_id
                AND (p_after IS NULL OR (created_at,id)<(v_after_time,p_after))
            ORDER BY created_at DESC,id DESC LIMIT 21
        ) r;
    ELSE RETURN jsonb_build_object('status',400,'error','Invalid action');
    END IF;
    RETURN jsonb_build_object('status',200,'items',
        CASE WHEN jsonb_array_length(v_items)>20 THEN v_items-20 ELSE v_items END,
        'next_cursor',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items->19->>'id' ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.team_transfer_page(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.team_transfer_page(text,text,text,uuid) TO service_role;
COMMIT;
