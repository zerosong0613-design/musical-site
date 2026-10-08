// 판매기간 연결과 수동 입력 우선 병합.
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
