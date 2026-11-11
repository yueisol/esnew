import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'HI, ESOL — AI 패션 스튜디오',description:'당신의 옷에, 이솔의 순간을. 고정 AI 모델과 함께 만드는 패션 화보.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}
