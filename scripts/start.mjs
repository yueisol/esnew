import {spawn} from 'node:child_process';
let stopping=false,worker,restartTimer;
const failures=[];
const web=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',process.env.PORT||'3000'],{stdio:'inherit'});
web.on('spawn',()=>console.info(JSON.stringify({event:'web_started',pid:web.pid})));
function startWorker(){
 if(stopping)return;
 worker=spawn('node',['--import','tsx','src/lib/worker.ts'],{stdio:'inherit'});
 worker.on('spawn',()=>console.info(JSON.stringify({event:'worker_started',pid:worker.pid})));
 worker.on('error',e=>console.error(JSON.stringify({event:'worker_spawn_failed',error:e.code})));
 worker.on('close',(code,signal)=>{
  if(stopping)return;
  const now=Date.now();while(failures.length&&failures[0]<now-600000)failures.shift();failures.push(now);
  const delay=Math.min(60000,2000*2**Math.min(failures.length-1,5));
  console.error(JSON.stringify({event:'worker_exited',code,signal,restart_in_ms:delay}));
  // Web stays available for downloads and progress while the worker recovers.
  restartTimer=setTimeout(startWorker,delay);
 });
}
function stop(code){
 if(stopping)return;stopping=true;clearTimeout(restartTimer);
 web.kill('SIGTERM');worker?.kill('SIGTERM');
 const deadline=setTimeout(()=>{web.kill('SIGKILL');worker?.kill('SIGKILL');process.exit(code);},25000);
 const timer=setInterval(()=>{if((web.exitCode!==null||web.signalCode)&&( !worker||worker.exitCode!==null||worker.signalCode)){clearInterval(timer);clearTimeout(deadline);process.exit(code);}},100);
}
web.on('error',()=>stop(1));web.on('exit',code=>stop(code??1));
process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
startWorker();
