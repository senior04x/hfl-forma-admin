import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('transfer authority cannot be captured by changing organization owner email',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   CREATE TABLE organizations(id bigint PRIMARY KEY,admin_email text);
   INSERT INTO auth.users VALUES
    ('11111111-1111-4111-8111-111111111111','owner@test.invalid',now()),
    ('22222222-2222-4222-8222-222222222222','other@test.invalid',now());
   INSERT INTO organizations VALUES(1,'owner@test.invalid'),(2,'other@test.invalid');`);
  await db.exec(await readFile(new URL('../drafts/transfer-owner-bindings.sql',import.meta.url),'utf8'));
  assert.equal((await db.query("SELECT organization_owner_matches('11111111-1111-4111-8111-111111111111',1) AS ok")).rows[0].ok,true);
  assert.equal((await db.query("SELECT organization_owner_matches('22222222-2222-4222-8222-222222222222',1) AS ok")).rows[0].ok,false);
  await db.exec("UPDATE organizations SET admin_email='other@test.invalid' WHERE id=1");
  assert.equal((await db.query("SELECT organization_owner_matches('22222222-2222-4222-8222-222222222222',1) AS ok")).rows[0].ok,false);
  assert.equal((await db.query("SELECT organization_owner_matches('11111111-1111-4111-8111-111111111111',1) AS ok")).rows[0].ok,false);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('SELECT * FROM organization_transfer_admin_bindings'),{code:'42501'});
  await assert.rejects(db.query("UPDATE organization_transfer_admin_bindings SET owner_id='22222222-2222-4222-8222-222222222222'"),{code:'42501'});
 }finally{await db.close();}
});
