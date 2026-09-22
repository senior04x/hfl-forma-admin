const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('only owning admin decides; no player confirmation is needed', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS
        $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
      CREATE FUNCTION public.get_user_org_id() RETURNS bigint LANGUAGE sql AS
        $$ SELECT nullif(current_setting('test.org', true), '')::bigint $$;
      CREATE TABLE transfers (
        id integer PRIMARY KEY, status text DEFAULT 'pending',
        player_confirmed boolean DEFAULT false, requested_by_team_id uuid,
        player_id uuid, old_team_id uuid, new_team_id uuid, organization_id bigint
      );
    `);
    const migrate = file => db.exec(readFileSync(resolve(__dirname, '../migrations', file), 'utf8'));
    await migrate('20260922_enforce_player_confirmation.sql');
    // Upgrade existing pending rows, including legacy NULL consent.
    await db.exec(`INSERT INTO transfers(id,requested_by_team_id,organization_id)
      VALUES (1,'00000000-0000-4000-8000-000000000001',7),
      (2,'00000000-0000-4000-8000-000000000001',7), (3,NULL,7)`);
    await migrate('20260924_admin_only_transfer_decisions.sql');
    await migrate('20260924_admin_only_transfer_decisions.sql');
    await db.exec('UPDATE transfers SET player_confirmed=NULL WHERE id=2');
    await db.exec("SET request.jwt.claim.role='service_role'; SET test.org='7'");
    await assert.rejects(db.exec("UPDATE transfers SET status='approved' WHERE id=1"), /Only the organization admin/);
    await db.exec("SET request.jwt.claim.role='anon'");
    await assert.rejects(db.exec("UPDATE transfers SET status='rejected' WHERE id=1"), /Only the organization admin/);
    await db.exec("SET request.jwt.claim.role='authenticated'; SET test.org='8'");
    await assert.rejects(db.exec("UPDATE transfers SET status='approved' WHERE id=1"), /Only the organization admin/);
    await db.exec("RESET test.org");
    await assert.rejects(db.exec("UPDATE transfers SET status='approved' WHERE id=1"), /Only the organization admin/);
    await db.exec("SET test.org='7'");
    await assert.rejects(db.exec("UPDATE transfers SET requested_by_team_id=NULL, status='approved' WHERE id=1"), /participants/);
    await assert.rejects(db.exec("UPDATE transfers SET organization_id=8 WHERE id=1"), /participants/);
    await db.exec("UPDATE transfers SET status='approved' WHERE id=1");
    await db.exec("UPDATE transfers SET status='rejected' WHERE id=2");
    await assert.rejects(db.exec("UPDATE transfers SET status='pending' WHERE id=1"), /Only pending/);
    await assert.rejects(db.exec("UPDATE transfers SET status='approved' WHERE id=2"), /Only pending/);
    await assert.rejects(db.exec(`INSERT INTO transfers(id,requested_by_team_id,status,organization_id)
      VALUES (4,'00000000-0000-4000-8000-000000000001','approved',7)`), /admin review/);
    await db.exec("UPDATE transfers SET status='approved' WHERE id=3");
    await db.exec("UPDATE transfers SET status='pending' WHERE id=3");
    assert.deepEqual((await db.query('SELECT id,status,player_confirmed FROM transfers ORDER BY id')).rows, [
      {id:1,status:'approved',player_confirmed:false},
      {id:2,status:'rejected',player_confirmed:null},
      {id:3,status:'pending',player_confirmed:false},
    ]);
  } finally { await db.close(); }
});
