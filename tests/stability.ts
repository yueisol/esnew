import {mkdtemp,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';import sharp from 'sharp';
const dir=await mkdtemp(path.join(os.tmpdir(),'esol-stability-'));process.env.DATA_DIR=dir;
const {one,run,all,db}=await import('../src/lib/db');
const {checkpointResult}=await import('../src/lib/generation-result');
const {planShots}=await import('../src/lib/planner');
const {analysisSchema,optionsSchema}=await import('../src/lib/schema');
const fields=['subcategory','main_color','secondary_color','pattern','material','texture','fit','silhouette','neckline','shoulder_structure','sleeve_length','garment_length','waistline','hemline','fastening'];
const analysis=analysisSchema.parse({...Object.fromEntries(fields.map(k=>[k,'test'])),category:'TOP',design_details:[],unique_features:[],styling_recommendations:[],visual_uncertainties:[]});
const options=optionsSchema.parse({});const plans=planShots(analysis,options);
run('INSERT INTO products(id,name,analysis) VALUES(?,?,?)','p','fixture',JSON.stringify(analysis));
run('INSERT INTO jobs(id,product_id,model_id,options,status,idempotency,snapshot) VALUES(?,?,?,?,?,?,?)','j','p','yoo-isol',JSON.stringify(options),'running','stability',JSON.stringify({model:{profile:'adult model',prompt:'same identity'},assets:[]}));
for(const [i,id] of ['saved','uncertain','slow','fast','invalid','last'].entries()){
 const p={...plans[i],scene:id==='slow'?'[SLOW]':id};
 run('INSERT INTO shots(id,job_id,plan,status) VALUES(?,?,?,?)',id,'j',id==='invalid'?'{':JSON.stringify(p),i<2?'generating':'queued');
}
await checkpointResult({id:'saved',job_id:'j',revision:0},await sharp({create:{width:128,height:192,channels:3,background:'#ddd'}}).png().toBuffer());
const worker=spawn('node',['--import','tsx','tests/mock-worker.ts'],{env:{...process.env,OPENAI_API_KEY:'test-only',TEST_STABILITY:'1',GENERATION_CONCURRENCY:'2',IMAGE_REQUEST_TIMEOUT_MS:'3000'},stdio:'pipe'});
let stderr='';worker.stderr?.on('data',d=>{stderr+=d;});
try{
 let refilled=false;
 for(let i=0;i<150;i++){
  const slow=one<{status:string}>('SELECT status FROM shots WHERE id=?','slow');
  const last=one<{image_id:string|null}>('SELECT image_id FROM shots WHERE id=?','last');
  if(slow?.status==='generating'&&last?.image_id)refilled=true;
  if(one<{status:string}>("SELECT status FROM jobs WHERE id='j'")?.status==='partial')break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(refilled,'Free slot must continue past invalid metadata while slow request remains active');
 const shots=all<{id:string;status:string;image_id:string|null;error:string|null}>('SELECT * FROM shots');
 for(const id of ['saved','fast','last'])assert.equal(shots.find(s=>s.id===id)?.status,'done',stderr);
 for(const id of ['uncertain','slow','invalid'])assert.equal(shots.find(s=>s.id===id)?.status,'failed');
 assert.match(shots.find(s=>s.id==='slow')!.error!,/시간이 초과/);
 const calls=(await readFile(path.join(dir,'requests.log'),'utf8')).trim().split('\n');assert.equal(calls.length,3,'Recovery must not generate again; timeout must not be automatically retried');
 assert.equal(one<{status:string}>("SELECT status FROM jobs WHERE id='j'")?.status,'partial');
 console.log('PASS: saved-response recovery without API resubmission, independent slots, timeout isolation, malformed-plan isolation, remaining images complete.');
}finally{worker.kill('SIGTERM');await new Promise(r=>worker.once('exit',r));db.close();}
