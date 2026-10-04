import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const oldTeam = id(100), newTeam = id(101), player = id(102);
const migration = await readFile(new URL('../drafts/two-team-transfer-pending.sql', import.meta.url), 'utf8');
const load = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
    CREATE FUNCTION get_user_org_id() RETURNS bigint LANGUAGE sql AS $$ SELECT NULL::bigint $$;
    CREATE TABLE teams(id uuid PRIMARY KEY, organization_id bigint, captain_phone text);
    CREATE TABLE team_sessions(token text PRIMARY KEY,team_id uuid,phone text,expires_at timestamptz);
    CREATE FUNCTION transfer_phone(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
    CREATE TABLE applications(id uuid PRIMARY KEY);
    CREATE TABLE player_career_history(id uuid PRIMARY KEY);
    CREATE TABLE transfers(id uuid PRIMARY KEY, player_id uuid,old_team_id uuid,new_team_id uuid,
      requested_by_team_id uuid,organization_id bigint,status text,app_consent_required boolean,
      player_confirmed boolean DEFAULT false, new_team_name text, old_team_name text,player_name text);
    CREATE TABLE transfer_consents(transfer_id uuid,party text,subject_id uuid,decision text,
      decided_at timestamptz DEFAULT clock_timestamp(),PRIMARY KEY(transfer_id,party));
    INSERT INTO applications VALUES('${player}');
    INSERT INTO teams VALUES('${oldTeam}',1,'901234567'),('${newTeam}',1,'901234568');
  `);
  // Actual cancellation and membership guards; migration never replaces them.
  const cancellations = await load('20261001000900_cancel_mobile_transfer.sql');
  await db.exec(cancellations.slice(0, cancellations.indexOf('CREATE OR REPLACE FUNCTION public.transfer_app_page')) + 'COMMIT;');
  await db.exec(`CREATE TRIGGER guard_team_transfer_decision BEFORE INSERT OR UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION guard_team_transfer_decision();
    CREATE TRIGGER z_apply_transfer_membership BEFORE INSERT OR UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION apply_transfer_membership();`);
  await db.exec(await load('20260925000100_transfer_notifications.sql'));
  await db.exec(await load('20261001000500_transfer_app_notifications.sql'));
  const consent = await load('20261001000100_three_party_transfer_consent.sql');
  const start = consent.indexOf('CREATE FUNCTION public.validate_transfer_consent_subject()');
  await db.exec(consent.slice(start, consent.indexOf('-- Only mobile requests', start)));
  await db.exec(await readFile(new URL('../drafts/two-team-transfer-consent.sql', import.meta.url), 'utf8'));
  await db.exec(`CREATE TRIGGER enforce_three_party_transfer_consent BEFORE UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION enforce_three_party_transfer_consent();`);
  // Seed history without executing INSERT guards that intentionally forbid it.
  await db.exec(`ALTER TABLE transfers DISABLE TRIGGER USER;
    INSERT INTO transfers(id,player_id,old_team_id,new_team_id,requested_by_team_id,organization_id,status,app_consent_required)
    VALUES
      ('${id(1)}','${player}','${oldTeam}','${newTeam}','${newTeam}',1,'pending',false),
      ('${id(2)}','${player}','${oldTeam}','${newTeam}','${oldTeam}',1,'pending',false),
      ('${id(3)}','${player}','${oldTeam}','${newTeam}',NULL,1,'pending',false),
      ('${id(4)}','${player}','${oldTeam}','${newTeam}','${newTeam}',1,'pending',true),
      ('${id(5)}','${player}','${oldTeam}','${newTeam}','${newTeam}',1,'approved',false),
      ('${id(6)}','${player}','${oldTeam}','${newTeam}','${newTeam}',1,'rejected',true),
      ('${id(7)}','${player}','${oldTeam}','${newTeam}','${newTeam}',1,'pending',true),
      ('${id(8)}','${player}',NULL,'${newTeam}','${newTeam}',1,'pending',false);
    ALTER TABLE transfers ENABLE TRIGGER USER;
    INSERT INTO transfer_consents(transfer_id,party,subject_id,decision) VALUES
      ('${id(4)}','player','${player}','rejected'),
      ('${id(7)}','new_team','${newTeam}','rejected');
    INSERT INTO transfer_notifications(transfer_id,player_id,event,team_name,state,recipient_type,resolved_chat_id)
      SELECT '${id(1)}','${player}','pending','Team',s,'old_team',NULL
      FROM (VALUES('sent')) AS states(s);
    INSERT INTO transfer_notifications(transfer_id,player_id,event,team_name,state,recipient_type,resolved_chat_id)
      VALUES ('${id(2)}','${player}','pending','Team','uncertain','old_team','123'),
        ('${id(4)}','${player}','pending','Team','processing','old_team','124'),
        ('${id(3)}','${player}','pending','Team','pending','player',NULL);
  `);
  return db;
}

const snapshot = async db => ({
  transfers: (await db.query('SELECT * FROM transfers ORDER BY id')).rows,
  consents: (await db.query('SELECT * FROM transfer_consents ORDER BY transfer_id,party')).rows,
  queue: (await db.query('SELECT * FROM transfer_notifications ORDER BY id')).rows,
  triggers: (await db.query(`SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definition
    FROM pg_trigger WHERE tgrelid='transfers'::regclass ORDER BY tgname`)).rows,
  guards: (await db.query(`SELECT proname,pg_get_functiondef(oid) AS definition
    FROM pg_proc WHERE proname IN ('guard_team_transfer_decision','apply_transfer_membership',
      'enforce_three_party_transfer_consent','enqueue_transfer_notification','cancel_transfer_app')
    ORDER BY proname`)).rows,
});

test('pending migration preserves history, guards and queue; safely repeatable', async () => {
  const db = await fixture();
  try {
    const before = await snapshot(db);
    await db.exec(migration);
    const after = await snapshot(db);
    assert.deepEqual(after.queue, before.queue);
    assert.deepEqual(after.triggers, before.triggers);
    assert.deepEqual(after.guards, before.guards);
    assert.deepEqual(after.transfers.filter(r => r.status !== 'pending'), before.transfers.filter(r => r.status !== 'pending'));
    for (const row of after.transfers.filter(r => r.status === 'pending')) {
      assert.equal(row.app_consent_required, true);
      const original = before.transfers.find(r => r.id === row.id);
      assert.deepEqual({...row, app_consent_required: original.app_consent_required}, original);
    }
    assert.deepEqual(after.consents.filter(r => r.party === 'new_team').map(r => [r.transfer_id,r.decision]),
      [[id(1),'approved'],[id(4),'approved'],[id(7),'rejected']]);
    assert.equal(after.consents.some(r => r.party === 'old_team'), false);
    for (const original of before.consents) assert.deepEqual(after.consents.find(r => r.transfer_id === original.transfer_id && r.party === original.party), original);
    await db.exec(migration);
    assert.deepEqual(await snapshot(db), after);
    await assert.rejects(db.exec(`UPDATE transfers SET app_consent_required=false WHERE id='${id(1)}'`), e => e.code === '23514');
    await assert.rejects(db.exec(`UPDATE transfers SET status='approved' WHERE id='${id(1)}'`), e => e.code === '23514');
    await assert.rejects(db.exec(`UPDATE transfers SET new_team_id='${oldTeam}' WHERE id='${id(1)}'`), /participants cannot be changed/);
  } finally { await db.close(); }
});

test('failure after conversion rolls back data and disabled trigger', async () => {
  const db = await fixture();
  try {
    await db.exec(`CREATE FUNCTION fail_backfill() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Injected backfill failure'; END $$;
      CREATE TRIGGER fail_backfill BEFORE INSERT ON transfer_consents FOR EACH ROW EXECUTE FUNCTION fail_backfill();`);
    const before = await snapshot(db);
    await assert.rejects(db.exec(migration), /Injected backfill failure/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});

test('preflight refuses an already disabled workflow guard', async () => {
  const db = await fixture();
  try {
    await db.exec('ALTER TABLE transfers DISABLE TRIGGER enforce_three_party_transfer_consent');
    const before = await snapshot(db);
    await assert.rejects(db.exec(migration), /Expected enabled transfer workflow guard is missing/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});

test('converted receiving-team request retains authorized cancellation', async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    const token = `sha256:${'a'.repeat(64)}`;
    await db.exec(`INSERT INTO team_sessions VALUES('${token}','${newTeam}','901234568',clock_timestamp()+interval '1 hour')`);
    const cancel = async () => (await db.query('SELECT cancel_transfer_app($1,$2) AS result', [token,id(1)])).rows[0].result;
    assert.equal((await cancel()).status, 200);
    assert.equal((await db.query('SELECT status FROM transfers WHERE id=$1', [id(1)])).rows[0].status, 'rejected');
    assert.equal((await cancel()).already_cancelled, true);
  } finally { await db.close(); }
});
