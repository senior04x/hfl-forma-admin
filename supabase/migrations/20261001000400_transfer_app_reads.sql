BEGIN;
CREATE INDEX transfers_old_team_app_page_idx ON public.transfers(old_team_id,created_at DESC,id DESC)
WHERE app_consent_required;
CREATE INDEX transfers_new_team_app_page_idx ON public.transfers(new_team_id,created_at DESC,id DESC)
WHERE app_consent_required;
CREATE INDEX transfers_player_app_page_idx ON public.transfers(player_id,created_at DESC,id DESC)
WHERE app_consent_required;

CREATE FUNCTION public.transfer_app_page(p_token_hash text,p_actor text,
    p_direction text DEFAULT 'all',p_after uuid DEFAULT NULL,p_transfer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_player_session public.transfer_player_sessions%ROWTYPE;
    v_team_session public.team_sessions%ROWTYPE; v_subject uuid; v_phone text;
    v_after_time timestamptz; v_items jsonb;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$'
        OR p_actor IS NULL OR p_actor NOT IN ('player','captain')
        OR p_direction IS NULL OR p_direction NOT IN ('all','incoming','outgoing') THEN
        RETURN jsonb_build_object('status',400,'error','Invalid request');
    END IF;
    IF p_actor='player' THEN
        SELECT * INTO v_player_session FROM public.transfer_player_sessions
        WHERE token_hash=p_token_hash AND expires_at>clock_timestamp();
        IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
        v_subject:=v_player_session.player_id;
        SELECT public.transfer_phone(phone) INTO v_phone FROM public.applications WHERE id=v_subject;
        IF v_phone IS DISTINCT FROM v_player_session.phone THEN
            RETURN jsonb_build_object('status',403,'error','Player authorization changed');
        END IF;
    ELSE
        SELECT * INTO v_team_session FROM public.team_sessions WHERE token=p_token_hash AND expires_at>clock_timestamp();
        IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
        v_subject:=v_team_session.team_id;
        SELECT public.transfer_phone(captain_phone) INTO v_phone FROM public.teams WHERE id=v_subject;
        IF v_phone IS DISTINCT FROM v_team_session.phone THEN
            RETURN jsonb_build_object('status',403,'error','Captain authorization changed');
        END IF;
    END IF;
    IF p_after IS NOT NULL THEN
        SELECT created_at INTO v_after_time FROM public.transfers
        WHERE id=p_after AND app_consent_required AND
            ((p_actor='player' AND player_id=v_subject) OR (p_actor='captain' AND
                ((p_direction IN ('all','incoming') AND new_team_id=v_subject)
                OR (p_direction IN ('all','outgoing') AND old_team_id=v_subject))));
        IF NOT FOUND THEN RETURN jsonb_build_object('status',400,'error','Invalid cursor'); END IF;
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_items FROM (
        SELECT tr.id,tr.created_at,tr.player_id,tr.player_name,tr.player_photo,tr.old_team_id,
            tr.old_team_name,tr.old_team_logo,tr.new_team_id,tr.new_team_name,tr.new_team_logo,
            tr.reason,tr.status,tr.organization_id,tr.app_consent_required,
            CASE WHEN p_actor='player' THEN 'player' WHEN tr.old_team_id=v_subject THEN 'old_team' ELSE 'new_team' END AS actor_party,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('party',c.party,'decision',c.decision,'decided_at',c.decided_at)),'[]'::jsonb)
                FROM public.transfer_consents c WHERE c.transfer_id=tr.id
                  AND c.subject_id=CASE c.party WHEN 'player' THEN tr.player_id
                      WHEN 'old_team' THEN tr.old_team_id WHEN 'new_team' THEN tr.new_team_id END) AS consents
        FROM public.transfers tr WHERE tr.app_consent_required
            AND (p_transfer_id IS NULL OR tr.id=p_transfer_id)
            AND ((p_actor='player' AND tr.player_id=v_subject) OR (p_actor='captain' AND
                ((p_direction IN ('all','incoming') AND tr.new_team_id=v_subject)
                OR (p_direction IN ('all','outgoing') AND tr.old_team_id=v_subject))))
            AND (p_after IS NULL OR (tr.created_at,tr.id)<(v_after_time,p_after))
        ORDER BY tr.created_at DESC,tr.id DESC LIMIT 21
    ) r;
    RETURN jsonb_build_object('status',200,'items',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items-20 ELSE v_items END,
        'next_cursor',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items->19->>'id' ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_app_page(text,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_app_page(text,text,text,uuid,uuid) TO service_role;
COMMIT;
