-- DRAFT ONLY: after requesting-team auto-consent and existing transfer access
-- guards, together with two-team gate, pending conversion, bot and clients.
-- Keep the legacy endpoint/signature; delegate to the same guarded app RPC.
-- Do not replace request_transfer_app: installed payment/permission checks stay.
BEGIN;
CREATE OR REPLACE FUNCTION public.request_team_transfer(
    p_token_hash text,p_player_id uuid,p_reason text,p_team_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT public.request_transfer_app(p_token_hash,p_player_id,p_reason,p_team_id);
$$;
REVOKE ALL ON FUNCTION public.request_team_transfer(text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_team_transfer(text,uuid,text,uuid) TO service_role;
COMMIT;
