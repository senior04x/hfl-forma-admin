-- Return ten players per page while preserving server-side search and cursor pagination.
BEGIN;
CREATE OR REPLACE FUNCTION public.team_transfer_page(
    p_token_hash text, p_action text, p_query text DEFAULT '', p_after uuid DEFAULT NULL,
    p_team_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    v_session public.team_sessions%ROWTYPE;
    v_team public.teams%ROWTYPE;
    v_target public.teams%ROWTYPE;
    v_window boolean;
    v_items jsonb;
    v_pattern text;
    v_after_time timestamptz;
    v_limit integer;
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
    v_limit:=CASE WHEN p_action='players' THEN 10 WHEN p_action='history' THEN 20 ELSE 30 END;
    IF p_action='logout' THEN
        DELETE FROM public.team_sessions WHERE id=v_session.id;
        RETURN jsonb_build_object('status',200,'success',true);
    ELSIF p_action='context' THEN
        SELECT transfer_window_open INTO v_window FROM public.organizations WHERE id=v_team.organization_id;
        RETURN jsonb_build_object('status',200,'team',jsonb_build_object('id',v_team.id,'name',v_team.name),
            'transfer_window_open',coalesce(v_window,false));
    ELSIF p_action='teams' THEN
        SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) INTO v_items FROM (
            SELECT t.id,t.name,t.logo_url,
                (SELECT count(*) FROM public.applications a WHERE a.team_id=t.id AND a.status='approved') AS player_count
            FROM public.teams t
            WHERE t.organization_id=v_team.organization_id AND t.id<>v_team.id
                AND coalesce(t.is_archived,false)=false AND (p_after IS NULL OR t.id>p_after)
            ORDER BY t.id LIMIT v_limit+1
        ) r;
    ELSIF p_action IN ('players','team_players') THEN
        IF p_action='team_players' THEN
            IF p_team_id IS NULL THEN RETURN jsonb_build_object('status',400,'error','Select a team'); END IF;
            SELECT * INTO v_target FROM public.teams WHERE id=p_team_id;
            IF NOT FOUND OR v_target.organization_id IS DISTINCT FROM v_team.organization_id OR v_target.id=v_team.id
               OR coalesce(v_target.is_archived,false) THEN
                RETURN jsonb_build_object('status',403,'error','Team is not available');
            END IF;
        END IF;
        IF coalesce(length(btrim(p_query)),0)>0 AND length(btrim(p_query)) NOT BETWEEN 2 AND 80 THEN
            RETURN jsonb_build_object('status',400,'error','Enter 2-80 characters');
        END IF;
        v_pattern:=replace(replace(replace(lower(btrim(coalesce(p_query,''))),chr(92),chr(92)||chr(92)),
            '%',chr(92)||'%'),'_',chr(92)||'_')||'%';
        SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) INTO v_items FROM (
            SELECT a.id,a.first_name,a.last_name,a.photo_url,a.player_number,a.position,t.name AS team_name,
                EXISTS (SELECT 1 FROM public.transfers tr WHERE tr.player_id=a.id AND tr.status='pending') AS has_pending
            FROM public.applications a JOIN public.teams t ON t.id=a.team_id
            WHERE t.organization_id=v_team.organization_id AND t.id<>v_team.id AND a.status='approved'
                AND (p_action='players' OR t.id=p_team_id) AND (p_after IS NULL OR a.id>p_after)
                AND (coalesce(p_query,'')='' OR lower(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')) LIKE v_pattern
                     OR lower(coalesce(a.last_name,'')) LIKE v_pattern)
            ORDER BY a.id LIMIT v_limit+1
        ) r;
    ELSIF p_action='history' THEN
        IF p_after IS NOT NULL THEN
            SELECT created_at INTO v_after_time FROM public.transfers
            WHERE id=p_after AND requested_by_team_id=v_team.id AND organization_id=v_team.organization_id;
            IF NOT FOUND THEN RETURN jsonb_build_object('status',400,'error','Invalid cursor'); END IF;
        END IF;
        SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_items FROM (
            SELECT id,player_name,old_team_name,status,created_at,reason
            FROM public.transfers WHERE requested_by_team_id=v_team.id AND organization_id=v_team.organization_id
                AND (p_after IS NULL OR (created_at,id)<(v_after_time,p_after))
            ORDER BY created_at DESC,id DESC LIMIT v_limit+1
        ) r;
    ELSE RETURN jsonb_build_object('status',400,'error','Invalid action');
    END IF;
    RETURN jsonb_build_object('status',200,'items',
        CASE WHEN jsonb_array_length(v_items)>v_limit THEN v_items-v_limit ELSE v_items END,
        'next_cursor',CASE WHEN jsonb_array_length(v_items)>v_limit
             THEN v_items->(v_limit-1)->>'id' ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.team_transfer_page(text,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.team_transfer_page(text,text,text,uuid,uuid) TO service_role;
COMMIT;
