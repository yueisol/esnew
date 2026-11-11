import {spawn} from 'node:child_process';
const children=[spawn('node',['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',process.env.PORT||'3000'],{stdio:'inherit'}),spawn('node',['--import','tsx','src/lib/worker.ts'],{stdio:'inherit'})];
let stopping=false;function stop(code){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');setTimeout(()=>process.exit(code),1000);}
for(const c of children)c.on('exit',code=>stop(code||0));process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
