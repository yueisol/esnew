import {writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {all,one,run,transaction,root} from './db';
import {cleanupExpired,jobAvailable} from './retention';
import {analyze,edit,vision,reviewSchema} from './openai';
import {references,planShots,prompt,reviewInstruction} from './planner';
import type {Asset,Analysis,Options,Plan} from './schema';
type Job={id:string;product_id:string;model_id:string;options:string;status:string;snapshot:string};
type Shot={id:string;job_id:string;plan:string;status:string;image_id:string|null;feedback:string};
await cleanupExpired();
const retentionTimer=setInterval(()=>{void cleanupExpired().catch(()=>console.error('retention_cleanup_failed'));},60000);
// One supervised worker per persistent disk. Uncertain in-flight paid calls require manual retry.
run("UPDATE shots SET status='failed',error='서버가 재시작되었습니다. 이전 요청의 과금 여부를 확인한 뒤 재시도해 주세요.' WHERE status='generating'");
run("UPDATE shots SET status='review_pending' WHERE status='reviewing' AND image_id IS NOT NULL");
run("UPDATE jobs SET status='queued' WHERE status IN ('analyzing','planning')");
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
function beat(){run('INSERT INTO heartbeat VALUES(1,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at',Date.now());}
const timer=setInterval(beat,5000);beat();
async function prepare(job:Job){try{
 const snap=JSON.parse(job.snapshot) as {assets:Asset[]};
 run("UPDATE jobs SET status='analyzing',error=NULL WHERE id=?",job.id);
 const product=one<{analysis:string|null}>('SELECT analysis FROM products WHERE id=?',job.product_id)!;
 const analysis=product.analysis?JSON.parse(product.analysis):await analyze(snap.assets.filter(a=>['cutout','mannequin','detail'].includes(a.role)));
 if(!jobAvailable(job.id))return;
 run('UPDATE products SET analysis=? WHERE id=?',JSON.stringify(analysis),job.product_id);
 run("UPDATE jobs SET status='planning' WHERE id=?",job.id);
 const plans=planShots(analysis,JSON.parse(job.options));
 transaction(()=>{if(!jobAvailable(job.id))return;for(const plan of plans)run('INSERT INTO shots(id,job_id,plan) VALUES(?,?,?)',plan.shot_id,job.id,JSON.stringify(plan));run("UPDATE jobs SET status='running' WHERE id=?",job.id);});
 }catch(e){run("UPDATE jobs SET status='failed',error=? WHERE id=?",message(e),job.id);}}
function message(e:unknown){return e instanceof Error?e.message.slice(0,500):'작업 오류';}
async function work(shot:Shot){
 const job=one<Job>('SELECT * FROM jobs WHERE id=?',shot.job_id)!;
 const snapshot=JSON.parse(job.snapshot) as {model:{profile:string;prompt:string};assets:Asset[]};
 const analysis=JSON.parse(one<{analysis:string}>('SELECT analysis FROM products WHERE id=?',job.product_id)!.analysis) as Analysis;
 const plan=JSON.parse(shot.plan) as Plan;const options=JSON.parse(job.options) as Options;const refs=references(snapshot.assets);
 let imageId=shot.image_id;
 try{
 if(shot.status!=='review_pending'){
 run("UPDATE shots SET status='generating',error=NULL WHERE id=?",shot.id);
 const bytes=await edit(prompt(snapshot.model,analysis,plan,refs,shot.feedback),refs,options.ratio==='1:1');
 // Preserve entire native image: pad to selected ratio instead of cropping product details.
 const width=options.ratio==='3:4'?1152:options.ratio==='4:5'?1280:1024,height=options.ratio==='1:1'?1024:options.ratio==='3:4'?1536:1600;
 const output=await sharp(bytes).resize(width,height,{fit:'contain',background:'#f4f3f1',withoutEnlargement:true}).png().toBuffer();
 imageId=randomUUID();const dest=path.join(root,'files',imageId+'.png');await writeFile(dest,output,{mode:0o600});
 const saved=transaction(()=>{if(!jobAvailable(job.id))return false;run('INSERT INTO assets VALUES(?,?,?,?,?,?)',imageId!,job.id,'result','result.png',dest,'image/png');run("UPDATE shots SET image_id=?,status='review_pending',approved=0 WHERE id=?",imageId!,shot.id);return true;});
 if(!saved){await unlink(dest);return;}
 }
 console.info(JSON.stringify({event:'image_saved',shot_id:shot.id}));
 }catch(e){console.error(JSON.stringify({event:'generation_failed',shot_id:shot.id,error:message(e)}));run("UPDATE shots SET status='failed',error=? WHERE id=?",message(e),shot.id);}
}
async function review(shot:Shot){
 run("UPDATE shots SET status='reviewing' WHERE id=?",shot.id);
 try{
 const job=one<Job>('SELECT * FROM jobs WHERE id=?',shot.job_id)!;
 const snapshot=JSON.parse(job.snapshot) as {assets:Asset[]};
 const refs=references(snapshot.assets);
 const generated=one<Asset>('SELECT * FROM assets WHERE id=?',shot.image_id!)!;
 const prior=all<Asset>("SELECT assets.* FROM shots JOIN assets ON assets.id=shots.image_id WHERE shots.job_id=? AND shots.id<>? AND shots.status='done' LIMIT 2",job.id,shot.id);
 const result=await vision(reviewInstruction(JSON.parse(shot.plan) as Plan),[...refs.slice(0,8),...prior,generated],reviewSchema,'quality_review');
 run("UPDATE shots SET status='done',review=?,error=NULL WHERE id=?",JSON.stringify(result),shot.id);
 }catch(e){console.error(JSON.stringify({event:'review_failed',shot_id:shot.id,error:message(e)}));run("UPDATE shots SET status='done',review=?,error=NULL WHERE id=?",JSON.stringify({passed:false,issues:['자동 검수 실패: '+message(e)+' 직접 검수해 주세요.']}),shot.id);}
}
// Review has its own single slot. Slow review cannot hold generation slots.
async function reviews(){while(!stopping){const shot=one<Shot>("SELECT shots.* FROM shots JOIN jobs ON jobs.id=shots.job_id WHERE shots.status='review_pending' AND jobs.status='running' AND jobs.expires_at>? ORDER BY shots.rowid LIMIT 1",Date.now());if(shot)await review(shot);else await new Promise(r=>setTimeout(r,300));}}
const reviewing=reviews();

while(!stopping){
 const job=one<Job>("SELECT * FROM jobs WHERE status='queued' AND expires_at>? ORDER BY created_at LIMIT 1",Date.now());if(job)await prepare(job);
 const shots=all<Shot>("SELECT shots.* FROM shots JOIN jobs ON jobs.id=shots.job_id WHERE shots.status='queued' AND jobs.status='running' AND jobs.expires_at>? LIMIT ?",Date.now(),Math.max(1,Math.min(3,Number(process.env.GENERATION_CONCURRENCY)||1)));
 await Promise.all(shots.map(work));
 run("UPDATE jobs SET status=CASE WHEN EXISTS(SELECT 1 FROM shots WHERE job_id=jobs.id AND status='failed') THEN 'partial' ELSE 'done' END WHERE status='running' AND NOT EXISTS(SELECT 1 FROM shots WHERE job_id=jobs.id AND status IN ('queued','generating','reviewing','review_pending'))");
 if(!job&&!shots.length)await new Promise(r=>setTimeout(r,1000));
}
await reviewing;
clearInterval(timer);
clearInterval(retentionTimer);
