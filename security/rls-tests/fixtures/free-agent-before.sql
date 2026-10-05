-- Installed transfer functions captured before the free-agent change. No credentials.
CREATE OR REPLACE FUNCTION public.enforce_three_party_transfer_consent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    IF NEW.app_consent_required IS DISTINCT FROM OLD.app_consent_required THEN
        RAISE EXCEPTION 'Transfer workflow cannot be changed after creation' USING ERRCODE='23514';
    END IF;
    IF NEW.app_consent_required AND NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        IF NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='old_team' AND c.subject_id=NEW.old_team_id AND c.decision='approved')
        OR NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='new_team' AND c.subject_id=NEW.new_team_id AND c.decision='approved') THEN
            RAISE EXCEPTION 'Both transfer teams must consent before admin approval' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.enqueue_transfer_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_party text; v_recipients text[];
BEGIN
    IF NEW.requested_by_team_id IS NULL OR NEW.player_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status NOT IN ('pending','approved','rejected') THEN RETURN NEW; END IF;
    v_recipients:=CASE
        WHEN NEW.app_consent_required AND NEW.status='pending' THEN ARRAY['old_team','new_team']
        WHEN NEW.app_consent_required THEN ARRAY['player','old_team','new_team']
        ELSE ARRAY['player'] END;
    FOREACH v_party IN ARRAY v_recipients LOOP
        INSERT INTO public.transfer_notifications(transfer_id,player_id,event,team_name,recipient_type,app_consent_required,player_name,old_team_name)
        VALUES(NEW.id,NEW.player_id,NEW.status,coalesce(NEW.new_team_name,''),v_party,NEW.app_consent_required,
            coalesce(NEW.player_name,''),coalesce(NEW.old_team_name,'')) ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.record_transfer_app_consent(p_token_hash text, p_transfer_id uuid, p_party text, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_transfer public.transfers%ROWTYPE;
    v_team_session public.team_sessions%ROWTYPE; v_existing public.transfer_consents%ROWTYPE;
    v_subject uuid; v_current_phone text; v_expected uuid; v_ready boolean;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' OR p_transfer_id IS NULL
        OR p_party IS NULL OR p_party NOT IN ('old_team','new_team')
        OR p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
        RETURN jsonb_build_object('status',400,'error','Invalid decision');
    END IF;
    -- The actor is derived exclusively from a verified session, not caller IDs.
    SELECT * INTO v_team_session FROM public.team_sessions
    WHERE token=p_token_hash AND expires_at>clock_timestamp() FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
    v_subject:=v_team_session.team_id;
    SELECT * INTO v_transfer FROM public.transfers WHERE id=p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',404,'error','Transfer not found'); END IF;
    IF NOT v_transfer.app_consent_required THEN
        RETURN jsonb_build_object('status',409,'error','This transfer uses the existing web workflow');
    END IF;
    -- Lock transfer before participant rows, matching admin membership updates.
    SELECT public.transfer_phone(captain_phone) INTO v_current_phone
    FROM public.teams WHERE id=v_subject FOR SHARE;
    IF NOT FOUND OR v_current_phone IS NULL OR v_team_session.phone IS NULL
        OR v_current_phone IS DISTINCT FROM v_team_session.phone THEN
        RETURN jsonb_build_object('status',403,'error','Captain authorization changed');
    END IF;
    v_expected:=CASE p_party WHEN 'old_team' THEN v_transfer.old_team_id
        WHEN 'new_team' THEN v_transfer.new_team_id END;
    IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_subject THEN
        RETURN jsonb_build_object('status',403,'error','Not your transfer');
    END IF;
    SELECT * INTO v_existing FROM public.transfer_consents WHERE transfer_id=p_transfer_id AND party=p_party;
    IF FOUND THEN
        IF v_existing.subject_id=v_subject AND v_existing.decision=p_decision THEN
            RETURN jsonb_build_object('status',200,'success',true,'already_recorded',true);
        END IF;
        RETURN jsonb_build_object('status',409,'error','Decision already recorded');
    END IF;
    IF v_transfer.status IS DISTINCT FROM 'pending' THEN
        RETURN jsonb_build_object('status',409,'error','Transfer already decided');
    END IF;
    INSERT INTO public.transfer_consents(transfer_id,party,subject_id,decision)
    VALUES(p_transfer_id,p_party,v_subject,p_decision);
    -- Invalidate scoped admin subscriptions without changing status or sending messages.
    -- Retain player_confirmed only as legacy data; it no longer affects readiness.
    UPDATE public.transfers SET player_confirmed=player_confirmed WHERE id=p_transfer_id;
    SELECT EXISTS (SELECT 1 FROM public.transfer_consents
        WHERE transfer_id=p_transfer_id AND party='old_team'
            AND subject_id=v_transfer.old_team_id AND decision='approved')
        AND EXISTS (SELECT 1 FROM public.transfer_consents
        WHERE transfer_id=p_transfer_id AND party='new_team'
            AND subject_id=v_transfer.new_team_id AND decision='approved') INTO v_ready;
    RETURN jsonb_build_object('status',200,'success',true,'already_recorded',false,'ready_for_admin',v_ready);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.record_transfer_telegram_consent(p_chat_id text, p_user_id text, p_transfer_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_transfer public.transfers%ROWTYPE; v_team public.teams%ROWTYPE;
    v_contact public.transfer_telegram_contacts%ROWTYPE;
    v_existing public.transfer_consents%ROWTYPE; v_phone text; v_ready boolean;
BEGIN
    IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$'
        OR p_user_id IS DISTINCT FROM p_chat_id OR p_transfer_id IS NULL
        OR p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
        RETURN jsonb_build_object('status',400,'error','Invalid decision');
    END IF;
    -- Same serialization point as app consent, cancellation and admin approval.
    SELECT * INTO v_transfer FROM public.transfers WHERE id=p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',404,'error','Transfer not found'); END IF;
    IF v_transfer.app_consent_required IS DISTINCT FROM true OR v_transfer.old_team_id IS NULL THEN
        RETURN jsonb_build_object('status',409,'error','Transfer workflow unavailable');
    END IF;
    -- No team ID or phone from callback data is trusted.
    SELECT * INTO v_team FROM public.teams WHERE id=v_transfer.old_team_id FOR SHARE;
    IF NOT FOUND OR v_transfer.organization_id IS NULL
        OR v_team.organization_id IS DISTINCT FROM v_transfer.organization_id
        OR v_team.telegram_chat_id::text IS DISTINCT FROM p_chat_id THEN
        RETURN jsonb_build_object('status',403,'error','Not your transfer');
    END IF;
    SELECT * INTO v_contact FROM public.transfer_telegram_contacts WHERE chat_id=p_chat_id FOR SHARE;
    v_phone:=public.transfer_phone(v_team.captain_phone);
    IF NOT FOUND OR v_contact.user_id IS DISTINCT FROM p_user_id OR v_phone IS NULL
        OR v_contact.phone IS DISTINCT FROM v_phone THEN
        RETURN jsonb_build_object('status',403,'error','Contact verification required');
    END IF;
    SELECT * INTO v_existing FROM public.transfer_consents
    WHERE transfer_id=p_transfer_id AND party='old_team';
    IF FOUND THEN
        IF v_existing.subject_id=v_team.id AND v_existing.decision=p_decision THEN
            RETURN jsonb_build_object('status',200,'success',true,'already_recorded',true);
        END IF;
        RETURN jsonb_build_object('status',409,'error','Decision already recorded');
    END IF;
    IF v_transfer.status IS DISTINCT FROM 'pending' THEN
        RETURN jsonb_build_object('status',409,'error','Transfer already decided');
    END IF;
    INSERT INTO public.transfer_consents(transfer_id,party,subject_id,decision)
    VALUES(p_transfer_id,'old_team',v_team.id,p_decision);
    -- Scoped admin invalidation, preserving status and historical player data.
    UPDATE public.transfers SET player_confirmed=player_confirmed WHERE id=p_transfer_id;
    SELECT EXISTS (SELECT 1 FROM public.transfer_consents
        WHERE transfer_id=p_transfer_id AND party='new_team'
          AND subject_id=v_transfer.new_team_id AND decision='approved')
        AND p_decision='approved' INTO v_ready;
    RETURN jsonb_build_object('status',200,'success',true,'already_recorded',false,'ready_for_admin',v_ready);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.request_transfer_app(p_token_hash text, p_player_id uuid, p_reason text, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_session public.team_sessions%ROWTYPE;
    v_player public.applications%ROWTYPE;
    v_team public.teams%ROWTYPE;
    v_old public.teams%ROWTYPE;
    v_window boolean;
    v_transfer public.transfers%ROWTYPE;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status', 401, 'error', 'Invalid session');
    END IF;
    IF p_player_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
        RETURN jsonb_build_object('status', 400, 'error', 'Invalid request');
    END IF;
    SELECT * INTO v_session FROM public.team_sessions
    WHERE token = p_token_hash AND expires_at > clock_timestamp() FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 401, 'error', 'Invalid or expired session');
    END IF;
    IF p_team_id IS NOT NULL AND p_team_id <> v_session.team_id THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Session belongs to another team');
    END IF;
    SELECT * INTO v_team FROM public.teams WHERE id = v_session.team_id FOR SHARE;
    IF NOT FOUND OR public.transfer_phone(v_team.captain_phone) IS DISTINCT FROM v_session.phone
       OR v_team.organization_id IS NULL THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Captain authorization changed');
    END IF;
    -- Lock the player so concurrent requests see the first committed pending row.
    SELECT * INTO v_player FROM public.applications WHERE id = p_player_id FOR UPDATE;
    IF NOT FOUND OR v_player.team_id IS NULL OR v_player.team_id = v_team.id
       OR v_player.status IS DISTINCT FROM 'approved' THEN
        RETURN jsonb_build_object('status', 400, 'error', 'Player must belong to another team');
    END IF;
    SELECT * INTO v_old FROM public.teams WHERE id = v_player.team_id FOR SHARE;
    IF NOT FOUND OR v_old.organization_id IS DISTINCT FROM v_team.organization_id THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Player belongs to a different organization');
    END IF;
    SELECT transfer_window_open INTO v_window FROM public.organizations
    WHERE id = v_team.organization_id FOR SHARE;
    IF v_window IS DISTINCT FROM true THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Transfer window is closed');
    END IF;
    IF EXISTS (SELECT 1 FROM public.transfers WHERE player_id = p_player_id AND status = 'pending') THEN
        RETURN jsonb_build_object('status', 409, 'error', 'Player already has a pending transfer');
    END IF;
    IF EXISTS (SELECT 1 FROM public.team_transfer_permissions WHERE team_id=v_team.id AND allowed=false) THEN RETURN jsonb_build_object('status',403,'error','Receiving team transfer access is closed','code','TEAM_TRANSFER_PAYMENT_REQUIRED'); END IF; INSERT INTO public.transfers(player_id, old_team_id, old_team_name, old_team_logo,
        new_team_id, new_team_name, new_team_logo, player_name, player_photo, reason,
        status, player_confirmed, requested_by_team_id, organization_id, app_consent_required)
    VALUES (v_player.id, v_old.id, v_old.name, v_old.logo_url,
        v_team.id, v_team.name, v_team.logo_url,
        btrim(concat_ws(' ', v_player.first_name, v_player.last_name)), v_player.photo_url,
        btrim(p_reason), 'pending', false, v_team.id, v_team.organization_id, true)
    RETURNING * INTO v_transfer;
    INSERT INTO public.transfer_consents(transfer_id,party,subject_id,decision)
    VALUES(v_transfer.id,'new_team',v_team.id,'approved');
    RETURN jsonb_build_object('status', 201, 'success', true, 'transfer', to_jsonb(v_transfer));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.team_transfer_page(p_token_hash text, p_action text, p_query text DEFAULT ''::text, p_after uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
            'transfer_window_open',coalesce(v_window,false), 'team_transfer_allowed',coalesce((SELECT allowed FROM public.team_transfer_permissions WHERE team_id=v_team.id),true), 'organization_contact_phone',(SELECT contact_phone FROM public.organizations WHERE id=v_team.organization_id));
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
            SELECT a.id,a.first_name,a.last_name,a.photo_url,a.player_number,a.position,t.name AS team_name,t.logo_url AS team_logo,
                to_jsonb(a)->>'birth_date' AS birth_date,
                to_jsonb(a)->>'citizenship' AS citizenship,
                to_jsonb(a)->>'height' AS height,
                to_jsonb(a)->>'weight' AS weight,
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
$function$
;
CREATE OR REPLACE FUNCTION public.transfer_app_page(p_token_hash text, p_actor text, p_direction text DEFAULT 'all'::text, p_after uuid DEFAULT NULL::uuid, p_transfer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
            EXISTS(SELECT 1 FROM public.transfer_app_cancellations c WHERE c.transfer_id=tr.id) AS cancelled,
            (p_actor='captain' AND tr.requested_by_team_id=v_subject AND tr.status='pending') AS can_cancel,
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
        'next_cursor',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items->19->>'id' ELSE NULL END,
        'transfer_window_open',CASE WHEN p_actor='captain' THEN (SELECT coalesce(o.transfer_window_open,false)
            FROM public.teams tm JOIN public.organizations o ON o.id=tm.organization_id WHERE tm.id=v_subject) ELSE false END);
END;
$function$
;