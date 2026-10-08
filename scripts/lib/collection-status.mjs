// 캐스팅 보유 여부와 원출처 접근 상태는 별도로 기록한다.
export function classifyCollection({show, casting, imageRecord, audit, today, excluded}) {
 const base={mt20id:show?.id??null,title:show?.title??excluded?.title,checkedAt:today};
 if(excluded)return {...base,status:'excluded',label:'수집 대상 제외',reason:excluded.reason,url:excluded.url};
 const upcoming=casting?.shows?.filter(s=>s.date>=today)??[];
 const pages=imageRecord?.pages??audit?.pages??[];
 const sourceIssues=pages.filter(p=>['blocked','fetch_failed','image_fetch_failed','invalid_product'].includes(p.status));
 if(upcoming.length)return {...base,status:'collected',label:'캐스팅 확보',from:upcoming[0].date,to:upcoming.at(-1).date,rows:upcoming.length,dataCheckedAt:casting.checkedAt,sourceIssues};
 if(casting?.shows?.length)return {...base,status:'coverage_expired',label:'확보한 캐스팅 구간 종료',dataCheckedAt:casting.checkedAt,sourceIssues};
 // 실패한 요청을 "표 없음"으로 처리하지 않는다. 과거 감사 결과는 현재 접근 결과를 대체하지 않는다.
 if(pages.some(p=>p.status==='blocked'))return {...base,status:'blocked',label:'접근 제한',sourceIssues};
 if(sourceIssues.length)return {...base,status:'fetch_failed',label:'수집 실패·경로 확인 필요',sourceIssues};
 const currentImages=imageRecord&&!imageRecord.retainedPreviousImages?imageRecord.images:[];
 if(currentImages?.length||audit?.scheduleImage)return {...base,status:'pending_extraction',label:audit?.scheduleImage?'표 확인·판독 대기':'이미지 확보·표 판독 대기',sourceCheckedAt:imageRecord?.checkedAt??audit?.checkedAt};
 if(audit?.result==='no_schedule_in_checked_page')return {...base,status:'not_found_in_checked_page',label:'확인한 페이지에 캐스팅표 없음',sourceCheckedAt:audit.checkedAt,url:audit.url};
 if(imageRecord?.status==='no_sources')return {...base,status:'no_sources',label:'지원하는 수집 경로 없음'};
 return {...base,status:'unverified',label:'캐스팅표 확인 필요'};
}
