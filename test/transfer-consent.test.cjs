const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
// Test-only PostgreSQL runtime; never connects to Supabase.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('database enforces consent and preserves legacy transfers', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS
        $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
      CREATE TABLE public.transfers (
        id integer PRIMARY KEY, status text DEFAULT 'pending',
        player_confirmed boolean DEFAULT false, requested_by_team_id uuid,
        player_id uuid, old_team_id uuid, new_team_id uuid, organization_id bigint
      );
    `);
    const migration = readFileSync(resolve(__dirname,
      '../migrations/20260922_enforce_player_confirmation.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Re-applying does not leave duplicate triggers.
    const team = '00000000-0000-4000-8000-000000000001';
    await db.exec(`INSERT INTO transfers (id, requested_by_team_id)
      VALUES (1, '${team}'), (2, '${team}'), (3, NULL);
      SET request.jwt.claim.role = 'authenticated';`);
    await assert.rejects(db.exec("UPDATE transfers SET status='approved' WHERE id=1"), /not confirmed/);
    await assert.rejects(db.exec("UPDATE transfers SET player_confirmed=true, status='approved' WHERE id=1"), /confirmation service/);
    await assert.rejects(db.exec("UPDATE transfers SET player_confirmed=true WHERE id=1"), /confirmation service/);
    await assert.rejects(db.exec("UPDATE transfers SET requested_by_team_id=NULL, status='approved' WHERE id=1"), /participants/);
    await assert.rejects(db.exec("UPDATE transfers SET organization_id=2 WHERE id=1"), /participants/);
    await assert.rejects(db.exec(`INSERT INTO transfers (id, requested_by_team_id, status, player_confirmed)
      VALUES (4, '${team}', 'approved', true)`), /await player confirmation/);
    await db.exec("RESET request.jwt.claim.role");
    await assert.rejects(db.exec("UPDATE transfers SET player_confirmed=true WHERE id=1"), /confirmation service/);
    await db.exec("SET request.jwt.claim.role = 'service_role'");
    await assert.rejects(db.exec("UPDATE transfers SET player_confirmed=true, status='approved' WHERE id=1"), /pending transfer/);
    await db.exec("UPDATE transfers SET player_confirmed=true WHERE id=1");
    await db.exec("SET request.jwt.claim.role = 'authenticated'");
    await db.exec("UPDATE transfers SET status='approved' WHERE id=1");
    await assert.rejects(db.exec("UPDATE transfers SET status='pending' WHERE id=1"), /cannot be reopened/);
    await db.exec("UPDATE transfers SET status='rejected' WHERE id=2");
    await assert.rejects(db.exec("UPDATE transfers SET status='approved' WHERE id=2"), /cannot be reopened/);
    await db.exec("UPDATE transfers SET status='approved' WHERE id=3");
    await db.exec("UPDATE transfers SET status='pending' WHERE id=3");
    const result = await db.query('SELECT id, status FROM transfers ORDER BY id');
    assert.deepEqual(result.rows, [
      { id: 1, status: 'approved' }, { id: 2, status: 'rejected' },
      { id: 3, status: 'pending' },
    ]);
  } finally {
    await db.close();
  }
});
