import sharp from 'sharp';
import {all,one,run,transaction} from './db';
import {checkpointResult,finishResult,hasCheckpoint} from './generation-result';
import {analyze,edit,vision,reviewSchema} from './openai';
import {references,planShots,prompt,reviewInstruction} from './planner';
import type {Asset,Analysis,Options,Plan} from './schema';
type Job={id:string;product_id:string;model_id:string;options:string;status:string;snapshot:string};
type Shot={id:string;job_id:string;plan:string;status:string;image_id:string|null;feedback:string;revision:number};
// Bound native image buffers on small instances. Reference files remain unchanged.
sharp.cache(false);sharp.concurrency(1);
// Restore saved API responses without charging for another generation.
for(const shot of all<Shot>("SELECT * FROM shots WHERE status='generating'")){
 try {
  if(await hasCheckpoint(shot)){
   const job=one<Job>('SELECT * FROM jobs WHERE id=?',shot.job_id)!;
   await finishResult(shot,JSON.parse(job.options));
   console.info(JSON.stringify({event:'image_recovered',shot_id:shot.id}));
  }else run("UPDATE shots SET status='failed',error=? WHERE id=?",'서버가 재시작되어 요청 결과를 확인할 수 없습니다. 과금 여부를 확인한 뒤 이 컷만 재시도해 주세요.',shot.id);
 }catch(e){run("UPDATE shots SET status='failed',error='저장된 이미지 복구에 실패했습니다. 서버 저장소를 확인해 주세요.' WHERE id=?",shot.id);}
}
run("UPDATE shots SET status='review_pending' WHERE status='reviewing' AND image_id IS NOT NULL");
run("UPDATE jobs SET status='queued' WHERE status IN ('analyzing','planning')");
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
function beat(){run('INSERT INTO heartbeat VALUES(1,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at',Date.now());}
const timer=setInterval(beat,5000);beat();
const memoryTimer=setInterval(()=>console.info(JSON.stringify({event:'worker_memory',rss_mb:Math.round(process.memoryUsage().rss/1048576)})),60000);
async function prepare(job:Job){try{
 const snap=JSON.parse(job.snapshot) as {assets:Asset[]};
 run("UPDATE jobs SET status='analyzing',error=NULL WHERE id=?",job.id);
 const product=one<{analysis:string|null}>('SELECT analysis FROM products WHERE id=?',job.product_id)!;
 const analysis=product.analysis?JSON.parse(product.analysis):await analyze(snap.assets.filter(a=>['cutout','mannequin','detail'].includes(a.role)));
 run('UPDATE products SET analysis=? WHERE id=?',JSON.stringify(analysis),job.product_id);
 run("UPDATE jobs SET status='planning' WHERE id=?",job.id);
 const recent=all<{plan:string}>("SELECT shots.plan FROM shots JOIN jobs ON jobs.id=shots.job_id WHERE jobs.model_id=? AND jobs.id<>? ORDER BY jobs.created_at DESC,jobs.rowid DESC,shots.rowid ASC LIMIT 110",job.model_id,job.id).flatMap(row=>{try{const p=JSON.parse(row.plan);return p&&typeof p==='object'?[p as Plan]:[];}catch{return [];}});
 const plans=planShots(analysis,JSON.parse(job.options),{seed:job.id,recent});
 transaction(()=>{for(const plan of plans)run('INSERT INTO shots(id,job_id,plan) VALUES(?,?,?)',plan.shot_id,job.id,JSON.stringify(plan));run("UPDATE jobs SET status='running' WHERE id=?",job.id);});
 }catch(e){run("UPDATE jobs SET status='failed',error=? WHERE id=?",message(e),job.id);}}
function message(e:unknown){return e instanceof Error?e.message.slice(0,500):'작업 오류';}
async function work(shot:Shot){
 try{
  const job=one<Job>('SELECT * FROM jobs WHERE id=?',shot.job_id);
  if(!job)throw new Error('촬영 작업을 찾을 수 없습니다. 서버 저장소를 확인해 주세요.');
  const snapshot=JSON.parse(job.snapshot) as {model:{profile:string;prompt:string};assets:Asset[]};
  const analysis=JSON.parse(one<{analysis:string}>('SELECT analysis FROM products WHERE id=?',job.product_id)!.analysis) as Analysis;
  const plan=JSON.parse(shot.plan) as Plan;const options=JSON.parse(job.options) as Options;const refs=references(snapshot.assets);
  if(!await hasCheckpoint(shot))await checkpointResult(shot,await edit(prompt(snapshot.model,analysis,plan,refs,shot.feedback),refs,options.ratio==='1:1'));
  await finishResult(shot,options);
  console.info(JSON.stringify({event:'image_saved',shot_id:shot.id,rss_mb:Math.round(process.memoryUsage().rss/1048576)}));
 }catch(e){
  const error=e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)?'이미지 요청 시간이 초과되었습니다. 나머지 컷은 계속 진행합니다. 이 컷은 과금 여부를 확인한 뒤 재시도해 주세요.':message(e);
  console.error(JSON.stringify({event:'generation_failed',shot_id:shot.id,error}));run("UPDATE shots SET status='failed',error=? WHERE id=?",error,shot.id);
 }
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
async function reviews(){while(!stopping){const shot=one<Shot>("SELECT shots.* FROM shots JOIN jobs ON jobs.id=shots.job_id WHERE shots.status='review_pending' AND jobs.status='running' ORDER BY shots.rowid LIMIT 1");if(shot)await review(shot);else await new Promise(r=>setTimeout(r,300));}}
const reviewing=reviews();

// Refill each free slot independently; a slow image no longer blocks the next batch.
const active=new Set<Promise<void>>();
let preparing:Promise<void>|undefined;
while(!stopping){
 if(!preparing){const job=one<Job>("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1");if(job)preparing=prepare(job).finally(()=>{preparing=undefined;});}
 const limit=Math.max(1,Math.min(3,Number(process.env.GENERATION_CONCURRENCY)||1));
 while(active.size<limit){
  const shot=transaction(()=>{const s=one<Shot>("SELECT shots.* FROM shots JOIN jobs ON jobs.id=shots.job_id WHERE shots.status='queued' AND jobs.status='running' ORDER BY shots.rowid LIMIT 1");if(s)run("UPDATE shots SET status='generating',started_at=?,error=NULL WHERE id=?",Date.now(),s.id);return s;});
  if(!shot)break;
  console.info(JSON.stringify({event:'generation_started',shot_id:shot.id}));
  const task=work(shot).finally(()=>active.delete(task));active.add(task);
 }
 run("UPDATE jobs SET status=CASE WHEN EXISTS(SELECT 1 FROM shots WHERE job_id=jobs.id AND status='failed') THEN 'partial' ELSE 'done' END WHERE status='running' AND NOT EXISTS(SELECT 1 FROM shots WHERE job_id=jobs.id AND status IN ('queued','generating','reviewing','review_pending'))");
 await new Promise(r=>setTimeout(r,250));
}
await Promise.allSettled([...active,...(preparing?[preparing]:[]),reviewing]);
clearInterval(timer);
clearInterval(memoryTimer);
