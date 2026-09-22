const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('durable queue: commit, order, deduplication, leases and access', async()=>{
    const db=new PGlite();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
          CREATE TABLE applications(id uuid PRIMARY KEY);
          CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid,requested_by_team_id uuid,status text,new_team_name text);
          INSERT INTO applications VALUES ('${id(1)}');
          INSERT INTO transfers VALUES ('${id(10)}','${id(1)}','${id(2)}','pending','Historical');`);
        const sql=readFileSync(resolve(__dirname,'../migrations/20260925_transfer_notifications.sql'),'utf8');
        await db.exec(sql); await db.exec(sql);
        const claim=async()=> (await db.query('SELECT * FROM claim_transfer_notification()')).rows[0];
        const finish=async(job,state)=> (await db.query(
          'SELECT finish_transfer_notification($1,$2,$3) AS ok',[job.id,job.claim_token,state])).rows[0].ok;
        assert.equal(await claim(),undefined); // No replay/backfill of historical transfers.
        await db.exec(`BEGIN; INSERT INTO transfers VALUES ('${id(11)}','${id(1)}','${id(2)}','pending','Rollback'); ROLLBACK`);
        assert.equal(await claim(),undefined);
        await db.exec(`INSERT INTO transfers VALUES ('${id(3)}','${id(1)}','${id(2)}','pending','Team');
          UPDATE transfers SET new_team_name='Team edit' WHERE id='${id(3)}';
          UPDATE transfers SET status='approved' WHERE id='${id(3)}';
          UPDATE transfers SET status='approved' WHERE id='${id(3)}'`);
        const first=await claim(); assert.equal(first.event,'pending'); assert.equal(first.team_name,'Team');
        assert.equal(await claim(),undefined); // Final event waits for pending notification.
        assert.equal(await finish({...first,claim_token:id(99)},'sent'),false);
        assert.equal(await finish(first,'sent'),true);
        assert.equal(await finish(first,'sent'),false);
        const final=await claim(); assert.equal(final.event,'approved');
        // Simulate a process crash. New worker does not resend ambiguous claims.
        await db.exec("UPDATE transfer_notifications SET claimed_at=now()-interval '6 minutes' WHERE state='processing'");
        assert.equal(await claim(),undefined);
        assert.equal((await db.query('SELECT state FROM transfer_notifications WHERE id=$1',[final.id])).rows[0].state,'uncertain');
        assert.equal(await finish(final,'sent'),false);
        await db.exec(`INSERT INTO transfers VALUES ('${id(4)}','${id(1)}',NULL,'pending','Legacy')`);
        assert.equal(await claim(),undefined);
        await db.exec('SET ROLE anon');
        await assert.rejects(claim(),/permission denied/);
        await assert.rejects(db.query('SELECT * FROM transfer_notifications'),/permission denied/);
        await db.exec('RESET ROLE');
    } finally { await db.close(); }
});
