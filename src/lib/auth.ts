import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
const localSecret=randomBytes(32).toString('hex');
export function secret(){return process.env.SESSION_SECRET||localSecret;}
export function configured(){return !!process.env.STUDIO_PASSWORD&&!!process.env.SESSION_SECRET;}
export function equal(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export function token(){const exp=String(Date.now()+7*86400000);return exp+'.'+createHmac('sha256',secret()).update(exp).digest('hex');}
export function authorized(req:Request){const value=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('esol_session='))?.slice(13);if(!value||!configured())return false;const [exp,sig]=value.split('.');return Number(exp)>Date.now()&&equal(sig||'',createHmac('sha256',secret()).update(exp).digest('hex'));}
