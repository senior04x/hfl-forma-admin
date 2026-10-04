-- DRAFT ONLY: deploy with team-only workflow, Telegram callbacks and clients.
-- No backfill or historical replay. Keep queue claims, reservations and retry functions.
BEGIN;
CREATE OR REPLACE FUNCTION public.enqueue_transfer_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
$$;
COMMIT;
