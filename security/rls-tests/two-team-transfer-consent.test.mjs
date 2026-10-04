import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('approval requires both matching teams; historical player rejection is irrelevant', async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE transfers(id int PRIMARY KEY,old_team_id int,new_team_id int,
    app_consent_required boolean,status text);
   CREATE TABLE transfer_consents(transfer_id int,party text,subject_id int,decision text);
   CREATE FUNCTION enforce_three_party_transfer_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
   CREATE TRIGGER enforce_three_party_transfer_consent BEFORE UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION enforce_three_party_transfer_consent();
   INSERT INTO transfers VALUES(1,10,20,true,'pending'),(2,10,20,false,'approved');`);
  await db.exec(await readFile(new URL('../drafts/two-team-transfer-consent.sql',import.meta.url),'utf8'));
  const approve=()=>db.exec("UPDATE transfers SET status='approved' WHERE id=1");
  await assert.rejects(approve(),e=>e.code==='23514');
  await db.exec("INSERT INTO transfer_consents VALUES(1,'new_team',20,'approved'),(1,'old_team',999,'approved'),(1,'player',30,'rejected')");
  await assert.rejects(approve(),e=>e.code==='23514');
  await db.exec("UPDATE transfer_consents SET subject_id=10,decision='rejected' WHERE party='old_team'");
  await assert.rejects(approve(),e=>e.code==='23514');
  await db.exec("UPDATE transfer_consents SET decision='approved' WHERE party='old_team'");
  await approve();
  await assert.rejects(db.exec('UPDATE transfers SET app_consent_required=false WHERE id=1'),e=>e.code==='23514');
  assert.deepEqual((await db.query('SELECT id,status,app_consent_required FROM transfers ORDER BY id')).rows,
   [{id:1,status:'approved',app_consent_required:true},{id:2,status:'approved',app_consent_required:false}]);
 }finally{await db.close();}
});
