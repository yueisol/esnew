import {createHash} from 'node:crypto';
import type {Analysis,Options,Plan} from './schema';
type Variant={pose:string;setting?:string;seated?:boolean};
const variants:Record<string,Variant[]>={
 LIFESTYLE_0:[
  {pose:'한 발을 앞으로 내딛는 순간, 양팔은 자연스럽게 서로 다른 높이로 움직이기'},
  {pose:'걷다가 잠깐 멈춰 뒤쪽 다리에 체중을 싣고 팔을 편안히 내리기'},
  {pose:'발목을 가볍게 교차해 서고 한 손만 귀 옆 잔머리를 정리하기'},
  {pose:'한 발을 낮은 계단에 올려 쉬며 옷의 앞면을 가리지 않고 팔을 내리기',setting:'낮고 넓은 계단 한 칸을 포함한 보행 공간'},
  {pose:'느린 걸음으로 옆을 지나가면서 시선만 먼 곳으로 두기'},
  {pose:'기둥에 어깨 끝만 살짝 기대고 앞발을 가볍게 뻗기',setting:'자연스러운 보행 동선 옆 기둥'},
 ],
 LIFESTYLE_1:[
  {pose:'창틀 옆에 서서 한 손을 몸 바깥쪽 창틀에 살짝 얹고 시선을 내리기',setting:'몸 옆으로 낮은 창틀이 있는 창가'},
  {pose:'높은 스툴에 걸터앉고 두 발을 바닥에 두며 상체를 곧게 유지하기',setting:'팔걸이 없는 높은 스툴',seated:true},
  {pose:'팔을 서로 다른 높이로 편하게 내리고 어깨 끝만 벽에 기대기'},
  {pose:'넓은 벤치 끝에 앉아 한 손은 몸 옆 좌면에 두고 다른 손은 옆으로 내리기',setting:'팔걸이 없는 넓은 벤치',seated:true},
  {pose:'상품을 가리지 않도록 몸 바깥쪽에서 한 손을 귀 뒤로 넘기며 서 있기'},
  {pose:'책상 모서리에 몸을 기대지 않고 옆에 서서 한 손끝만 가볍게 대기',setting:'모델 옆 허리 높이의 미니멀한 테이블'},
 ],
 LIFESTYLE_2:[
  {pose:'몸은 사선 후면을 유지하며 카메라에서 멀어지는 짧은 걸음을 내딛기'},
  {pose:'사선 후면으로 멈춰 서서 한쪽 발끝만 옆으로 두기, 뒤돌아보지 않기'},
  {pose:'카메라 반대쪽 낮은 계단을 한 칸 오르는 순간, 머리와 몸은 진행 방향 유지',setting:'높이가 낮고 넓은 계단'},
  {pose:'사선 후면으로 서서 몸 옆 난간에 한 손끝만 가볍게 대기',setting:'옷을 가리지 않는 낮은 난간'},
  {pose:'사선 후면으로 천천히 걷다가 멈춘 순간, 양팔은 자연스럽게 비대칭으로 내리기'},
  {pose:'사선 후면으로 한 발에 체중을 싣고 다른 발을 뒤로 짧게 빼기, 머리는 정면 진행 방향 유지'},
 ],
 MIRROR_0:[
  {pose:'정면 전신 거울 앞에서 한 발을 앞으로 두고 빈손은 몸 옆으로 내리기'},
  {pose:'정면 전신 거울 앞에서 양발을 골반 너비로 두고 빈손만 귀 옆에 살짝 대기'},
  {pose:'정면 전신 거울 앞에서 한 발끝을 옆으로 뻗고 어깨는 편안히 유지하기'},
  {pose:'정면 전신 거울 앞에서 한쪽 뒤꿈치를 가볍게 들고 빈손은 몸 바깥으로 내리기'},
  {pose:'정면 전신 거울 앞에서 발목만 느슨하게 교차하고 상체는 곧게 서기'},
  {pose:'정면 전신 거울 앞에서 짧은 걸음을 멈춘 순간을 촬영하고 빈손은 자연스럽게 내리기'},
 ],
 MIRROR_1:[
  {pose:'사선으로 서서 한쪽 다리에 체중을 싣고 빈손은 뒤쪽 허벅지 옆으로 내리기'},
  {pose:'사선으로 서서 빈손으로 귀 뒤의 머리카락만 정리하기'},
  {pose:'사선으로 서서 앞발을 살짝 빼고 빈손은 옆 테이블에 가볍게 대기',setting:'반사 안쪽 몸 옆에 낮은 테이블'},
  {pose:'사선으로 서서 빈손을 몸 바깥쪽 의자 등받이에 가볍게 얹기',setting:'몸을 가리지 않는 옆쪽 의자'},
  {pose:'사선으로 서서 뒷발에 체중을 두고 빈손 손끝은 자연스럽게 펴기'},
  {pose:'사선으로 선 채 한 발을 반 걸음 옮기고 빈손은 옆으로 편안히 내리기'},
 ],
 MIRROR_2:[
  {pose:'거울 앞 낮은 스툴에 사선으로 앉아 두 발을 바닥에 두고 빈손은 몸 옆 좌면에 놓기',setting:'팔걸이 없는 낮은 스툴'},
  {pose:'거울 앞 벤치 끝에 사선으로 앉아 한 발만 앞으로 빼고 등을 곧게 유지하기',setting:'낮은 미니멀 벤치'},
  {pose:'거울 앞 의자 끝에 사선으로 앉아 발목을 느슨하게 교차하고 빈손은 옆으로 내리기',setting:'팔걸이 없는 의자'},
  {pose:'거울 앞 높은 스툴에 사선으로 걸터앉고 발은 낮은 발판에 나란히 놓기',setting:'발판 있는 높은 스툴'},
  {pose:'거울 앞 벤치에 사선으로 앉아 몸을 조금 앞으로 기울이되 판매 상품을 접어 가리지 않기',setting:'넓은 벤치'},
  {pose:'거울 앞 의자에 사선으로 앉아 한 발끝을 옆으로 두고 빈손은 몸 바깥쪽으로 내리기',setting:'단순한 등받이 의자'},
 ],
 STUDIO_0:[
  {pose:'정면으로 서서 한 발만 반 걸음 앞으로 두고 팔을 자연스럽게 내리기'},
  {pose:'정면으로 서서 양발을 골반 너비로 벌리고 양팔을 편하게 내리기'},
  {pose:'정면을 유지한 채 발목만 느슨하게 교차하고 어깨를 편안히 내리기'},
  {pose:'정면으로 한쪽 다리에 체중을 싣되 골반과 어깨는 카메라와 평행하게 유지하기'},
  {pose:'정면으로 서서 한쪽 무릎만 부드럽게 이완하고 양손은 허벅지 바깥에 내리기'},
  {pose:'정면으로 서서 한 발끝만 옆으로 살짝 두고 팔은 몸 옆에서 편안하게 펴기'},
 ],
 STUDIO_1:[
  {pose:'몸통과 골반을 정확한 측면으로 두고 한 발만 앞으로 뻗어 정지하기'},
  {pose:'몸통과 골반을 정확한 측면으로 두고 양발을 나란히 모아 편하게 서기'},
  {pose:'정확한 측면을 유지하며 한쪽 뒤꿈치를 가볍게 들어 보행 중간 동작 만들기'},
  {pose:'정확한 측면으로 서서 한 손끝을 몸 뒤쪽 의자 등받이에 가볍게 대기',setting:'모델 뒤쪽의 낮은 의자'},
  {pose:'정확한 측면으로 뒷다리에 체중을 싣고 양팔은 서로 겹치지 않게 내리기'},
  {pose:'정확한 측면으로 짧게 한 걸음 내딛고 팔은 몸통 디자인을 가리지 않게 자연스럽게 움직이기'},
 ],
 STUDIO_2:[
  {pose:'사선으로 뒷다리에 체중을 싣고 앞다리를 길게 뻗어 비대칭 라인을 만들며 한 손만 귀 옆에 올리는 모델 화보 포즈'},
  {pose:'사선으로 선 채 한 발을 옆으로 길게 두고 한 손끝은 몸 바깥 의자 등받이에 얹어 어깨와 팔의 비대칭 라인을 만드는 화보 포즈',setting:'모델 옆에 놓인 미니멀한 의자'},
  {pose:'사선 워킹 중 앞발이 바닥에 닿는 순간을 멈춰 다리와 양팔이 서로 다른 대각선을 이루는 런웨이 화보 포즈'},
  {pose:'사선으로 한 발을 낮은 단에 올리고 반대쪽 팔을 몸 바깥으로 부드럽게 벌려 여유 있는 선을 만드는 화보 포즈',setting:'신발 높이 정도의 낮은 촬영용 단'},
  {pose:'스툴 끝에 사선으로 앉아 상체를 길게 세우고 한 다리는 앞으로 뻗고 한 손은 옆 좌면에 두어 비대칭 실루엣을 만드는 화보 포즈',setting:'팔걸이 없는 낮은 촬영용 스툴',seated:true},
  {pose:'넓은 벤치 끝에 사선으로 앉아 한 다리는 옆으로 뻗고 한 손은 귀 옆으로 올려 어깨와 팔에 서로 다른 선을 만드는 화보 포즈',setting:'단순한 촬영용 벤치',seated:true},
 ],
 DETAIL_0:[
  {pose:'착용 모델이 편안히 서서 구조적 디테일을 정면으로 드러내고 팔은 화면 밖으로 내리기'},
  {pose:'착용 모델이 어깨를 이완해 넥라인이나 허리 여밈의 실제 구조를 자연스럽게 보여주기'},
  {pose:'착용 모델이 앞발로 체중을 조금 옮겨 구조적 봉제선의 입체감을 보여주기'},
  {pose:'착용 모델이 몸을 아주 조금 회전한 상태로 멈춰 구조적 디테일을 가까이 드러내기'},
 ],
 DETAIL_1:[
  {pose:'착용 모델이 팔을 편안히 내려 실제 원단의 세로 드레이프와 밑단을 보여주기'},
  {pose:'착용 모델이 체중을 반대 발로 조금 옮겨 소재의 자연스러운 작은 주름을 보여주기'},
  {pose:'착용 모델이 몸을 살짝 틀어 봉제선 옆 원단에 자연스러운 명암을 만들기'},
  {pose:'착용 모델이 몸을 이완하고 손은 촬영 부위 밖으로 두어 원단 조직만 또렷하게 드러내기'},
 ],
};
function rank(seed:string,key:string){return createHash('sha256').update(seed+'|'+key).digest().readUInt32BE(0);}
function pick<T>(items:T[],seed:string,key:string){return items[rank(seed,key)%items.length];}
export function varyShot(plan:Plan,index:number,a:Analysis,o:Options,seed:string,recent:Plan[]):Plan{
 const slot=`${plan.shot_type}_${index}`;
 const choices=variants[slot].map((v,n)=>({...v,id:`${slot}:${n}`})).filter(v=>!v.seated||!['BOTTOM','DRESS'].includes(a.category));
 const previous=recent.find(p=>typeof p.variation_id==='string'&&p.variation_id.startsWith(slot+':'))?.variation_id;
 const eligible=choices.filter(v=>v.id!==previous);
 const frequency=(id:string)=>recent.filter(p=>p.variation_id===id).length;
 const selected=eligible.sort((a,b)=>frequency(a.id)-frequency(b.id)||rank(seed,a.id)-rank(seed,b.id))[0];
 const detail=plan.shot_type==='DETAIL';
 const studioFront=plan.shot_type==='STUDIO'&&index===0;
 const height=studioFront?'eye level':plan.shot_type==='MIRROR'?'face level beside the face':pick(['eye level','upper-chest level with a level horizon','slightly below eye level, with parallel vertical lines'],seed,slot+'height');
 const placement=studioFront?'Use a balanced central placement with breathing room on both sides.':pick(detail?['Center the selected seam or structure in the close crop.','Place the selected seam diagonally across the close crop; keep all texture in focus.']:['Place the model slightly left of centre with usable scene space on the right.','Place the model slightly right of centre with usable scene space on the left.','Use a balanced central placement with breathing room on both sides.'],seed,slot+'placement');
 const direction=pick(['left','right'],seed,slot+'side');
 let camera=plan.camera_angle;
 if(!detail){camera=camera.replace(/natural eye-level camera|environmental eye-level camera/g,`camera at ${height}`);camera+=` Camera height: ${height}. Keep the specified body rotation; no extreme high/low angle or wide-angle distortion.`;if((index>0&&plan.shot_type==='STUDIO'&&index!==2)||plan.shot_type==='LIFESTYLE'||(plan.shot_type==='MIRROR'&&index===1))camera+=` Photograph the model's ${direction} side while preserving the specified front/rear/side orientation.`;}
 const pose=selected.pose+(studioFront?' 얼굴·어깨·골반은 정면, 카메라 렌즈를 시크하게 응시하기.':'')+(plan.shot_type==='MIRROR'?` 스마트폰은 얼굴 옆에 들고 상품을 가리지 않기.${index<2?' 얼굴 전체 노출.':''}`:'');
 return {...plan,variation_id:selected.id,pose,scene:plan.scene+(selected.setting?` · ${selected.setting}`:''),camera_angle:camera,framing:plan.framing+' '+placement,
  expression:studioFront||plan.expression.includes('얼굴 노출 불필요')?plan.expression:pick(['은은한 미소, 턱과 눈에 힘을 빼기','입술을 편안히 둔 차분한 표정','시선을 카메라 살짝 옆에 둔 자연스러운 표정','미소가 막 사라지는 순간의 편안한 표정'],seed,slot+'expression'),
  hairstyle:o.hair==='자동 추천'?pick(['귀 뒤로 넘긴 긴 생머리','로우 포니테일','하프업','느슨하게 묶은 머리'],seed,slot+'hair'):o.hair,
  generation_prompt:plan.generation_prompt+' Follow this specific physical action and composition. Use a centered straight standing portrait only when explicitly required by the shot plan. Do not copy the pose or camera crop from the identity reference images. Keep hands and props clear of the garment, preserve fit and all mandatory coverage. For detail crops, apply only actions relevant to the product region; do not bring excluded face or body parts into view.',
 };
}
export function lifestyleScenes(cozy:boolean,seed:string):string[]{
 return pick(cozy?[
  ['따뜻한 자연광 카페 앞 보행 공간','차분한 쇼룸 창가','넓은 실내 계단과 복도'],
  ['밝은 갤러리 입구','미니멀한 갤러리 휴식 공간','긴 갤러리 복도'],
  ['차분한 실내 아트리움','자연광 실내 라운지','넓은 실내 회랑'],
  ['모던한 쇼룸 입구','정돈된 쇼룸 창가 공간','넓은 쇼룸 통로'],
 ]:[
  ['밝은 도심 카페 거리','모던한 건물 외벽','넓은 자연광 테라스'],
  ['밝은 중정 보행로','중정 옆 그늘진 벽','넓은 중정 산책길'],
  ['미니멀한 건물 앞 광장','건물 입구의 자연광 공간','건물 뒤편의 넓은 보행로'],
  ['차분한 도시 골목 입구','쇼룸 바깥 그늘진 공간','넓은 야외 보행 통로'],
 ],seed,'location-family');
}
