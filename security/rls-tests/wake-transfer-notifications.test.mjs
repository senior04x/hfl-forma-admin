import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const load = path => readFile(new URL(path, import.meta.url), 'utf8');

test('verified captain link wakes only its delayed old-team requests and closes the claim race', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE applications(id uuid PRIMARY KEY);
      CREATE TABLE teams(id uuid PRIMARY KEY,telegram_chat_id text);
      CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid,requested_by_team_id uuid,
        old_team_id uuid,new_team_id uuid,status text,app_consent_required boolean,
        player_name text,new_team_name text,old_team_name text);
      INSERT INTO applications VALUES('${id(100)}');
      INSERT INTO teams VALUES('${id(101)}',NULL),('${id(102)}',NULL),('${id(103)}',NULL);`);
    await db.exec(await load('../../supabase/migrations/20260925000100_transfer_notifications.sql'));
    await db.exec(await load('../../supabase/migrations/20261001000500_transfer_app_notifications.sql'));
    await db.exec(await load('../../supabase/migrations/20261006000100_wake_pending_transfer_notifications.sql'));

    const insertTransfer = n => db.exec(`INSERT INTO transfers VALUES
      ('${id(n)}','${id(100)}','${id(200)}','${id(101)}','${id(102)}','pending',true,'Player','New','Old')`);
    await insertTransfer(1);
    await db.exec("UPDATE transfer_notifications SET available_at=clock_timestamp()+interval '1 hour'");

    assert.equal((await db.query("SELECT wake_pending_transfer_notifications('123') AS count")).rows[0].count, 0);
    await db.exec(`UPDATE teams SET telegram_chat_id='123' WHERE id='${id(101)}'`);
    assert.equal((await db.query("SELECT wake_pending_transfer_notifications('123') AS count")).rows[0].count, 1);
    assert.equal((await db.query("SELECT wake_pending_transfer_notifications('123') AS count")).rows[0].count, 0);
    assert.deepEqual((await db.query(`SELECT recipient_type,available_at<=clock_timestamp() AS due
      FROM transfer_notifications WHERE transfer_id='${id(1)}' ORDER BY recipient_type`)).rows,
      [{ recipient_type: 'new_team', due: false }, { recipient_type: 'old_team', due: true }, { recipient_type: 'player', due: false }]);

    await insertTransfer(2);
    const [{ id: jobId }] = (await db.query(`SELECT id FROM transfer_notifications
      WHERE transfer_id='${id(2)}' AND recipient_type='old_team'`)).rows;
    const claim = '11111111-1111-1111-1111-111111111111';
    await db.exec(`UPDATE transfer_notifications SET state='processing',claim_token='${claim}' WHERE id=${jobId}`);
    await db.exec(`UPDATE teams SET telegram_chat_id='456' WHERE id='${id(103)}'`);
    await db.exec(`UPDATE transfers SET old_team_id='${id(103)}' WHERE id='${id(2)}'`);
    const finished = (await db.query(`SELECT finish_transfer_notification(${jobId},'${claim}','pending',NULL,'no_private_chat',3600) AS result`)).rows[0].result;
    assert.equal(finished, true);
    assert.equal((await db.query(`SELECT available_at<=clock_timestamp() AS due FROM transfer_notifications WHERE id=${jobId}`)).rows[0].due, true);

    await db.exec(`UPDATE transfer_notifications SET state='sent',available_at=clock_timestamp()+interval '1 hour'
      WHERE transfer_id='${id(1)}' AND recipient_type='old_team'`);
    assert.equal((await db.query("SELECT wake_pending_transfer_notifications('123') AS count")).rows[0].count, 0);
  } finally { await db.close(); }
});
