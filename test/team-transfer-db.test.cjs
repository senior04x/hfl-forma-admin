const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = n => 'sha256:' + String(n).repeat(64);

test('atomic captain OTP and transfer creation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
      CREATE TABLE organizations(id bigint PRIMARY KEY, transfer_window_open boolean);
      CREATE TABLE teams(id uuid PRIMARY KEY, name text, logo_url text, organization_id bigint, captain_phone text);
      CREATE TABLE applications(id uuid PRIMARY KEY, team_id uuid, first_name text, last_name text, photo_url text);
      CREATE TABLE otp_codes(phone text PRIMARY KEY, code text, expires_at timestamptz, is_used boolean,
        attempts integer DEFAULT 0, created_at timestamptz DEFAULT now());
      CREATE TABLE team_sessions(id uuid DEFAULT gen_random_uuid(), token text UNIQUE, phone text,
        team_id uuid, expires_at timestamptz);
      CREATE TABLE transfers(id uuid DEFAULT gen_random_uuid(), player_id uuid, old_team_id uuid,
        old_team_name text, old_team_logo text, new_team_id uuid, new_team_name text, new_team_logo text,
        player_name text, player_photo text, reason text, status text, player_confirmed boolean,
        requested_by_team_id uuid, organization_id bigint);
      INSERT INTO organizations VALUES (7,true),(8,true);
      INSERT INTO teams VALUES ('${id(1)}','New','new.png',7,'+998 90 123 45 67'),
        ('${id(2)}','Old','old.png',7,'901111111'), ('${id(3)}','Foreign','foreign.png',8,'902222222');
      INSERT INTO applications VALUES ('${id(4)}','${id(2)}','Ali','Vali','photo.png'),
        ('${id(5)}','${id(3)}','Other','Player','other.png');
    `);
    for (const file of ['20260922_enforce_player_confirmation.sql', '20260923_atomic_team_transfers.sql']) {
      await db.exec(readFileSync(resolve(__dirname, '../migrations', file), 'utf8'));
    }
    const issue = () => db.exec(`INSERT INTO otp_codes(phone,code,expires_at,is_used)
      VALUES ('901234567','1234',clock_timestamp()+interval '10 minutes',false)
      ON CONFLICT(phone) DO UPDATE SET code='1234',expires_at=excluded.expires_at,is_used=false`);
    const verify = async (code, token = hash(1), team = null) => (await db.query(
      'SELECT verify_team_transfer_otp($1,$2,$3,$4) AS result', ['901234567',code,token,team])).rows[0].result;
    const request = async (player = id(4), token = hash(1), team = null) => (await db.query(
      'SELECT request_team_transfer($1,$2,$3,$4) AS result', [token,player,' Join us ',team])).rows[0].result;
    await issue();
    const failures = await Promise.all(Array.from({length: 5}, () => verify('0000')));
    assert.deepEqual(failures.map(r=>r.status), [401,401,401,401,429]);
    assert.equal((await verify('1234')).status,429);
    assert.equal((await db.query('SELECT is_used FROM otp_codes')).rows[0].is_used,true);
    await issue();
    assert.equal((await db.query('SELECT attempts FROM otp_codes')).rows[0].attempts,0);
    assert.equal((await verify('1234',hash(1),id(2))).status,403);
    const logins = await Promise.all([verify('1234'),verify('1234',hash(2))]);
    assert.deepEqual(logins.map(r=>r.status),[200,401]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM team_sessions')).rows[0].n,1);
    assert.equal((await request(id(4),hash(9))).status,401);
    assert.equal((await request(id(4),hash(1),id(2))).status,403);
    assert.equal((await request(id(5))).status,403);
    await db.exec('UPDATE organizations SET transfer_window_open=false WHERE id=7');
    assert.equal((await request()).status,403);
    await db.exec('UPDATE organizations SET transfer_window_open=true WHERE id=7');
    await db.exec(`UPDATE teams SET captain_phone='909999999' WHERE id='${id(1)}'`);
    assert.equal((await request()).status,403);
    await db.exec(`UPDATE teams SET captain_phone='901234567' WHERE id='${id(1)}'`);
    const requests = await Promise.all([request(),request()]);
    assert.deepEqual(requests.map(r=>r.status),[201,409]);
    const transfer = requests[0].transfer;
    assert.equal(transfer.organization_id,7);
    assert.equal(transfer.old_team_id,id(2));
    assert.equal(transfer.requested_by_team_id,id(1));
    assert.equal(transfer.player_confirmed,false);
    assert.equal(transfer.player_photo,'photo.png');
    assert.equal(transfer.reason,'Join us');
    await db.exec("UPDATE team_sessions SET expires_at=now()-interval '1 second'");
    assert.equal((await request()).status,401);
    await issue();
    await db.exec(`INSERT INTO teams VALUES ('${id(6)}','Second','',7,'901234567')`);
    assert.equal((await verify('1234',hash(3))).status,409);
    assert.equal((await verify('1234',hash(3),id(6))).status,200);
    await issue();
    // A failed session insert must roll back OTP consumption, enabling retry.
    await assert.rejects(verify('1234',hash(3),id(6)), /duplicate key/);
    assert.equal((await verify('1234',hash(4),id(6))).status,200);
    await db.exec('SET ROLE anon');
    await assert.rejects(verify('1234'), /permission denied/);
    await assert.rejects(request(), /permission denied/);
  } finally { await db.close(); }
});
