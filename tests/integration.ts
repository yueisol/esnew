import {spawn} from 'node:child_process';import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import sharp from 'sharp';import JSZip from 'jszip';
const dir=await mkdtemp(path.join(os.tmpdir(),'esol-test-'));const env={...process.env,DATA_DIR:dir,OPENAI_API_KEY:'mock-only-not-a-key',STUDIO_PASSWORD:'test-password',SESSION_SECRET:'integration-test-secret-not-for-production',PORT:'3100'};
const web=spawn('node',['node_modules/next/dist/bin/next','start','-p','3100'],{env,stdio:'pipe'});let worker:ReturnType<typeof spawn>|undefined;let cookie='';
const base='http://127.0.0.1:3100/api/';
async function req(p:string,method='GET',body?:unknown){return fetch(base+p,{method,headers:{Cookie:cookie,...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});}
async function json(p:string,method='GET',body?:unknown){const r=await req(p,method,body);assert.ok(r.ok,`${p}: ${r.status} ${await r.clone().text()}`);return r.json();}
try{
 for(let i=0;i<60;i++){try{if((await req('health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.equal((await req('models')).status,401);
 const login=await req('session','POST',{password:'test-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
 const models=await json('models');assert.equal(models[0].name,'유이솔');
 const pid=(await json('products','POST',{name:'테스트 니트'})).id;
 const bytes=await sharp({create:{width:200,height:300,channels:3,background:'#a0a0a0'}}).png().toBuffer();
 for(const [role,owner] of [['reference','yoo-isol'],['cutout',pid],['detail',pid]]){const f=new FormData();f.set('owner_id',owner);f.set('role',role);f.set('file',new Blob([new Uint8Array(bytes)],{type:'image/png'}),'fixture.png');await json('uploads','POST',f);}
 const invalid=new FormData();invalid.set('owner_id',pid);invalid.set('role','cutout');invalid.set('file',new Blob(['not an image'],{type:'image/png'}),'fake.png');assert.equal((await req('uploads','POST',invalid)).status,500);
 const input={product_id:pid,model_id:'yoo-isol',options:{count:10,ratio:'3:4'},idempotency:crypto.randomUUID()};
 const jobs=await Promise.all([json('jobs','POST',input),json('jobs','POST',input)]);assert.equal(jobs[0].id,jobs[1].id);
 worker=spawn('node',['--import','tsx','tests/mock-worker.ts'],{env,stdio:'pipe'});worker.stderr?.on('data',d=>process.stderr.write(d));
 async function complete(id:string){for(let i=0;i<120;i++){const j=await json('jobs/'+id);if(j.status==='done')return j;if(j.status==='failed'||j.status==='partial')throw new Error(JSON.stringify(j));await new Promise(r=>setTimeout(r,250));}throw new Error('Timed out');}
 let advanced=false;for(let i=0;i<35;i++){const pending=await json('jobs/'+jobs[0].id);if(pending.shots.filter((s:{image_id:string|null})=>s.image_id).length>=3){assert.equal(pending.shots.filter((s:{status:string})=>s.status==='done').length,0);advanced=true;break;}await new Promise(r=>setTimeout(r,200));}assert.ok(advanced,'Generation must progress past the first pair while review is still delayed');
 let job=await complete(jobs[0].id);assert.equal(job.shots.length,10);assert.ok(job.shots.every((s:{status:string})=>s.status==='done'));
 const oldIds=job.shots.map((s:{image_id:string})=>s.image_id);await json(`shots/${job.shots[0].id}/retry`,'POST',{feedback:'손 수정'});job=await complete(job.id);assert.notEqual(job.shots[0].image_id,oldIds[0]);assert.deepEqual(job.shots.slice(1).map((s:{image_id:string})=>s.image_id),oldIds.slice(1));
 await json(`shots/${job.shots[0].id}/approve`,'POST',{});assert.equal((await json('jobs/'+job.id)).shots[0].approved,1);
 const zip=await req('jobs/'+job.id+'/zip');assert.equal(Object.keys((await JSZip.loadAsync(await zip.arrayBuffer())).files).length,10);
 const image=await req('assets/'+job.shots[0].image_id+'?format=jpg');assert.equal(image.headers.get('content-type'),'image/jpeg');assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width,1152);
 const extended=await json('jobs','POST',{...input,idempotency:crypto.randomUUID(),options:{count:11,ratio:'1:1'}});const extendedJob=await complete(extended.id);assert.equal(extendedJob.shots.length,11);
 worker.kill('SIGTERM');await new Promise(r=>setTimeout(r,1200));assert.equal((await json('jobs/'+job.id)).shots.length,10);
 console.log('PASS: authenticated uploads, MIME decoding, duplicate job protection, 10/11-shot mocked worker, single regeneration isolation, approval, ZIP/JPEG, persistent job recovery.');
}catch(e){console.error(e);process.exitCode=1;}finally{worker?.kill('SIGTERM');web.kill('SIGTERM');}
