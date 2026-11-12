'use client';
import {useEffect,useState} from 'react';
import {Camera,ArrowUpRight,Download} from 'lucide-react';
type RecordItem={id:string;status:string;created_at:string;product_name:string;thumbnail_id:string|null};
const statusNames:Record<string,string>={queued:'촬영 대기',analyzing:'상품 분석 중',planning:'촬영 기획 중',running:'촬영 중',done:'완료',partial:'일부 재시도 필요',failed:'확인 필요'};

export default function Archive(){
 const [items,setItems]=useState<RecordItem[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;const refresh=async()=>{try{const r=await fetch('/api/jobs',{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);if(alive){setItems(data);setError('');}}catch(e){if(alive)setError(e instanceof Error?e.message:'기록을 불러오지 못했습니다.');}finally{if(alive)setLoading(false);}};void refresh();const timer=setInterval(refresh,30000);return()=>{alive=false;clearInterval(timer);};},[]);
 const available=items;
 return <section id="archive" className="archive"><div className="section-title"><span>YOUR ARCHIVE</span><span>나의 촬영 기록</span></div><p>이전 촬영 결과를 다시 보고 다운로드할 수 있습니다.</p>{error&&<div className="error" role="alert">{error} <a href="/">스튜디오로 돌아가기</a></div>}{loading?<p>촬영 기록을 불러오고 있습니다.</p>:!error&&!available.length?<p>보관 중인 촬영 기록이 없습니다.</p>:<div className="archive-grid">{available.map(h=><article className="archive-entry" key={h.id}><a href={'/?job='+h.id} className="archive-preview">{h.thumbnail_id?<img src={'/api/assets/'+h.thumbnail_id} alt={h.product_name+' 대표 이미지'}/>:<Camera size={28}/>}</a><div className="archive-info"><a href={'/?job='+h.id}><h2>{h.product_name}</h2></a><p>{statusNames[h.status]||h.status}</p><div className="archive-actions"><a href={'/?job='+h.id}>촬영 열기 <ArrowUpRight size={14}/></a>{h.thumbnail_id&&<a href={'/api/jobs/'+h.id+'/zip'}><Download size={14}/> ZIP 저장</a>}</div></div></article>)}</div>}</section>;
}
