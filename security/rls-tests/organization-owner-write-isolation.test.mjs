import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('organization owner can edit own profile but cannot change authority or another customer',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid,email text,email_confirmed_at timestamptz);
 INSERT INTO auth.users VALUES('11111111-1111-4111-8111-111111111111','owner@example.test',now());
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '11111111-1111-4111-8111-111111111111'::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE organizations(id bigint PRIMARY KEY,name text,admin_email text,transfer_window_open boolean);
 INSERT INTO organizations VALUES(1,'Own','owner@example.test',true),(2,'Other','other@example.test',true);
 ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
 GRANT ALL ON organizations TO anon,authenticated;
 CREATE POLICY "Allow authenticated manage organizations" ON organizations TO authenticated USING(true) WITH CHECK(true);
 CREATE POLICY public_read ON organizations FOR SELECT USING(true);`);
 await db.exec(await readFile(new URL('../drafts/organization-owner-write-isolation.sql',import.meta.url),'utf8'));
 await db.exec('SET ROLE authenticated');
 assert.equal((await db.query("UPDATE organizations SET name='Edited' WHERE id=1 RETURNING id")).rows.length,1);
 assert.equal((await db.query("UPDATE organizations SET name='Wrong' WHERE id=2 RETURNING id")).rows.length,0);
 await assert.rejects(db.query("UPDATE organizations SET admin_email='attacker@example.test' WHERE id=1"),{code:'42501'});
 await assert.rejects(db.query('TRUNCATE organizations'),{code:'42501'});
 await assert.rejects(db.query('DELETE FROM organizations WHERE id=1'),{code:'42501'});
 await db.exec('RESET ROLE; SET ROLE anon');
 await assert.rejects(db.query("UPDATE organizations SET name='Wrong' WHERE id=1"),{code:'42501'});
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT name FROM organizations WHERE id=2')).rows[0].name,'Other');
 }finally{await db.close();}
});
