import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,access,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
const dir=await mkdtemp(path.join(os.tmpdir(),'esol-retention-'));
process.env.DATA_DIR=dir;
// Exercise upgrading an existing database before expiry column exists.
const old=new DatabaseSync(path.join(dir,'studio.sqlite'));
old.exec("CREATE TABLE jobs(id TEXT PRIMARY KEY,product_id TEXT,model_id TEXT,options TEXT,status TEXT,error TEXT,idempotency TEXT,snapshot TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP); INSERT INTO jobs(id,product_id,created_at) VALUES('legacy','legacy-product','2026-01-01 12:00:00')");old.close();
const {db,run,one,all}=await import('../src/lib/db');
const {cleanupExpired,jobAvailable,assetExpired,RETENTION_MS}=await import('../src/lib/retention');
const now=Date.now();
function job(id:string,product:string,expiry:number){run("INSERT INTO jobs(id,product_id,expires_at) VALUES(?,?,?)",id,product,expiry);}
async function asset(id:string,owner:string,role='result'){
 const file=path.join(dir,'files',id+'.png');await writeFile(file,'fixture');run('INSERT INTO assets VALUES(?,?,?,?,?,?)',id,owner,role,id,file,'image/png');return file;
}
test('migrates existing jobs and expires exactly at seven days without resetting dates',()=>{
 assert.equal(one<{expires_at:number}>("SELECT expires_at FROM jobs WHERE id='legacy'")!.expires_at,Date.parse('2026-01-08T12:00:00Z'));
 run("INSERT INTO jobs(id,created_at) VALUES('boundary','2026-03-01 00:00:00')");
 const end=Date.parse('2026-03-01T00:00:00Z')+RETENTION_MS;
 assert.ok(jobAvailable('boundary',end-1));assert.equal(jobAvailable('boundary',end),false);
 assert.equal(assetExpired('boundary',end),true);
 run("UPDATE jobs SET status='running' WHERE id='boundary'");assert.equal(one<{expires_at:number}>("SELECT expires_at FROM jobs WHERE id='boundary'")!.expires_at,end);
});
test('deletes expired current and regenerated images, retains model references and shared product until last job expires',async()=>{
 run("INSERT INTO products(id,name) VALUES('shared','공유 상품')");job('expired','shared',now);job('retained','shared',now+RETENTION_MS);
 run("INSERT INTO shots(id,job_id,plan) VALUES('shot-old','expired','{}')");run("INSERT INTO history(shot_id,image_id) VALUES('shot-old','previous-image')");
 const files=await Promise.all([asset('current-image','expired'),asset('previous-image','expired'),asset('active-image','retained'),asset('product-ref','shared','cutout'),asset('model-ref','yoo-isol','face')]);
 await cleanupExpired(now);
 for(const file of files.slice(0,2))await assert.rejects(access(file));
 for(const file of files.slice(2))await access(file);
 assert.equal(one("SELECT id FROM jobs WHERE id='expired'"),undefined);assert.equal(all('SELECT * FROM history').length,0);
 assert.ok(one("SELECT id FROM products WHERE id='shared'"));assert.ok(one("SELECT id FROM jobs WHERE id='retained'"));
 await cleanupExpired(now+RETENTION_MS);
 for(const file of files.slice(2,4))await assert.rejects(access(file));await access(files[4]);
 assert.equal(one("SELECT id FROM products WHERE id='shared'"),undefined);
 assert.ok(one("SELECT id FROM models WHERE id='yoo-isol'"));
 await cleanupExpired(now+RETENTION_MS); // Repeat safely after restart-equivalent sweep.
});
test('failed file removal remains durably queued and retries on the next sweep',async()=>{
 const file=path.join(dir,'files','blocked');await mkdir(file);run('INSERT INTO pending_deletions VALUES(?)',file);
 await cleanupExpired(now);assert.ok(one('SELECT path FROM pending_deletions WHERE path=?',file));
 await rm(file,{recursive:true});await cleanupExpired(now);assert.equal(one('SELECT path FROM pending_deletions WHERE path=?',file),undefined);
});
