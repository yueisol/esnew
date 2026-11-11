import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { profile,identity } from './schema';
export const root=path.resolve(process.env.DATA_DIR||'.data');
mkdirSync(path.join(root,'files'),{recursive:true,mode:0o700});
export const db=new DatabaseSync(path.join(root,'studio.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS models(id TEXT PRIMARY KEY,name TEXT NOT NULL,profile TEXT NOT NULL,prompt TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,role TEXT NOT NULL,filename TEXT NOT NULL,path TEXT NOT NULL,mime TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,analysis TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,model_id TEXT NOT NULL,options TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',error TEXT,idempotency TEXT UNIQUE NOT NULL,snapshot TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS shots(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',image_id TEXT,review TEXT,error TEXT,approved INTEGER DEFAULT 0,revision INTEGER DEFAULT 0,feedback TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,shot_id TEXT NOT NULL,image_id TEXT,plan TEXT,review TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS heartbeat(id INTEGER PRIMARY KEY CHECK(id=1),at INTEGER NOT NULL);
`);
db.prepare('INSERT OR IGNORE INTO models(id,name,profile,prompt) VALUES(?,?,?,?)').run('yoo-isol','유이솔',profile,identity);
export function all<T=Record<string,unknown>>(sql:string,...args:(string|number|null)[]):T[]{return db.prepare(sql).all(...args) as T[];}
export function one<T=Record<string,unknown>>(sql:string,...args:(string|number|null)[]):T|undefined{return db.prepare(sql).get(...args) as T|undefined;}
export function run(sql:string,...args:(string|number|null)[]){return db.prepare(sql).run(...args);}
export function transaction<T>(fn:()=>T):T{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
