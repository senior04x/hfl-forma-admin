import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('closed registration blocks public inserts without changing admin updates or existing records',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
   CREATE TABLE organizations(id bigint PRIMARY KEY,is_registration_open boolean);
   INSERT INTO organizations VALUES(1,false),(2,true),(3,null);
   CREATE TABLE applications(id int PRIMARY KEY,organization_id bigint);
   CREATE TABLE teams(id int PRIMARY KEY,organization_id bigint);
   INSERT INTO applications VALUES(1,1);INSERT INTO teams VALUES(1,1);
   GRANT USAGE ON SCHEMA public TO anon,authenticated;
   GRANT INSERT,SELECT,UPDATE ON applications,teams TO anon,authenticated;`);
  await db.exec(await readFile(new URL('../drafts/registration-closed-guard.sql',import.meta.url),'utf8'));
  await db.exec('SET ROLE anon');
  for(const table of ['applications','teams']){
   for(const org of [1,3,999,null])await assert.rejects(db.query(`INSERT INTO ${table} VALUES(2,$1)`,[org]),e=>e.code==='42501'&&e.message==='REGISTRATION_CLOSED');
   await db.query(`INSERT INTO ${table} VALUES(2,2)`);
  }
  await db.exec('RESET ROLE;SET ROLE authenticated');
  await db.exec('INSERT INTO applications VALUES(3,1); UPDATE applications SET organization_id=1 WHERE id=1;');
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int n FROM applications')).rows[0].n,3);
  assert.equal((await db.query('SELECT count(*)::int n FROM teams')).rows[0].n,2);
 }finally{await db.close();}
});
