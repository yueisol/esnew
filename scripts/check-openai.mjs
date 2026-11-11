// Read-only account access check. Never outputs credentials or generates images.
const key=process.env.OPENAI_API_KEY;
if(!key){console.error('OPENAI_API_KEY가 설정되지 않았습니다. .env.local 또는 서버 보안 설정에 입력하세요.');process.exit(1);}
const models=[process.env.IMAGE_MODEL||'gpt-image-2.6-sunburst',process.env.VISION_MODEL||'gpt-4.1'];
for(const model of models){const r=await fetch('https://api.openai.com/v1/models/'+encodeURIComponent(model),{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)});console.log(`${model}: ${r.ok?'모델 조회 성공':'접근 확인 실패 HTTP '+r.status}`);if(!r.ok)process.exitCode=1;}
console.log('읽기 전용 조회입니다. 이미지 편집 파라미터 및 생성 품질은 유료 생성 요청으로 별도 검증해야 합니다.');
