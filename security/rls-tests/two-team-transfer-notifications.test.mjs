import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const load = path => readFile(new URL(path, import.meta.url), 'utf8');

test('two-team queue events preserve history and duplicate/uncertain reservations', async t => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE applications(id uuid PRIMARY KEY);
      CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid,requested_by_team_id uuid,status text,
        app_consent_required boolean,player_name text,new_team_name text,old_team_name text);
      INSERT INTO applications VALUES('${id(100)}');`);
    await db.exec(await load('../../supabase/migrations/20260925000100_transfer_notifications.sql'));
    await db.exec(await load('../../supabase/migrations/20261001000500_transfer_app_notifications.sql'));
    const insert = async (n, required = true) => db.exec(`INSERT INTO transfers VALUES
      ('${id(n)}','${id(100)}','${id(101)}','pending',${required},'Player','New','Old')`);
    await insert(1);
    await db.exec("UPDATE transfer_notifications SET state='sent',message_id=42 WHERE recipient_type='old_team'");
    const history = (await db.query('SELECT * FROM transfer_notifications ORDER BY id')).rows;
    const deliveryFunctions = async () => (await db.query(`SELECT proname,pg_get_functiondef(oid) AS definition FROM pg_proc
      WHERE proname IN ('claim_transfer_notification','reserve_transfer_notification_chat','finish_transfer_notification') ORDER BY proname`)).rows;
    const beforeFunctions = await deliveryFunctions();
    await db.exec(await load('../drafts/two-team-transfer-notifications.sql'));
    assert.deepEqual((await db.query('SELECT * FROM transfer_notifications ORDER BY id')).rows, history);
    assert.deepEqual(await deliveryFunctions(), beforeFunctions);

    await t.test('new pending consent requests notify two teams, never player', async () => {
      await insert(2);
      assert.deepEqual((await db.query('SELECT recipient_type FROM transfer_notifications WHERE transfer_id=$1 ORDER BY recipient_type',[id(2)])).rows,
        [{recipient_type:'new_team'},{recipient_type:'old_team'}]);
    });
    await t.test('unchanged status and workflow conversion never replay historical messages', async () => {
      await db.exec(`UPDATE transfers SET app_consent_required=true,player_name='Updated' WHERE id='${id(1)}'`);
      assert.deepEqual((await db.query('SELECT * FROM transfer_notifications WHERE transfer_id=$1 ORDER BY id',[id(1)])).rows, history);
    });
    await t.test('final decision notifies player and both teams once', async () => {
      await db.exec(`UPDATE transfers SET status='approved' WHERE id='${id(2)}'`);
      await db.exec(`UPDATE transfers SET status='approved' WHERE id='${id(2)}'`);
      assert.deepEqual((await db.query("SELECT recipient_type FROM transfer_notifications WHERE transfer_id=$1 AND event='approved' ORDER BY recipient_type",[id(2)])).rows,
        [{recipient_type:'new_team'},{recipient_type:'old_team'},{recipient_type:'player'}]);
    });
    await t.test('legacy inserts retain informational player notifications', async () => {
      await insert(3,false);
      assert.deepEqual((await db.query('SELECT recipient_type FROM transfer_notifications WHERE transfer_id=$1',[id(3)])).rows,[{recipient_type:'player'}]);
    });
    // Isolate real queue functions without contacting Telegram.
    await db.exec('TRUNCATE transfer_notifications');
    await insert(4);
    const claim = async () => (await db.query('SELECT * FROM claim_transfer_notification()')).rows[0];
    const reserve = async (job, chat) => (await db.query('SELECT reserve_transfer_notification_chat($1,$2,$3) AS result',[job.id,job.claim_token,chat])).rows[0].result;
    const finish = async (job,state) => (await db.query('SELECT finish_transfer_notification($1,$2,$3) AS result',[job.id,job.claim_token,state])).rows[0].result;
    await t.test('same private chat cannot receive old/new role duplicates', async () => {
      const first = await claim();
      assert.equal(await reserve(first,'123'),true);
      assert.equal(await finish(first,'sent'),true);
      const second = await claim();
      assert.equal(await reserve(second,'123'),false);
      assert.equal(await reserve(second,'456'),true);
      await finish(second,'uncertain');
    });
    await t.test('sent and uncertain jobs are not claimed again', async () => {
      assert.equal(await claim(),undefined);
    });
    await t.test('known safe retry clears reservation; stale claim becomes uncertain', async () => {
      await insert(5);
      const first = await claim();
      await reserve(first,'789');
      await finish(first,'pending');
      assert.equal((await db.query('SELECT resolved_chat_id FROM transfer_notifications WHERE id=$1',[first.id])).rows[0].resolved_chat_id,null);
      await db.exec(`UPDATE transfer_notifications SET available_at=clock_timestamp()-interval '1 second' WHERE id=${first.id}`);
      const retry = await claim();
      assert.equal(String(retry.id),String(first.id));
      assert.notEqual(retry.claim_token,first.claim_token);
      assert.equal(await reserve(retry,'789'),true);
      assert.equal(await reserve(first,'789'),false);
      await db.exec(`UPDATE transfer_notifications SET claimed_at=clock_timestamp()-interval '10 minutes' WHERE id=${retry.id}`);
      await claim();
      assert.equal((await db.query('SELECT state FROM transfer_notifications WHERE id=$1',[retry.id])).rows[0].state,'uncertain');
    });
  } finally { await db.close(); }
});
