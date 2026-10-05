import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const load = name => readFile(new URL(`../drafts/${name}.sql`, import.meta.url), 'utf8');
const edit = await load('pending-transfer-captain-edit-target');
const notices = await load('pending-transfer-captain-notices');

test('pending captain backfill is idempotent and only known delivered messages can be upgraded', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE teams(id uuid PRIMARY KEY,organization_id bigint,telegram_chat_id text);
      CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid,old_team_id uuid,new_team_id uuid,
        status text,app_consent_required boolean,organization_id bigint,new_team_name text,player_name text,old_team_name text);
      CREATE TABLE transfer_consents(transfer_id uuid,party text,subject_id uuid,decision text);
      CREATE TABLE transfer_notifications(id bigserial PRIMARY KEY,transfer_id uuid,player_id uuid,event text,
        team_name text,recipient_type text,app_consent_required boolean,player_name text,old_team_name text,
        state text DEFAULT 'pending',available_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),
        failure_code text,claim_token uuid,claimed_at timestamptz,resolved_chat_id text,message_id bigint,
        UNIQUE(transfer_id,event,recipient_type));
      INSERT INTO teams VALUES('${id(1)}',1,'123'),('${id(2)}',1,NULL);
      INSERT INTO transfers(id,player_id,old_team_id,new_team_id,status,app_consent_required,organization_id)
      VALUES('${id(10)}','${id(90)}','${id(1)}','${id(2)}','pending',true,1),
        ('${id(11)}','${id(91)}','${id(2)}','${id(1)}','pending',true,1),
        ('${id(12)}','${id(92)}','${id(1)}','${id(2)}','approved',true,1),
        ('${id(13)}','${id(93)}','${id(1)}','${id(2)}','pending',true,1),
        ('${id(14)}','${id(94)}','${id(1)}','${id(2)}','pending',true,1);
      INSERT INTO transfer_consents VALUES('${id(13)}','old_team','${id(1)}','approved');
      INSERT INTO transfer_notifications(transfer_id,event,recipient_type,state,resolved_chat_id,message_id)
      VALUES('${id(10)}','pending','player','sent','123',50),
        ('${id(14)}','pending','old_team','uncertain','123',51);
      INSERT INTO transfer_notifications(transfer_id,event,recipient_type,state,failure_code)
      VALUES('${id(10)}','pending','old_team','failed','duplicate_private_chat');`);
    const sentBefore = (await db.query("SELECT * FROM transfer_notifications WHERE state='sent'")).rows;
    await db.exec(edit);
    await db.exec(notices);
    await db.exec(notices);
    const rows = (await db.query('SELECT transfer_id,state FROM transfer_notifications WHERE recipient_type=\'old_team\' ORDER BY transfer_id')).rows;
    assert.deepEqual(rows, [
      { transfer_id: id(10), state: 'pending' },
      { transfer_id: id(11), state: 'pending' },
      { transfer_id: id(14), state: 'uncertain' },
    ]);
    assert.deepEqual((await db.query("SELECT * FROM transfer_notifications WHERE state='sent'")).rows, sentBefore);
    const [{ id: jobId }] = (await db.query(`SELECT id FROM transfer_notifications WHERE transfer_id='${id(10)}' AND recipient_type='old_team'`)).rows;
    await db.exec(`UPDATE transfer_notifications SET state='processing',claim_token='${id(80)}' WHERE id=${jobId}`);
    const target = async (claim = id(80), chat = '123') => (await db.query(
      'SELECT public.transfer_notification_captain_edit_target($1,$2,$3) target', [jobId, claim, chat])).rows[0].target;
    assert.equal(await target(), 50);
    assert.equal(await target(id(81)), null);
    assert.equal(await target(id(80), '999'), null);
    await db.exec("UPDATE transfer_notifications SET state='uncertain' WHERE recipient_type='player'");
    assert.equal(await target(), null);
    await db.exec("UPDATE transfer_notifications SET state='sent' WHERE recipient_type='player'");
    await db.exec(`UPDATE transfers SET status='approved' WHERE id='${id(10)}'`);
    assert.equal(await target(), null);
    await db.exec(`UPDATE transfers SET status='pending' WHERE id='${id(10)}';
      INSERT INTO transfer_consents VALUES('${id(10)}','old_team','${id(1)}','rejected')`);
    assert.equal(await target(), null);
  } finally { await db.close(); }
});
