import {spawn} from 'node:child_process';import {mkdtemp,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await mkdtemp(path.join(os.tmpdir(),'esol-supervisor-'));
const parent=spawn('node',['scripts/start.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:'3102'},stdio:'pipe'});let output='';parent.stderr?.on('data',d=>{output+=d;});parent.stdout?.on('data',d=>{output+=d;});
function events(){return output.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});}
try{
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:3102/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal(parent.exitCode,null,output);const worker=events().find(e=>e.event==='worker_started');assert.ok(worker,output);process.kill(worker.pid,'SIGKILL');
 let replaced=false;
 for(let i=0;i<80;i++){assert.equal((await fetch('http://127.0.0.1:3102/api/health')).status,200);assert.equal(events().filter(e=>e.event==='web_started').length,1,'web must remain alive');if(events().some(e=>e.event==='worker_started'&&e.pid!==worker.pid)){replaced=true;break;}await new Promise(r=>setTimeout(r,100));}
 assert.ok(replaced);assert.match(output,/worker_exited/);console.log('PASS: worker SIGKILL triggers automatic restart while web stays alive.');
}finally{parent.kill('SIGTERM');if(parent.exitCode===null&&parent.signalCode===null)await new Promise(r=>parent.once('exit',r));}
