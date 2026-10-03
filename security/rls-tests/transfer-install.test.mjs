import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('atomic transfer installation provides scoped admin page and preserves context',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   INSERT INTO auth.users VALUES('11111111-1111-4111-8111-111111111111','owner@test.invalid',now());
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
   CREATE TABLE organizations(id bigint PRIMARY KEY,admin_email text,transfer_window_open boolean,contact_phone text);
   INSERT INTO organizations VALUES(1,'owner@test.invalid',true,'+998000000000');
   CREATE TABLE teams(id uuid PRIMARY KEY,organization_id bigint,name text,league text,is_archived boolean);
   INSERT INTO teams VALUES('22222222-2222-4222-8222-222222222222',1,'Own team','Test league',false);
   CREATE TABLE transfers(id serial PRIMARY KEY,old_team_id uuid,new_team_id uuid,organization_id bigint,status text);
   CREATE FUNCTION team_transfer_page(p_token_hash text,p_action text,p_query text,p_after uuid,p_team_id uuid)
   RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE v_team teams%ROWTYPE;v_window boolean:=true; BEGIN
   SELECT * INTO v_team FROM teams WHERE id=p_team_id;
   RETURN jsonb_build_object('retained','player details','transfer_window_open',coalesce(v_window,false)); END $$;
   CREATE FUNCTION request_team_transfer(p_token_hash text,p_player_id uuid,p_reason text,p_team_id uuid)
   RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE v_team teams%ROWTYPE; BEGIN
   SELECT * INTO v_team FROM teams WHERE id=p_team_id;
   INSERT INTO public.transfers(new_team_id,organization_id,status) VALUES(v_team.id,1,'pending');
   RETURN jsonb_build_object('status',201);END $$;
   CREATE FUNCTION request_transfer_app(p_token_hash text,p_player_id uuid,p_reason text,p_team_id uuid)
   RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE v_team teams%ROWTYPE; BEGIN
   SELECT * INTO v_team FROM teams WHERE id=p_team_id;
   INSERT INTO public.transfers(new_team_id,organization_id,status) VALUES(v_team.id,1,'pending');
   RETURN jsonb_build_object('status',201);END $$;`);
  await db.exec(await readFile(new URL('../drafts/install-transfer-permissions.sql',import.meta.url),'utf8'));
  const team='22222222-2222-4222-8222-222222222222';
  await db.exec('SET ROLE authenticated');
  const page=(await db.query('SELECT admin_team_transfer_access_page(1) AS result')).rows[0].result;
  assert.equal(page.items[0].id,team);assert.deepEqual(page.leagues,['Test league']);
  await assert.rejects(db.query('SELECT admin_team_transfer_access_page(2)'),{code:'42501'});
  await db.query('SELECT admin_set_team_transfer_access(1,$1,false)',[team]);
  await db.exec('RESET ROLE');
  const context=(await db.query("SELECT team_transfer_page('token','context','',NULL,$1) AS result",[team])).rows[0].result;
  assert.equal(context.retained,'player details');assert.equal(context.team_transfer_allowed,false);
  assert.equal(context.organization_contact_phone,'+998000000000');
  for(const name of ['request_team_transfer','request_transfer_app']){
   const result=(await db.query(`SELECT ${name}('token',NULL,'reason',$1) AS result`,[team])).rows[0].result;
   assert.equal(result.status,403);assert.equal(result.code,'TEAM_TRANSFER_PAYMENT_REQUIRED');
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM transfers')).rows[0].n,0);
 }finally{await db.close();}
});
