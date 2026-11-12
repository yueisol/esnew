// TEST ONLY. This process intercepts all OpenAI calls; no network or paid API use.
import {appendFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const image=await sharp({create:{width:1024,height:1536,channels:3,background:'#bbbfaa'}}).png().toBuffer();
const analysis={category:'TOP',subcategory:'니트',main_color:'블랙',secondary_color:'없음',pattern:'무지',material:'추정 울',texture:'골지',fit:'슬림',silhouette:'일자',neckline:'라운드',shoulder_structure:'기본',sleeve_length:'긴소매',garment_length:'허리',waistline:'일자',hemline:'일자',fastening:'없음',design_details:['골지'],unique_features:[],styling_recommendations:['크림 팬츠'],visual_uncertainties:['혼용률 확인 불가']};
const review={passed:true,issues:[],face_consistency:'mock',body_consistency:'mock',product_preservation:'mock',anatomy:'mock',mirror_physics:'mock',visibility:'mock',shot_compliance:'mock',similarity:'mock'};
let delayed=false;
globalThis.fetch=async(input,init)=>{if(!String(input).startsWith('https://api.openai.com/'))throw new Error('Mock prevents external calls');if(String(input).endsWith('images/edits')){
 if(process.env.TEST_STABILITY==='1'){
  const prompt=String((init!.body as FormData).get('prompt'));
  await appendFile(path.join(process.env.DATA_DIR!,'requests.log'),prompt.includes('[SLOW]')?'slow\n':'normal\n');
  if(prompt.includes('[SLOW]'))await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,10000);const abort=()=>{clearTimeout(timer);reject(init!.signal!.reason);};if(init!.signal?.aborted)abort();else init!.signal?.addEventListener('abort',abort,{once:true});});
 }
 return Response.json({data:[{b64_json:image.toString('base64')}]});}
const b=JSON.parse(String(init?.body));if(b.text.format.name==='quality_review'&&!delayed&&process.env.TEST_STABILITY!=='1'){delayed=true;await new Promise(r=>setTimeout(r,10000));}return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(b.text.format.name==='garment_analysis'?analysis:review)}]}]});};
await import('../src/lib/worker');
