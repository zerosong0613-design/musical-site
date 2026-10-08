// 판매기간 연결과 수동 입력 우선 병합.
// PC→모바일 이동 안내가 작품 번호를 버리지 않도록 상세 주소로 직접 연결한다.
export function mobileVendorUrl(url, isPhone = false) {
 if(!isPhone)return url;
 let u;try{u=new URL(url);}catch{return url;}
 if(u.hostname==='ticket.clipservice.co.kr'&&u.pathname.toLowerCase()==='/clipservice/ticket/showdetail') {
  const id=u.searchParams.get('playNum');
  if(/^\d+$/.test(id??''))return `https://m-ticket.clipservice.co.kr/Play/PlayDetail?playNum=${id}`;
 }
 const id=url.match(/^https:\/\/ticket\.yes24\.com\/New\/Notice\/NoticeMain\.aspx#id=(\d+)$/)?.[1];
 return id?`https://m.ticket.yes24.com/Notice/Detail.aspx?bid=${id}`:url;
}
export function mergeOpenings(auto,manual) {
 const key=o=>`${o.mt20id??o.id}|${o.at}|${o.vendor}|${!!o.presale}`;
 const result=new Map(auto.map(o=>[key(o),o]));for(const o of manual)result.set(key(o),o);
 return [...result.values()].sort((a,b)=>a.at.localeCompare(b.at));
}
export function castingLink(opening,index) {
 const c=index.get(opening.mt20id);if(!c)return null;
 const from=opening.performanceFrom,to=opening.performanceTo;
 if(from&&to&&(c.to<from||c.from>to))return null;
 return `#/show/${opening.mt20id}${from&&to?'?from='+from+'&to='+to:''}`;
}

