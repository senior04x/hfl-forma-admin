import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const transfer = id(1), oldTeam = id(2), newTeam = id(3), player = id(4);
const load = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Telegram consent authorization and immutable two-team decisions, local only', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid,old_team_id uuid,new_team_id uuid,
        organization_id bigint,status text,app_consent_required boolean,player_confirmed boolean);
      CREATE TABLE teams(id uuid PRIMARY KEY,organization_id bigint,captain_phone text,telegram_chat_id bigint);
      CREATE TABLE transfer_consents(transfer_id uuid,party text,subject_id uuid,decision text,
        decided_at timestamptz DEFAULT clock_timestamp(),PRIMARY KEY(transfer_id,party));
      INSERT INTO teams VALUES('${oldTeam}',1,'+998 90 123 45 67',123),('${newTeam}',1,'901234568',456);
    `);
    const phone = await load('../../supabase/migrations/20260923000100_atomic_team_transfers.sql');
    await db.exec(phone.slice(phone.indexOf('CREATE OR REPLACE FUNCTION public.transfer_phone'), phone.indexOf('CREATE INDEX')));
    const consent = await load('../../supabase/migrations/20261001000100_three_party_transfer_consent.sql');
    const start = consent.indexOf('CREATE FUNCTION public.validate_transfer_consent_subject()');
    await db.exec(consent.slice(start, consent.indexOf('-- Only mobile requests', start)));
    await db.exec(await load('../drafts/two-team-transfer-consent.sql'));
    await db.exec(`CREATE TRIGGER enforce_three_party_transfer_consent BEFORE UPDATE ON transfers
      FOR EACH ROW EXECUTE FUNCTION enforce_three_party_transfer_consent()`);
    await db.exec(await load('../drafts/two-team-transfer-telegram.sql'));
    const proof = async (chat = '123', user = '123', contact = '123', phone = '901234567') =>
      (await db.query('SELECT record_transfer_telegram_contact($1,$2,$3,$4) AS result', [chat,user,contact,phone])).rows[0].result;
    const decide = async (decision = 'approved', chat = '123', user = '123', tr = transfer) =>
      (await db.query('SELECT record_transfer_telegram_consent($1,$2,$3,$4) AS result', [chat,user,tr,decision])).rows[0].result;
    const reset = async (status = 'pending', required = true) => {
      await db.exec(`TRUNCATE transfers,transfer_consents,transfer_telegram_contacts;
        UPDATE teams SET organization_id=1,captain_phone='901234567',telegram_chat_id=123 WHERE id='${oldTeam}';
        INSERT INTO transfers VALUES('${transfer}','${player}','${oldTeam}','${newTeam}',1,'${status}',${required},false)`);
    };

    await t.test('legacy chat mapping alone does not authorize a decision', async () => {
      await reset();
      assert.equal((await decide()).status, 403);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM transfer_consents')).rows[0].n, 0);
    });
    await t.test('contact RPC rejects forged ownership and invalid phones', async () => {
      for (const args of [['123','456','456'],['123','123','456'],['-123','-123','-123'],['123','123','123','bad'],[null]]) {
        assert.equal((await proof(...args)).status, 400);
      }
      assert.equal((await proof()).status, 200);
    });
    await t.test('callback must have matching private actor and valid decision', async () => {
      for (const args of [['approved','123','456'],['approved','-123','-123'],['pending'],[null],['approved',null]]) {
        assert.equal((await decide(...args)).status, 400);
      }
      assert.equal((await decide('approved','123','123',player)).status, 404);
      assert.equal((await decide('approved','456','456')).status, 403);
    });
    await t.test('current captain phone, chat and organization are rechecked', async () => {
      for (const change of ["captain_phone='901234569'", 'captain_phone=NULL', 'telegram_chat_id=789', 'organization_id=2']) {
        await reset(); await proof();
        await db.exec(`UPDATE teams SET ${change} WHERE id='${oldTeam}'`);
        assert.equal((await decide()).status, 403);
      }
    });
    await t.test('changing verified contact invalidates the previous phone proof', async () => {
      await reset(); await proof();
      await proof('123','123','123','901234569');
      assert.equal((await decide()).status, 403);
    });
    await t.test('legacy, final and cancelled-status requests reject new decisions', async () => {
      for (const [status,required] of [['pending',false],['approved',true],['rejected',true]]) {
        await reset(status,required); await proof();
        assert.equal((await decide()).status, 409);
      }
    });
    await t.test('both teams suffice; player rejection and status remain unchanged', async () => {
      await reset(); await proof();
      await db.exec(`INSERT INTO transfer_consents(transfer_id,party,subject_id,decision) VALUES
        ('${transfer}','new_team','${newTeam}','approved'),('${transfer}','player','${player}','rejected')`);
      const result = await decide();
      assert.equal(result.ready_for_admin, true);
      assert.equal(result.already_recorded, false);
      assert.deepEqual((await db.query('SELECT status,player_confirmed FROM transfers')).rows[0], {status:'pending',player_confirmed:false});
      assert.equal((await db.query("SELECT subject_id FROM transfer_consents WHERE party='old_team'")).rows[0].subject_id, oldTeam);
      await db.exec("UPDATE transfers SET status='approved'");
      assert.equal((await decide()).already_recorded, true);
      assert.equal((await decide('rejected')).status, 409);
    });
    await t.test('old team rejection blocks readiness without deciding admin status', async () => {
      await reset(); await proof();
      await db.exec(`INSERT INTO transfer_consents(transfer_id,party,subject_id,decision)
        VALUES('${transfer}','new_team','${newTeam}','approved')`);
      assert.equal((await decide('rejected')).ready_for_admin, false);
      assert.equal((await decide('rejected')).already_recorded, true);
      assert.equal((await decide()).status, 409);
      assert.equal((await db.query('SELECT status FROM transfers')).rows[0].status, 'pending');
      await assert.rejects(db.exec("UPDATE transfers SET status='approved'"), e => e.code === '23514');
    });
    await t.test('one team approval is insufficient', async () => {
      await reset(); await proof();
      assert.equal((await decide()).ready_for_admin, false);
    });
    await t.test('only service role RPC can persist proof; no direct table access', async () => {
      for (const role of ['anon','authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(proof(), e => e.code === '42501');
        await assert.rejects(decide(), e => e.code === '42501');
        await assert.rejects(db.query('SELECT * FROM transfer_telegram_contacts'), e => e.code === '42501');
        await db.exec('RESET ROLE');
      }
      await db.exec('SET ROLE service_role');
      assert.equal((await proof()).status, 200);
      assert.equal((await decide()).status, 200);
      await assert.rejects(db.query('SELECT * FROM transfer_telegram_contacts'), e => e.code === '42501');
      await db.exec('RESET ROLE');
    });
  } finally { await db.close(); }
});
