import {createHash} from 'node:crypto';
import sharp from 'sharp';

// Tiny monochrome grain only: no blur, sharpening, color grading or texture synthesis.
// Seeded per shot revision so recovery never stacks or changes the finish.
export function applyFineGrain(pixels:Buffer,seed:string,shotType:string):void {
 let state=createHash('sha256').update(seed).digest().readUInt32LE(0)||1;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 const amplitude=shotType==='DETAIL'?1.5:shotType==='STUDIO'?2.5:3.5;
 for(let i=0;i<pixels.length;i+=4){
  if(pixels[i+3]===0)continue;
  const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  const luminance=.2126*r+.7152*g+.0722*b;
  // Protect black garments and highlights from a lifted black point or clipping.
  const protection=Math.min(1,luminance/16,(255-luminance)/16);
  const delta=Math.round((random()+random()-1)*amplitude*(1.05-.2*luminance/255)*protection);
  // Equal RGB increments preserve channel differences, even at gamut boundaries.
  const safeDelta=Math.max(-Math.min(r,g,b),Math.min(255-Math.max(r,g,b),delta));
  pixels[i]=r+safeDelta;pixels[i+1]=g+safeDelta;pixels[i+2]=b+safeDelta;
 }
}
export async function renderPhotographicFinish(source:string,destination:string,width:number,height:number,seed:string,shotType:string){
 // Bound decoding to final size; raw working buffer is at most width*height*4 bytes.
 const {data,info}=await sharp(source).rotate().resize(width,height,{fit:'inside',withoutEnlargement:true}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 applyFineGrain(data,seed,shotType);
 const left=Math.floor((width-info.width)/2),top=Math.floor((height-info.height)/2);
 await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
  .extend({left,right:width-info.width-left,top,bottom:height-info.height-top,background:'#f4f3f1'})
  .png().toFile(destination);
}
