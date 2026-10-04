-- DRAFT: public career history contains approved transfers only. No pending
-- requests, reasons, captain identities, sessions or consent details are public.
BEGIN;
CREATE INDEX IF NOT EXISTS transfers_public_player_history_idx
ON public.transfers(player_id,created_at DESC,id DESC) WHERE status='approved';
CREATE OR REPLACE FUNCTION public.public_player_transfer_history(p_player_id uuid,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_after_time timestamptz; v_items jsonb;
BEGIN
    IF p_player_id IS NULL THEN RETURN jsonb_build_object('status',400,'error','Invalid player'); END IF;
    IF p_after IS NOT NULL THEN
        SELECT created_at INTO v_after_time FROM public.transfers
        WHERE id=p_after AND player_id=p_player_id AND status='approved';
        IF NOT FOUND THEN RETURN jsonb_build_object('status',400,'error','Invalid cursor'); END IF;
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_items FROM (
        SELECT id,player_id,old_team_name,old_team_logo,new_team_name,new_team_logo,status,created_at
        FROM public.transfers WHERE player_id=p_player_id AND status='approved'
            AND (p_after IS NULL OR (created_at,id)<(v_after_time,p_after))
        ORDER BY created_at DESC,id DESC LIMIT 21
    ) r;
    RETURN jsonb_build_object('status',200,
        'items',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items-20 ELSE v_items END,
        'next_cursor',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items->19->>'id' ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.public_player_transfer_history(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.public_player_transfer_history(uuid,uuid) TO service_role;
COMMIT;
