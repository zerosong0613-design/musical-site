// NAVER API HUB 검색 인증. 키는 서버의 환경변수에서만 읽는다.
export const searchSources={news:'네이버 뉴스',blog:'네이버 블로그',webkr:'네이버 웹문서'};
export async function searchNaver(kind, query, env, get) {
 if(!Object.hasOwn(searchSources,kind))throw Error('지원하지 않는 네이버 검색 종류');
 const params=new URLSearchParams({query,display:'30',format:'json'});
 if(kind!=='webkr')params.set('sort','date');
 const url='https://naverapihub.apigw.ntruss.com/search/v1/'+kind+'?'+params;
 const response=await get(url,{'X-NCP-APIGW-API-KEY-ID':env.NAVER_CLIENT_ID,'X-NCP-APIGW-API-KEY':env.NAVER_CLIENT_SECRET});
 const data=await response.json();
 if(!Array.isArray(data.items))throw Error('네이버 검색 응답 형식 미확인');
 return data.items;
}
export const searchNews=(query,env,get)=>searchNaver('news',query,env,get);
export function searchCandidate(item,kind,now=Date.now()) {
 const url=item.originallink||item.link;
 try {if(!['http:','https:'].includes(new URL(url).protocol))return null;}catch{return null;}
 let at;
 if(kind==='news')at=new Date(item.pubDate).getTime();
 if(kind==='blog'&&/^\d{8}$/.test(item.postdate??''))at=new Date(item.postdate.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')+'T00:00:00+09:00').getTime();
 if(kind!=='webkr'&&(!Number.isFinite(at)||now-at>14*86400e3||at>now+86400e3))return null;
 return {url,title:item.title??'',text:(item.title??'')+' '+(item.description??''),source:searchSources[kind],...(Number.isFinite(at)?{at:new Date(at).toISOString()}:{})};
}
