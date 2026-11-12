import {unlink} from 'node:fs/promises';
import path from 'node:path';
import {all,one,run,transaction,root} from './db';

export const RETENTION_MS=7*24*60*60*1000;
export function jobAvailable(id:string,now=Date.now()){
 return !!one('SELECT id FROM jobs WHERE id=? AND expires_at>?',id,now);
}
export function assetExpired(ownerId:string,now=Date.now()){
 return !!one('SELECT id FROM jobs WHERE id=? AND expires_at<=?',ownerId,now);
}
let cleaning:Promise<void>|undefined;
export function cleanupExpired(now=Date.now()):Promise<void>{
 if(cleaning)return cleaning;
 cleaning=cleanup(now).finally(()=>{cleaning=undefined;});
 return cleaning;
}
async function cleanup(now:number){
 // Persist deletion intent before removing metadata; interrupted unlinks retry next sweep.
 transaction(()=>{
  const expired=all<{id:string;product_id:string}>('SELECT id,product_id FROM jobs WHERE expires_at<=?',now);
  for(const job of expired){
   run('INSERT OR IGNORE INTO pending_deletions(path) SELECT path FROM assets WHERE owner_id=?',job.id);
   run('DELETE FROM assets WHERE owner_id=?',job.id);
   run('DELETE FROM history WHERE shot_id IN (SELECT id FROM shots WHERE job_id=?)',job.id);
   run('DELETE FROM shots WHERE job_id=?',job.id);
   run('DELETE FROM jobs WHERE id=?',job.id);
   // Shared products survive while another retained job references them. Model assets always survive.
   if(!one('SELECT id FROM jobs WHERE product_id=?',job.product_id)){
    run('INSERT OR IGNORE INTO pending_deletions(path) SELECT path FROM assets WHERE owner_id=?',job.product_id);
    run('DELETE FROM assets WHERE owner_id=?',job.product_id);
    run('DELETE FROM products WHERE id=?',job.product_id);
   }
  }
 });
 for(const item of all<{path:string}>('SELECT path FROM pending_deletions')){
  const relative=path.relative(path.join(root,'files'),path.resolve(item.path));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)){
   console.error('retention_unsafe_path');continue;
  }
  try{await unlink(item.path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'){console.error('retention_file_delete_failed');continue;}}
  run('DELETE FROM pending_deletions WHERE path=?',item.path);
 }
}
