// NAVER API HUB 검색 인증. 키는 서버의 환경변수에서만 읽는다.
export async function searchNews(query, env, get) {
 const url='https://naverapihub.apigw.ntruss.com/search/v1/news?'+new URLSearchParams({query,display:'30',sort:'date',format:'json'});
 const response=await get(url,{'X-NCP-APIGW-API-KEY-ID':env.NAVER_CLIENT_ID,'X-NCP-APIGW-API-KEY':env.NAVER_CLIENT_SECRET});
 const data=await response.json();
 if(!Array.isArray(data.items))throw Error('네이버 뉴스 응답 형식 미확인');
 return data.items;
}
