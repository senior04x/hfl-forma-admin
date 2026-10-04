import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ids = [1, 2, 3, 4, 5].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
const [transfer, oldTeam, newTeam, player, outsider] = ids;
const token = `sha256:${'a'.repeat(64)}`;
const otherToken = `sha256:${'b'.repeat(64)}`;

test('two-team decision RPC: local authorization, immutable decisions and readiness', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE transfers(id uuid PRIMARY KEY, old_team_id uuid, new_team_id uuid,
        player_id uuid, app_consent_required boolean, status text, player_confirmed boolean);
      CREATE TABLE teams(id uuid PRIMARY KEY, captain_phone text);
      CREATE TABLE team_sessions(token text PRIMARY KEY, team_id uuid, phone text, expires_at timestamptz);
      CREATE TABLE transfer_consents(transfer_id uuid, party text, subject_id uuid,
        decision text, decided_at timestamptz DEFAULT clock_timestamp(), PRIMARY KEY(transfer_id,party));
      CREATE FUNCTION transfer_phone(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
      CREATE TABLE status_events(status text);
      CREATE FUNCTION capture_status_event() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.status IS DISTINCT FROM OLD.status THEN INSERT INTO status_events VALUES(NEW.status); END IF; RETURN NEW; END $$;
      CREATE TRIGGER capture_status_event AFTER UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION capture_status_event();
      INSERT INTO teams VALUES('${oldTeam}','901234567'),('${newTeam}','901234568'),('${outsider}','901234569');
      INSERT INTO team_sessions VALUES('${token}','${oldTeam}','901234567',clock_timestamp()+interval '1 hour'),
        ('${otherToken}','${outsider}','901234569',clock_timestamp()+interval '1 hour');
    `);
    // Exercise the existing subject/immutability trigger, not a test replacement.
    const baseline = await readFile(new URL('../../supabase/migrations/20261001000100_three_party_transfer_consent.sql', import.meta.url), 'utf8');
    const start = baseline.indexOf('CREATE FUNCTION public.validate_transfer_consent_subject()');
    const end = baseline.indexOf('-- Only mobile requests', start);
    await db.exec(baseline.slice(start, end));
    await db.exec(await readFile(new URL('../drafts/two-team-transfer-consent.sql', import.meta.url), 'utf8'));
    await db.exec(`CREATE TRIGGER enforce_three_party_transfer_consent BEFORE UPDATE ON transfers
      FOR EACH ROW EXECUTE FUNCTION enforce_three_party_transfer_consent()`);
    await db.exec(await readFile(new URL('../drafts/two-team-transfer-decisions.sql', import.meta.url), 'utf8'));
    const reset = async (status = 'pending', required = true) => {
      await db.exec(`TRUNCATE transfer_consents,transfers,status_events;
        INSERT INTO transfers VALUES('${transfer}','${oldTeam}','${newTeam}','${player}',${required},'${status}',false)`);
    };
    const decide = async (party = 'old_team', decision = 'approved', session = token, id = transfer) =>
      (await db.query('SELECT record_transfer_app_consent($1,$2,$3,$4) AS result', [session, id, party, decision])).rows[0].result;

    await t.test('player decisions cannot be recorded', async () => {
      await reset();
      assert.equal((await decide('player', 'rejected')).status, 400);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM transfer_consents')).rows[0].n, 0);
    });
    await t.test('rejects invalid party, decision and token', async () => {
      for (const args of [[null], ['captain'], ['old_team', null], ['old_team', 'pending'], ['old_team', 'approved', 'bad']]) {
        assert.equal((await decide(...args)).status, 400);
      }
    });
    await t.test('rejects expired session', async () => {
      assert.equal((await decide('old_team', 'approved', `sha256:${'c'.repeat(64)}`)).status, 401);
    });
    await t.test('rejects missing transfer and wrong team or party', async () => {
      assert.equal((await decide('old_team', 'approved', token, outsider)).status, 404);
      assert.equal((await decide('old_team', 'approved', otherToken)).status, 403);
      assert.equal((await decide('new_team')).status, 403);
    });
    await t.test('rechecks current captain phone', async () => {
      await db.exec(`UPDATE teams SET captain_phone=NULL WHERE id='${oldTeam}'`);
      assert.equal((await decide()).status, 403);
      await db.exec(`UPDATE teams SET captain_phone='901234566' WHERE id='${oldTeam}'`);
      assert.equal((await decide()).status, 403);
      await db.exec(`UPDATE teams SET captain_phone='901234567' WHERE id='${oldTeam}'`);
    });
    await t.test('does not bypass legacy workflow or final status', async () => {
      await reset('pending', false);
      assert.equal((await decide()).status, 409);
      await reset('rejected');
      assert.equal((await decide()).status, 409);
      await reset('approved');
      assert.equal((await decide()).status, 409);
    });
    await t.test('one approval is insufficient', async () => {
      await reset();
      assert.equal((await decide()).ready_for_admin, false);
    });
    await t.test('both teams suffice despite historical player rejection', async () => {
      await reset();
      await db.exec(`INSERT INTO transfer_consents(transfer_id,party,subject_id,decision) VALUES
        ('${transfer}','player','${player}','rejected'),('${transfer}','new_team','${newTeam}','approved')`);
      assert.equal((await decide()).ready_for_admin, true);
      assert.equal((await db.query('SELECT player_confirmed FROM transfers')).rows[0].player_confirmed, false);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM status_events')).rows[0].n, 0);
      await db.exec("UPDATE transfers SET status='approved'");
    });
    await t.test('retries are idempotent, opposite decision is denied', async () => {
      assert.equal((await decide()).already_recorded, true);
      assert.equal((await decide('old_team', 'rejected')).status, 409);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM transfer_consents WHERE party='old_team'")).rows[0].n, 1);
    });
    await t.test('old team rejection blocks readiness and admin approval', async () => {
      await reset();
      await db.exec(`INSERT INTO transfer_consents(transfer_id,party,subject_id,decision)
        VALUES('${transfer}','new_team','${newTeam}','approved')`);
      assert.equal((await decide('old_team', 'rejected')).ready_for_admin, false);
      await assert.rejects(db.exec("UPDATE transfers SET status='approved'"), e => e.code === '23514');
    });
    await t.test('client roles cannot call the decision RPC', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(decide(), e => e.code === '42501');
        await db.exec('RESET ROLE');
      }
    });
  } finally {
    await db.close();
  }
});
