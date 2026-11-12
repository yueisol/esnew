import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {applyFineGrain,renderPhotographicFinish} from '../src/lib/photographic-finish';
import {photographicDirection,photographicLighting} from '../src/lib/photographic-direction';
function sample(){const p=Buffer.alloc(40000);for(let i=0;i<p.length;i+=4){p[i]=110;p[i+1]=130;p[i+2]=150;p[i+3]=255;}return p;}
function energy(p:Buffer){let sum=0;for(let i=0;i<p.length;i+=4)sum+=(p[i]-110)**2;return sum/(p.length/4);}
test('grain is fine, monochrome, zero-mean, deterministic, and gentler on details',()=>{
 const original=sample(),a=sample(),repeat=sample(),detail=sample(),different=sample();
 applyFineGrain(a,'shot:0','LIFESTYLE');applyFineGrain(repeat,'shot:0','LIFESTYLE');applyFineGrain(detail,'shot:0','DETAIL');applyFineGrain(different,'shot:1','LIFESTYLE');
 assert.deepEqual(a,repeat);assert.notDeepEqual(a,original);assert.notDeepEqual(a,different);
 let bias=0;for(let i=0;i<a.length;i+=4){const d=a[i]-original[i];assert.ok(Math.abs(d)<=4);assert.equal(a[i+1]-original[i+1],d);assert.equal(a[i+2]-original[i+2],d);assert.equal(a[i+3],255);bias+=d;}
 assert.ok(Math.abs(bias/(a.length/4))<.05);assert.ok(energy(detail)>0);assert.ok(energy(detail)<energy(a));
});
test('black, white, saturated colors and transparent pixels do not clip or shift hue',()=>{
 const p=Buffer.from([0,0,0,255,255,255,255,255,0,128,255,255,100,110,120,0]);const original=Buffer.from(p);
 applyFineGrain(p,'contrast','MIRROR');assert.deepEqual(p,original);
});
test('finishing preserves geometry, edge detail and clean padding; checkpoint retry does not stack grain',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'esol-photo-finish-'));const source=path.join(dir,'source.png');
 const pixels=Buffer.alloc(60*100*4);for(let y=0;y<100;y++)for(let x=0;x<60;x++){const i=(y*60+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=x===30?45:180;pixels[i+3]=255;}
 await sharp(pixels,{raw:{width:60,height:100,channels:4}}).png().toFile(source);
 const a=path.join(dir,'a.png'),b=path.join(dir,'b.png');
 await renderPhotographicFinish(source,a,90,120,'same-shot:0','DETAIL');await renderPhotographicFinish(source,b,90,120,'same-shot:0','DETAIL');
 assert.deepEqual(await readFile(a),await readFile(b));
 const {data,info}=await sharp(a).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,90);assert.equal(info.height,120);
 assert.deepEqual([...data.subarray(0,4)],[244,243,241,255]);
 for(let y=0;y<100;y++)for(let x=0;x<60;x++){const before=(y*60+x)*4,after=((y+10)*90+x+15)*4;assert.ok(Math.abs(data[after]-pixels[before])<=2);}
});
test('camera treatment matches shot type without obscuring product texture',()=>{
 assert.match(photographicDirection('LIFESTYLE'),/35–50mm/);
 assert.match(photographicDirection('MIRROR'),/smartphone mirror/);
 assert.match(photographicDirection('STUDIO'),/50–85mm/);
 assert.match(photographicDirection('DETAIL'),/f\/5.6–f\/8/);
 assert.match(photographicLighting('STUDIO'),/softbox/);
 for(const type of ['LIFESTYLE','MIRROR','STUDIO','DETAIL']){const text=photographicDirection(type);assert.match(text,/mandatory shot angle/);assert.match(text,/faithful product color/);assert.match(text,/no porcelain\/wax skin/);assert.match(text,/do not bake pronounced grain/);}
});
