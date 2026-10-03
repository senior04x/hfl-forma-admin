import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('search reaches teams outside first page, escapes wildcards and respects league and organization',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
   CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '11111111-1111-4111-8111-111111111111'::uuid$$;
   CREATE FUNCTION organization_owner_matches(uuid,bigint) RETURNS boolean LANGUAGE sql AS $$SELECT $2=1$$;
   CREATE TABLE teams(id uuid PRIMARY KEY,organization_id bigint,name text,league text,is_archived boolean);
   CREATE TABLE team_transfer_permissions(team_id uuid PRIMARY KEY,allowed boolean);
   INSERT INTO teams SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,1,'Team '||n,'A',false FROM generate_series(1,40) n;
   INSERT INTO teams VALUES('ffffffff-ffff-4fff-8fff-fffffffffff1',1,'FC.PEDAGOG','B',false),('ffffffff-ffff-4fff-8fff-fffffffffff2',2,'FC.PEDAGOG','B',false),('ffffffff-ffff-4fff-8fff-fffffffffff3',1,'100% Club','A',false);`);
  await db.exec(await readFile(new URL('../drafts/transfer-team-search.sql',import.meta.url),'utf8'));
  const find=async(query,league=null,after=null)=>(await db.query('SELECT admin_team_transfer_access_page(1,$1,$2,$3) AS page',[league,after,query])).rows[0].page;
  assert.equal((await find('')).items.length,31);
  assert.equal((await find('pedagog')).items.length,1);
  assert.equal((await find('pedagog','A')).items.length,0);
  assert.equal((await find('pedagog','B')).items[0].name,'FC.PEDAGOG');
  assert.equal((await find('100%')).items.length,1);
  assert.equal((await find('%%')).items.length,0);
  const page=await find('Team');assert.equal(page.items.length,31);
  assert.equal((await find('Team',null,page.items[29].id)).items.length,10);
  await assert.rejects(find('a'),{code:'22023'});
  await assert.rejects(db.query("SELECT admin_team_transfer_access_page(2,NULL,NULL,'pedagog')"),{code:'42501'});
 }finally{await db.close();}
});
