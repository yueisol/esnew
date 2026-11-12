import {mkdir,writeFile,rename,unlink,access} from 'node:fs/promises';
import path from 'node:path';
import {renderPhotographicFinish} from './photographic-finish';
import {root,one,run,transaction} from './db';
import type {Options} from './schema';
export type ResultShot={id:string;job_id:string;revision:number};
function checkpoint(s:ResultShot){return path.join(root,'checkpoints',`${s.id}-${s.revision}.png`);}
export async function hasCheckpoint(s:ResultShot){try{await access(checkpoint(s));return true;}catch{return false;}}
export async function checkpointResult(s:ResultShot,bytes:Buffer){
 await mkdir(path.join(root,'checkpoints'),{recursive:true,mode:0o700});
 const dest=checkpoint(s);await writeFile(dest+'.tmp',bytes,{mode:0o600});await rename(dest+'.tmp',dest);
}
export async function finishResult(s:ResultShot,options:Options){
 const width=options.ratio==='3:4'?1152:options.ratio==='4:5'?1280:1024,height=options.ratio==='1:1'?1024:options.ratio==='3:4'?1536:1600;
 const id=`${s.id}-r${s.revision}`,dest=path.join(root,'files',id+'.png');
 const shot=one<{plan:string}>('SELECT plan FROM shots WHERE id=?',s.id);
 const type=shot?JSON.parse(shot.plan).shot_type:'STUDIO';
 await renderPhotographicFinish(checkpoint(s),dest+'.tmp',width,height,`${s.id}:${s.revision}`,type);
 await rename(dest+'.tmp',dest);
 transaction(()=>{
  const current=one<{revision:number}>('SELECT revision FROM shots WHERE id=?',s.id);
  if(!current||current.revision!==s.revision)throw new Error('촬영 버전이 변경되었습니다.');
  run('INSERT OR IGNORE INTO assets VALUES(?,?,?,?,?,?)',id,s.job_id,'result','result.png',dest,'image/png');
  run("UPDATE shots SET image_id=?,status='review_pending',approved=0,error=NULL WHERE id=?",id,s.id);
 });
 await unlink(checkpoint(s)).catch(()=>{});
}
