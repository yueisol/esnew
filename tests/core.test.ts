import {test} from 'node:test';import assert from 'node:assert/strict';
import {planShots,prompt,references,reviewInstruction} from '../src/lib/planner';import {analysisSchema,optionsSchema,type Asset} from '../src/lib/schema';import {retry,ApiError} from '../src/lib/openai';
export const analysis=analysisSchema.parse({category:'TOP',subcategory:'니트',main_color:'블랙',secondary_color:'없음',pattern:'무지',material:'추정 울',texture:'골지',fit:'슬림',silhouette:'일자',neckline:'라운드',shoulder_structure:'기본',sleeve_length:'긴소매',garment_length:'허리',waistline:'일자',hemline:'일자',fastening:'없음',design_details:['골지'],unique_features:[],styling_recommendations:['크림 팬츠','데님'],visual_uncertainties:['혼용률 확인 불가']});
test('new and legacy count inputs produce 11 independent plans with three fixed studio roles',()=>{for(const count of [10,11] as const){const plans=planShots(analysis,optionsSchema.parse({count}));assert.equal(plans.length,11);assert.equal(new Set(plans.map(p=>p.shot_id)).size,11);assert.equal(plans.filter(p=>p.shot_type==='STUDIO').length,3);assert.equal(new Set(plans.map(p=>p.scene+p.pose)).size,11);assert.match(plans[0].framing,/entire top/i);assert.match(plans[3].pose,/얼굴 전체 노출/);assert.match(plans[4].pose,/얼굴 전체 노출/);}const lower=planShots({...analysis,category:'BOTTOM'},optionsSchema.parse({}));assert.match(lower[0].framing,/Waist through feet/);});
test('reference selection preserves identity and each product role under cap',()=>{const assets=Array.from({length:30},(_,i)=>({id:String(i),role:i===27?'face':i===28?'mannequin':i===29?'detail':'cutout'})) as Asset[];const refs=references(assets);assert.equal(refs.length,16);assert.equal(refs[0].role,'face');assert.ok(refs.some(a=>a.role==='detail'));const p=prompt({profile:'model',prompt:'same face'},analysis,planShots(analysis,optionsSchema.parse({}))[0],refs);assert.match(p,/Reference 1: face/);assert.match(p,/never a collage/);assert.match(p,/exact count/);});
test('retry only transient errors, bounded exponential backoff',async()=>{let calls=0;const sleeps:number[]=[];assert.equal(await retry(async()=>{if(++calls<3)throw new ApiError('rate limit',429);return 'ok';},async n=>{sleeps.push(n);}), 'ok');assert.equal(calls,3);assert.ok(sleeps[1]>sleeps[0]);calls=0;await assert.rejects(retry(async()=>{calls++;throw new ApiError('unauthorized',401);},async()=>{}));assert.equal(calls,1);});

test('every category and count includes wide rear view, true profile, full-body mirror and face-free detail crops',()=>{
 for(const category of ['TOP','BOTTOM','DRESS','OUTER','SET','OTHER'] as const){
  for(const count of [10,11] as const){
   const plans=planShots({...analysis,category},optionsSchema.parse({count}));
   const lifestyle=plans.filter(p=>p.shot_type==='LIFESTYLE');
   assert.match(lifestyle[0].framing,/50–65%/);
   assert.match(lifestyle[2].camera_angle,/Rear three-quarter/);
   assert.match(lifestyle[2].framing,/Entire head and both shoes/);
   assert.match(lifestyle[2].framing,/face need not be visible/);
   assert.match(lifestyle[1].camera_angle,/45–60 degrees/);
   const studio=plans.filter(p=>p.shot_type==='STUDIO');
   assert.match(studio[1].camera_angle,/90-degree side profile/);
   assert.match(studio[2].camera_angle,/Editorial front three-quarter/);assert.match(studio[2].pose,/화보 포즈/);
   const mirror=plans.filter(p=>p.shot_type==='MIRROR');
   assert.match(mirror[0].framing,/entire head, both feet and both shoes/);
   for(const detail of plans.filter(p=>p.shot_type==='DETAIL')){
    assert.match(detail.framing,/entire face and head OUT/);
    assert.match(detail.framing,/80–95%/);
    assert.match(detail.framing,/Do NOT show the whole garment/);
    assert.doesNotMatch(detail.framing,/Show the entire top/);
    const text=prompt({profile:'same adult model',prompt:'preserve identity'},analysis,detail,[]);
    assert.match(text,/MANDATORY COMPOSITION/);
    assert.match(text,/NOT camera framing/);
    assert.match(reviewInstruction(detail),/not as an error by itself/);
   }
  }
 }
});
test('detail focus respects garment category and explicit hairstyle survives composition changes',()=>{
 const top=planShots(analysis,optionsSchema.parse({hair:'웨이브'}));
 assert.ok(top.every(p=>p.hairstyle==='웨이브'));
 const detail=top.filter(p=>p.shot_type==='DETAIL');
 assert.match(detail[0].framing,/neckline, shoulder seam/);
 assert.match(detail[1].framing,/fabric weave, sleeve cuff/);
 const bottom=planShots({...analysis,category:'BOTTOM'},optionsSchema.parse({})).filter(p=>p.shot_type==='DETAIL');
 assert.match(bottom[0].framing,/waistband, hip/);
 assert.doesNotMatch(bottom[0].framing,/neckline/);
});
test('new and saved plans receive photographic rendering and grain-aware inspection',()=>{
 const plans=planShots(analysis,optionsSchema.parse({}));
 for(const p of plans){const text=prompt({profile:'same model',prompt:'preserve face'},analysis,{...p,lighting:'Legacy lighting'},[]);assert.match(text,/PHOTOGRAPHIC RENDERING/);assert.match(text,/faithful product color/);assert.match(text,/No CGI gloss/);assert.match(reviewInstruction(p),/grain is intentional/);}
});
test('new shoots avoid the previous pose in each slot and balance recent selections',()=>{
 let recent:ReturnType<typeof planShots>=[];let previous:ReturnType<typeof planShots>=[];
 const seen=new Map<string,Set<string>>();
 for(let n=0;n<12;n++){
  const plans=planShots(analysis,optionsSchema.parse({count:11}),{seed:'shoot-'+n,recent});
  for(const [i,p] of plans.entries()){
   assert.ok(p.variation_id);
   if(previous.length){assert.notEqual(p.variation_id,previous[i].variation_id);assert.notEqual(p.pose,previous[i].pose);}
   const slot=p.variation_id!.split(':')[0];const choices=seen.get(slot)||new Set<string>();choices.add(p.variation_id!);seen.set(slot,choices);
   // First four shoots use different action variants, not only different backgrounds or shot IDs.
   if(n<4)assert.equal(choices.size,n+1);
  }
  previous=plans;recent=[...plans,...recent].slice(0,110);
 }
 assert.ok([...seen.values()].every(s=>s.size>=4));
});
test('same job seed yields stable plan content while different jobs vary framing and actions',()=>{
 const options=optionsSchema.parse({hair:'긴 생머리',notes:'미니멀한 코디'});
 const withoutIds=(plans:ReturnType<typeof planShots>)=>plans.map(({shot_id,...p})=>p);
 const first=planShots(analysis,options,{seed:'one'}),again=planShots(analysis,options,{seed:'one'});
 assert.deepEqual(withoutIds(first),withoutIds(again));
 const second=planShots(analysis,options,{seed:'two',recent:first});
 assert.ok(second.every((p,i)=>p.pose!==first[i].pose));
 assert.ok(second.some((p,i)=>p.camera_angle!==first[i].camera_angle||p.framing!==first[i].framing));
 assert.ok(second.every(p=>p.hairstyle==='긴 생머리'&&p.generation_prompt.includes('미니멀한 코디')));
 assert.ok(second.every(p=>p.generation_prompt.includes('Do not copy the pose')));
});
test('category coverage and legacy plans remain compatible with variation',()=>{
 const old=planShots(analysis,optionsSchema.parse({}),{seed:'old'}).map(({variation_id,...p})=>p);
 for(const category of ['BOTTOM','DRESS'] as const){
  for(let i=0;i<20;i++){
   const plans=planShots({...analysis,category},optionsSchema.parse({}),{seed:String(i),recent:old});
   const middle=plans.filter(p=>p.shot_type==='LIFESTYLE')[1];
   assert.doesNotMatch(middle.pose,/앉|걸터/);assert.match(middle.framing,/Full-length/);
   assert.match(plans.filter(p=>p.shot_type==='MIRROR')[0].framing,/entire head, both feet and both shoes/);
  }
 }
});

test('studio roles stay front/chic direct gaze, profile and editorial across moods and history',()=>{
 assert.equal(optionsSchema.parse({}).count,11);
 assert.equal(optionsSchema.parse({count:10}).count,11);
 for(const category of ['TOP','BOTTOM','DRESS','OUTER','SET','OTHER'] as const){
  let recent:ReturnType<typeof planShots>=[];
  for(let i=0;i<24;i++){
   const plans=planShots({...analysis,category},optionsSchema.parse({mood:i%2?'러블리':'캐주얼',hair:'웨이브'}),{seed:'studio-'+i,recent});
   const [front,side,editorial]=plans.filter(p=>p.shot_type==='STUDIO');
   assert.deepEqual(plans.map(p=>p.shot_type),['LIFESTYLE','LIFESTYLE','LIFESTYLE','MIRROR','MIRROR','MIRROR','STUDIO','STUDIO','STUDIO','DETAIL','DETAIL']);
   assert.match(front.camera_angle,/Straight front view at eye level/);
   assert.match(front.camera_angle,/direct eye contact/);
   assert.match(front.pose,/얼굴·어깨·골반은 정면/);
   assert.match(front.expression,/시크.*웃지 않기/);
   assert.doesNotMatch(front.expression,/미소|옆/);
   assert.match(front.generation_prompt,/No side gaze, smile or turned head/);
   assert.match(side.camera_angle,/True 90-degree side profile/);
   assert.match(side.expression,/얼굴 노출 불필요/);
   assert.match(editorial.camera_angle,/Editorial front three-quarter.*30–45 degrees/);
   assert.match(editorial.pose,/사선.*화보 포즈/);
   assert.doesNotMatch(editorial.pose,/정후면|뒤돌아/);
   assert.match(editorial.framing,/Full-length/);
   if(category==='BOTTOM'||category==='DRESS')assert.doesNotMatch(editorial.pose,/앉|걸터/);
   assert.ok(plans.every(p=>p.hairstyle==='웨이브'));
   assert.match(prompt({profile:'model',prompt:'same face'},analysis,front,[]),/MANDATORY STUDIO ROLE 1\/3/);
   assert.match(reviewInstruction(front),/off-camera gaze or smile instead of the chic direct-gaze studio front/);
   recent=[...plans,...recent].slice(0,110);
  }
 }
});
