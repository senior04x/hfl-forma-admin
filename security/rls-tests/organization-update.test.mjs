import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../drafts/update-organization-details.sql',import.meta.url),'utf8');
test('organization editing is scoped by exact ID and stale snapshots cannot overwrite changes',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE organizations(id bigint PRIMARY KEY,name text,slug text UNIQUE,logo_url text);
   INSERT INTO organizations VALUES(1,'Customer one','one',NULL),(2,'Synthetic','two',NULL);
   GRANT USAGE ON SCHEMA public TO service_role;GRANT SELECT,UPDATE ON organizations TO service_role;`);
  await db.exec(sql);
  const expected={name:'Synthetic',slug:'two',logoUrl:null};
  const change=(name='Changed',id=2)=>db.query('SELECT update_organization_details($1,$2,$3,$4,$5) AS id',[id,name,'two',null,expected]);
  await db.exec('SET ROLE authenticated');await assert.rejects(change(),{code:'42501'});
  await db.exec('RESET ROLE;SET ROLE service_role');
  assert.equal((await change()).rows[0].id,2);
  assert.equal((await change()).rows[0].id,2);
  await assert.rejects(change('Stale overwrite'),{code:'40001'});
  await assert.rejects(change('Missing',999),{code:'22023'});
  await assert.rejects(change('Invalid',null),{code:'22023'});
  assert.deepEqual((await db.query('SELECT name,slug FROM organizations WHERE id=1')).rows,[{name:'Customer one',slug:'one'}]);
 }finally{await db.close();}
});
