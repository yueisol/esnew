import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import JSZip from 'jszip';
import {z} from 'zod';
import {all,one,run,transaction,root} from '@/lib/db';
import {configured,authorized,equal,token} from '@/lib/auth';
import {roles,optionsSchema,profile,identity,type Asset} from '@/lib/schema';
import {jobAvailable,assetExpired} from '@/lib/retention';
import {imageModel} from '@/lib/openai';
export const runtime='nodejs';export const dynamic='force-dynamic';
const loginAttempts=new Map<string,{count:number;at:number}>();
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store'}});
const fail=(m:string,status=400)=>json({error:m},status);
async function handler(req:Request,context:{params:Promise<{path:string[]}>}){
 try{
 const parts=(await context.params).path;const [resource,id,action]=parts;const method=req.method;
 if(method!=='GET'){const origin=req.headers.get('origin');if(origin&&origin!==`${new URL(req.url).protocol}//${req.headers.get('host')}`&&origin!==process.env.APP_ORIGIN)return fail('허용되지 않은 요청 출처입니다.',403);}
 if(resource==='health')return json({ok:true});
 if(resource==='session'){
 if(method==='GET')return json({authenticated:authorized(req),configured:configured()});
 if(method==='DELETE'){const r=json({ok:true});r.cookies.set('esol_session','',{maxAge:0,path:'/'});return r;}
 if(!configured())return fail('STUDIO_PASSWORD와 SESSION_SECRET을 서버에 설정해 주세요.',503);
 const key='studio';const state=loginAttempts.get(key);if(state&&Date.now()-state.at<60000&&state.count>=10)return fail('1분 후 다시 시도해 주세요.',429);
 const body=await req.json();if(!equal(String(body.password||''),process.env.STUDIO_PASSWORD!)){loginAttempts.set(key,{count:state&&Date.now()-state.at<60000?state.count+1:1,at:state?.at&&Date.now()-state.at<60000?state.at:Date.now()});return fail('비밀번호가 일치하지 않습니다.',401);}
 const r=json({ok:true});r.cookies.set('esol_session',token(),{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:604800});return r;
 }
 if(!authorized(req))return fail('스튜디오에 로그인해 주세요.',401);
 if(resource==='config')return json({apiReady:!!process.env.OPENAI_API_KEY,imageModel,workerReady:Date.now()-(one<{at:number}>('SELECT at FROM heartbeat WHERE id=1')?.at||0)<20000});
 if(resource==='models'){
 if(method==='GET')return json(all('SELECT * FROM models').map(m=>({...m,assets:all('SELECT id,role,filename FROM assets WHERE owner_id=?',String(m.id))})));
 const b=z.object({name:z.string().min(1).max(100),profile:z.string().min(1).max(5000)}).parse(await req.json());
 if(method==='PATCH'){if(!one('SELECT id FROM models WHERE id=?',id))return fail('모델을 찾을 수 없습니다.',404);run('UPDATE models SET name=?,profile=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',b.name,b.profile,id);return json({id});}
 const mid=randomUUID();run('INSERT INTO models(id,name,profile,prompt) VALUES(?,?,?,?)',mid,b.name,b.profile||profile,identity);return json({id:mid});
 }
 if(resource==='products'){
 if(method==='GET')return json(id?one('SELECT * FROM products WHERE id=?',id):all('SELECT * FROM products ORDER BY created_at DESC'));
 const b=z.object({name:z.string().min(1).max(100)}).parse(await req.json());const pid=randomUUID();run('INSERT INTO products(id,name) VALUES(?,?)',pid,b.name);return json({id:pid});
 }
 if(resource==='uploads'&&method==='POST'){
 if(Number(req.headers.get('content-length'))>21*1024*1024)return fail('파일은 20MB 이하로 업로드해 주세요.',413);
 const chunks:Uint8Array[]=[];let total=0;const reader=req.body?.getReader();if(!reader)return fail('파일이 필요합니다.');while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>21*1024*1024){await reader.cancel();return fail('업로드 용량을 초과했습니다.',413);}chunks.push(value);}const bounded=new Request(req.url,{method:'POST',headers:{'Content-Type':req.headers.get('content-type')||''},body:Buffer.concat(chunks)});const form=await bounded.formData();const owner=String(form.get('owner_id'));const role=z.enum(roles).parse(form.get('role'));const file=form.get('file');
 if(!(file instanceof File)||file.size>20*1024*1024||!file.size)return fail('유효한 20MB 이하 이미지가 필요합니다.');
 const modelRole=['face','body','reference'].includes(role);
 if(!one(`SELECT id FROM ${modelRole?'models':'products'} WHERE id=?`,owner))return fail('등록 대상을 찾을 수 없습니다.',404);
 if(!modelRole&&one('SELECT id FROM jobs WHERE product_id=?',owner))return fail('촬영을 시작한 상품은 수정할 수 없습니다. 새 상품을 등록해 주세요.',409);
 if(all('SELECT id FROM assets WHERE owner_id=?',owner).length>=24)return fail('대상별 최대 24장까지 등록할 수 있습니다.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))return fail('JPG, PNG, WEBP만 지원합니다.');
 const bytes=Buffer.from(await file.arrayBuffer());const meta=await sharp(bytes,{limitInputPixels:40000000}).metadata();
 if(!['jpeg','png','webp'].includes(meta.format||'')||!meta.width||!meta.height||(meta.pages||1)>1)return fail('지원하지 않는 이미지입니다.');
 const aid=randomUUID(),dest=path.join(root,'files',aid+'.png');await writeFile(dest,await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).png().toBuffer(),{mode:0o600});run('INSERT INTO assets VALUES(?,?,?,?,?,?)',aid,owner,role,file.name.slice(0,200),dest,'image/png');return json({id:aid,role,filename:file.name});
 }
 if(resource==='assets'){
 const asset=one<Asset>('SELECT * FROM assets WHERE id=?',id);if(!asset)return fail('이미지를 찾을 수 없거나 보관 기간이 만료되었습니다.',404);if(assetExpired(asset.owner_id))return fail('7일 보관 기간이 만료된 이미지입니다.',410);
 if(method==='DELETE'){
 if(asset.role as string==='result'||one("SELECT id FROM jobs WHERE snapshot LIKE ?",'%'+id+'%'))return fail('촬영에 사용된 참조는 삭제할 수 없습니다.',409);
 run('DELETE FROM assets WHERE id=?',id);await unlink(asset.path);return json({ok:true});}
 const linked=one<{job_id:string;plan:string}>('SELECT job_id,plan FROM shots WHERE image_id=?',id);const filename=linked?`PRODUCT_${linked.job_id.slice(0,8)}_${JSON.parse(linked.plan).shot_type}_${id.slice(0,8)}`:id;const fmt=new URL(req.url).searchParams.get('format');const bytes=await readFile(asset.path);const data=fmt==='jpg'?await sharp(bytes).jpeg({quality:95}).toBuffer():bytes;
 return new Response(new Uint8Array(data),{headers:{'Content-Type':fmt==='jpg'?'image/jpeg':asset.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(fmt?{'Content-Disposition':`attachment; filename="${filename}.${fmt==='jpg'?'jpg':'png'}"`}:{})}});
 }
 if(resource==='jobs'){
 if(id&&!jobAvailable(id))return fail('작업을 찾을 수 없거나 7일 보관 기간이 만료되었습니다.',410);
 if(method==='GET'&&action==='zip'){
 const shots=all<{image_id:string;plan:string}>("SELECT image_id,plan FROM shots WHERE job_id=? AND image_id IS NOT NULL",id);if(!shots.length)return fail('다운로드 가능한 이미지가 없습니다.');
 const zip=new JSZip();const counts:Record<string,number>={};const fmt=new URL(req.url).searchParams.get('format')==='png'?'png':'jpg';
 for(const s of shots){const type=JSON.parse(s.plan).shot_type;counts[type]=(counts[type]||0)+1;const a=one<Asset>('SELECT * FROM assets WHERE id=?',s.image_id)!;const b=await readFile(a.path);zip.file(`PRODUCT_${id.slice(0,8)}_${type}_${String(counts[type]).padStart(2,'0')}.${fmt}`,fmt==='jpg'?await sharp(b).jpeg({quality:95}).toBuffer():b);}
 return new Response(new Uint8Array(await zip.generateAsync({type:'nodebuffer'})),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="HI_ESOL_photoshoot.zip"','Cache-Control':'no-store'}});
 }
 if(method==='GET'){if(!id)return json(all("SELECT jobs.id,jobs.status,jobs.created_at,jobs.expires_at,products.name AS product_name,(SELECT image_id FROM shots WHERE job_id=jobs.id AND image_id IS NOT NULL ORDER BY rowid LIMIT 1) AS thumbnail_id FROM jobs JOIN products ON products.id=jobs.product_id WHERE jobs.expires_at>? ORDER BY jobs.created_at DESC",Date.now()));const j=one('SELECT id,product_id,model_id,options,status,error,created_at,expires_at FROM jobs WHERE id=?',id);if(!j)return fail('작업을 찾을 수 없습니다.',404);return json({...j,analysis:one('SELECT analysis FROM products WHERE id=?',String(j.product_id))?.analysis,shots:all('SELECT * FROM shots WHERE job_id=? ORDER BY rowid',id)});}
 if(action==='retry'){run("UPDATE jobs SET status='queued',error=NULL WHERE id=? AND status='failed'",id);return json({ok:true});}
 const b=z.object({product_id:z.string(),model_id:z.string(),options:optionsSchema,idempotency:z.string().uuid()}).parse(await req.json());
 const old=one('SELECT id FROM jobs WHERE idempotency=?',b.idempotency);if(old){if(!jobAvailable(String(old.id)))return fail('이 촬영의 보관 기간이 만료되었습니다. 새 상품 촬영을 시작해 주세요.',410);return json(old);}
 if(!process.env.OPENAI_API_KEY)return fail('서버에 OPENAI_API_KEY를 설정해 주세요.',503);
 const model=one('SELECT * FROM models WHERE id=?',b.model_id);const assets=all<Asset>('SELECT * FROM assets WHERE owner_id IN (?,?)',b.model_id,b.product_id);
 if(!model||!one('SELECT id FROM products WHERE id=?',b.product_id)||!assets.some(a=>a.role==='cutout')||!assets.some(a=>['face','reference'].includes(a.role)))return fail('모델 얼굴 또는 설정집과 상품 누끼컷이 필요합니다.');
 const jid=transaction(()=>{const active=one<{id:string}>("SELECT id FROM jobs WHERE product_id=? AND status IN ('queued','analyzing','planning','running') AND expires_at>?",b.product_id,Date.now());if(active)return active.id;const jid=randomUUID();run('INSERT INTO jobs(id,product_id,model_id,options,idempotency,snapshot) VALUES(?,?,?,?,?,?)',jid,b.product_id,b.model_id,JSON.stringify(b.options),b.idempotency,JSON.stringify({model,assets}));return jid;});return json({id:jid});
 }
 if(resource==='shots'&&method==='POST'){
 const shot=one<{status:string;job_id:string;plan:string;image_id:string|null;review:string|null}>('SELECT * FROM shots WHERE id=?',id);if(!shot)return fail('촬영 컷을 찾을 수 없습니다.',404);if(!jobAvailable(shot.job_id))return fail('7일 보관 기간이 만료된 촬영입니다.',410);
 if(action==='approve'){if(!shot.image_id||shot.status!=='done')return fail('완료된 이미지만 승인할 수 있습니다.');run('UPDATE shots SET approved=1 WHERE id=?',id);return json({ok:true});}
 if(['queued','generating','reviewing','review_pending'].includes(shot.status))return fail('이미 처리 중입니다.',409);
 const b=z.object({feedback:z.string().max(2000).default(''),scene:z.string().max(500).optional(),pose:z.string().max(500).optional(),hairstyle:z.string().max(500).optional()}).parse(await req.json());
 const plan=JSON.parse(shot.plan);for(const k of ['scene','pose','hairstyle'] as const)if(b[k])plan[k]=b[k];
 const changed=transaction(()=>{const fresh=one<{status:string}>('SELECT status FROM shots WHERE id=?',id);if(!fresh||['queued','generating','reviewing','review_pending'].includes(fresh.status))return false;run('INSERT INTO history(shot_id,image_id,plan,review) VALUES(?,?,?,?)',id,shot.image_id,shot.plan,shot.review);run("UPDATE shots SET status='queued',plan=?,feedback=?,error=NULL,approved=0,revision=revision+1 WHERE id=?",JSON.stringify(plan),[shot.review||'',b.feedback].join('\n'),id);run("UPDATE jobs SET status='running' WHERE id=?",shot.job_id);return true;});return changed?json({ok:true}):fail('이미 처리 중입니다.',409);
 }
 return fail('요청을 찾을 수 없습니다.',404);
 }catch(e){if(e instanceof z.ZodError)return fail('입력값을 확인해 주세요: '+e.issues.map(i=>i.path.join('.')+': '+i.message).join(', '));console.error(e instanceof Error?e.name:'RequestError');return fail('요청을 처리하지 못했습니다. 파일 형식과 입력값을 확인해 주세요.',500);}
}
export {handler as GET,handler as POST,handler as PATCH,handler as DELETE};
