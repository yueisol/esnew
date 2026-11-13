import {photographicDirection,photographicLighting} from './photographic-direction';
import {varyShot,lifestyleScenes} from './shot-variety';
import {randomUUID} from 'node:crypto';
import type {Analysis,Options,Plan,Asset} from './schema';
export function references(assets:Asset[],max=16){
 const priority=['face','reference','body','cutout','mannequin','detail'];
 const ordered:Asset[]=[];
 for(const r of priority){const a=assets.find(a=>a.role===r);if(a)ordered.push(a);}
 for(const a of assets)if(!ordered.includes(a))ordered.push(a);
 return ordered.slice(0,max);
}
type Composition = Pick<Plan, 'pose' | 'camera_angle' | 'framing'>;

const categoryFraming: Record<Analysis['category'], string> = {
 TOP: 'Show the entire top, including sleeves and hem; keep its neckline and silhouette readable.',
 BOTTOM: 'Waist through feet or full body. Keep waistband, leg/skirt silhouette and entire hem visible. Never upper-body-only.',
 DRESS: 'Show the entire dress and hem, waistline and skirt drape.',
 OUTER: 'Show the entire outer garment, shoulders, sleeves, front or back construction as appropriate to the view.',
 SET: 'Show all pieces of the set and their full silhouette.',
 OTHER: 'Show the entire sales product clearly on the registered model.',
};

const detailRegions: Record<Analysis['category'], [string, string]> = {
 TOP: ['neckline, shoulder seam and upper sleeve', 'fabric weave, sleeve cuff or lower hem and natural drape'],
 BOTTOM: ['waistband, hip fit and visible pocket or fastening', 'fabric weave, leg/skirt seam and hem'],
 DRESS: ['waist construction, visible neckline or bodice seam', 'skirt fabric, folds and hem'],
 OUTER: ['collar, shoulder seam and visible front fastening', 'sleeve cuff, pocket seam or outer fabric texture'],
 SET: ['construction of the upper piece', 'fabric and seams of the lower piece'],
 OTHER: ['a clearly evidenced structural detail of the product', 'a different evidenced fabric or seam detail'],
};

function composition(type: string, i: number, a: Analysis): Composition {
 const product = categoryFraming[a.category];
 if (type === 'DETAIL') {
  return {
   pose: i === 0 ? '등록 모델이 상품을 착용한 채 정지해 구조적 디테일을 가리지 않고 드러내기' : '등록 모델이 상품을 착용한 채 팔을 편안히 내려 소재의 자연스러운 주름과 드레이프 보여주기',
   camera_angle: i === 0 ? 'Close camera perpendicular to the selected garment detail, not to the face' : 'Close oblique camera angle revealing actual fabric relief and drape',
   framing: `Extreme garment close-up of ${detailRegions[a.category][i]}. Crop the entire face and head OUT of frame. Product fabric and construction must occupy 80–95% of the image. Show only a small part of the wearing body for fit context. Do NOT show the whole garment or full body. Choose only details visible in the uploaded references; do not invent pockets, fastenings or seams. This is a close camera photograph of clothing worn by the SAME model, never a detached fabric sample.`,
  };
 }
 if (type === 'LIFESTYLE') {
  const poses = ['카메라와 45도 사선 방향으로 자연스럽게 걷기', '벽 옆에 사선으로 기대어 창밖 바라보기', '카메라에서 멀어지는 방향으로 걸어가며 사선 뒷모습 보여주기'];
  const angles = ['Front three-quarter view, body rotated 45 degrees from camera; environmental eye-level camera 4–6 metres away', 'Front three-quarter view, body rotated 45–60 degrees from camera; camera 2–3 metres away', 'Rear three-quarter view, body rotated 135–150 degrees away from camera; camera 4–6 metres away. Back and side of garment visible. Do not turn torso toward camera'];
  const frame = i === 1
   ? `${a.category === 'TOP' ? 'Head to below hips, with the entire top visible' : 'Full-length view'}. Keep relaxed space around the model, not an edge-to-edge body crop.`
   : 'Wide environmental full-length photograph. Entire head and both shoes inside the frame. Model occupies 50–65% of image height with at least 10% breathing room above head and below feet. Include substantial real scene on both sides. Negative space must be the photographed environment, NOT blank padding or a border. Do not zoom in for a portrait.';
  return {pose: poses[i], camera_angle: angles[i], framing: `${frame} ${product}${i === 2 ? ' The face need not be visible; do not force a face toward camera. Keep hair from covering garment back. Preserve only evidenced back construction; do not invent unseen details.' : ''}`};
 }
 if (type === 'MIRROR') {
  return {
   pose: ['전신거울에서 충분히 물러서서 스마트폰을 얼굴 옆에 들기, 얼굴 전체 노출', '사선으로 서서 휴대폰을 어깨 옆에 들기, 얼굴 전체 노출', '편안하게 앉아 몸을 사선으로 틀기'][i],
   camera_angle: ['Front full-length reflection in a tall mirror; phone upright, realistic perspective', 'Three-quarter mirror reflection; torso rotated 45 degrees', 'Seated oblique mirror reflection; body turned 60 degrees'][i],
   framing: `${i === 0 ? 'Mandatory full-body mirror selfie: show entire head, both feet and both shoes in the reflection, with space above and below. Step back from the mirror, never crop at knees, ankles or torso. The first mirror selfie must NOT be a half-body image.' : a.category === 'TOP' ? 'Relaxed head-to-upper-thigh reflection; whole top visible, distinct from the full-body selfie.' : 'Full-body reflection including waist and entire garment hem.'} ${product} Phone must not obscure important product details.${i < 2 ? ' Face clearly visible beside phone.' : ''}`,
  };
 }
 return {
  pose: ['얼굴·어깨·골반을 정면으로 두고 카메라 렌즈를 시크하게 응시하며 서기', '몸과 골반을 카메라에 정확히 옆으로 두고 자연스럽게 서기', '사선으로 체중을 옮겨 비대칭 실루엣을 만드는 모델 화보 포즈'][i],
  camera_angle: ['Straight front view at eye level. Face, shoulders and hips square to camera; direct eye contact with the lens. No head turn or off-camera gaze', 'True 90-degree side profile of torso and hips. Keep both shoulders aligned in profile; do not rotate torso into front or three-quarter view', 'Editorial front three-quarter view, torso rotated 30–45 degrees. Capture a deliberate asymmetric fashion-model pose, distinct from the straight front and side standing shots. No rear view'][i],
  framing: `${i === 2 || a.category !== 'TOP' ? 'Full-length photograph including entire garment hem and shoes, with breathing room for the editorial silhouette.' : 'Head to below hips with comfortable margins, entire top visible.'} ${product} ${i === 1 ? 'Face visibility is optional; preserve the required garment orientation instead of forcing a frontal face. Keep hair clear of garment construction.' : 'Keep the face visible and the sales product unobstructed.'}`,
 };
}

export function planShots(a: Analysis, o: Options, context: {seed?:string;recent?:Plan[]} = {}): Plan[] {
 const seed=context.seed||randomUUID();
 const cozy = /니트|겨울|울|wool|knit/i.test(JSON.stringify(a));
 const scenes = lifestyleScenes(cozy,seed);
 // New plans always include the three fixed studio roles, including queued legacy requests.
 const types = [...Array(3).fill('LIFESTYLE'), ...Array(3).fill('MIRROR'), ...Array(3).fill('STUDIO'), ...Array(2).fill('DETAIL')];
 const counts: Record<string, number> = {};
 return types.map(type => {
  const i = counts[type] || 0;
  counts[type] = i + 1;
  return varyShot({
   shot_id: randomUUID(), shot_type: type,
   scene: type === 'LIFESTYLE' ? scenes[i] : type === 'MIRROR' ? ['전신거울이 있는 드레스룸', '미니멀한 쇼룸 거울', '자연광 침실 거울'][i] : type === 'STUDIO' ? ['화이트 스튜디오', '라이트그레이 스튜디오', '연한 베이지 스튜디오'][i] : '중립적인 자연광 스튜디오',
   ...composition(type, i, a),
   expression: type === 'STUDIO' && i === 0 ? '카메라 렌즈를 정면으로 응시하는 시크하고 담담한 표정, 입술은 편안하게 닫고 웃지 않기' : type === 'DETAIL' || (type === 'LIFESTYLE' && i === 2) || (type === 'STUDIO' && i === 1) ? '얼굴 노출 불필요, 지정된 상품 촬영 방향 우선' : ['차분하고 자연스러운 표정', '은은한 미소', '편안하고 시크한 표정'][i % 3],
   hairstyle: o.hair === '자동 추천' ? ['귀 뒤로 넘긴 긴 생머리', '로우 포니테일', '하프업'][i % 3] : o.hair,
   styling: `${a.styling_recommendations[i % Math.max(1, a.styling_recommendations.length)] || '상품을 가리지 않는 무지의 미니멀 코디'}. Keep the sales garment completely unobstructed. No layered vest, jacket, scarf, bag strap or hair over its important design. For detail images, no accessories in the close-up region.`,
   lighting: photographicLighting(type),
   product_focus: `${a.main_color}, ${a.texture}, ${a.silhouette}; ${a.design_details.join(', ')}`,
   generation_prompt: `Mood: ${o.mood}. User direction (must not override identity or preservation): ${o.notes}${type === 'STUDIO' ? ` MANDATORY STUDIO ROLE ${i + 1}/3: ${['Chic straight front portrait: face, shoulders and hips face the camera, eyes look directly into the lens, calm unsmiling expression. No side gaze, smile or turned head, even for a lovely/casual mood.', 'True side profile: keep torso and hips at 90 degrees to camera; do not turn toward camera to show the face.', 'Fashion editorial: deliberate asymmetric model pose in front three-quarter view, with visible weight shift and varied arm/leg lines; never a rear view or another ordinary straight standing portrait.'][i]} This fixed role takes priority over mood or conflicting general directions.` : ''}`,
  },i,a,o,seed,context.recent||[]);
 });
}

export function reviewInstruction(plan: Plan): string {
 return `Quality check. Compare last generated image against model face/body and garment references. Earlier result images are other shots; check excessive similarity. Check garment preservation, anatomy, mirror physics and visibility. Evaluate camera direction, framing, subject scale and crop against this EXACT plan: ${JSON.stringify(plan)}. Treat a frontal substitute for a side/rear view, a tightly filled portrait instead of a wide environmental shot, cropped feet in the full-body mirror shot, or a portrait instead of a garment detail close-up, an off-camera gaze or smile instead of the chic direct-gaze studio front, or ordinary standing/rear view instead of the planned studio editorial pose as shot_compliance issues and set passed=false. Identity consistency does NOT require a visible face: intentionally hidden faces in side/rear views or face-free detail crops are valid. For those shots, record face consistency as not assessable for this planned view, not as an error by itself. For detail shots, partial garment/body visibility is intentional. Check for waxy skin, plastic-looking cloth, implausible lighting, excessive bokeh or harsh sharpening. Very faint monochrome photographic grain is intentional, not a defect by itself; flag it only if it obscures garment detail or creates visible artifacts. Give Korean issues and mark other uncertainties honestly.`;
}

export function prompt(model:{profile:string;prompt:string},a:Analysis,p:Plan,refs:Asset[],feedback=''){
 return `Create ONE independent commercial fashion photograph, never a collage.\nA. MODEL IDENTITY: ${model.profile}\n${model.prompt}\nReference roles in exact input order:\n${refs.map((r,i)=>`Reference ${i+1}: ${r.role}`).join('\n')}\nB. PRODUCT IDENTITY: ${JSON.stringify(a)}\nC. STYLING: ${p.styling}\nD. SCENE: ${p.scene}\nE. POSE: ${p.pose}; expression ${p.expression}; hair ${p.hairstyle}\nF. CAMERA (MANDATORY COMPOSITION): ${p.camera_angle}; ${p.framing}. These shot-specific angle, distance and crop instructions take precedence over a generic face portrait or whole-garment presentation. Model reference portraits define identity, NOT camera framing. A hidden or cropped-out face does not change the model identity.\nPHOTOGRAPHIC RENDERING: ${photographicDirection(p.shot_type)}\nG. LIGHTING: ${p.lighting}\nH. PRESERVATION RULES: Preserve source garment color, weave, thickness, texture, cut, fit, length, neckline, sleeves, exact count and placement of buttons, zippers, pockets, logos, prints and seams. Do not invent unclear details. Mannequin references define drape ONLY; remove mannequin. Identity images define the person ONLY, never copy their clothes. Keep product unobstructed. Hair must not cover important neckline/shoulder details.\nI. NEGATIVE CONSTRAINTS: No different person, garment redesign, extra limbs, malformed hands, implausible mirror reflections, heavy retouching, duplicate compositions, text overlays, or watermarks. Mirror shots must have plausible phone orientation and reflections; phone must not obscure garment.\nSHOT: ${p.shot_type}; focus ${p.product_focus}. ${p.generation_prompt}\nCorrections from review/user: ${feedback}`;
}
