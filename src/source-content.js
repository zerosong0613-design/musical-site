export function cleanMarkupText(html) {
 return String(html??'').replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/?(?:html|head|body|meta|link|title|div|span|a|p|br|b|i|u|em|strong|font|small|h[1-6]|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|th|td|img|input|button|select|option|form|label|script|style|section|article|header|footer|nav|main|aside|noscript|time|svg|path|g|circle|rect|ellipse|line|polyline|polygon|defs|use|symbol)\b[^>]*>/gi,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g,s=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&#39;':"'",'&lt;':'<','&gt;':'>'}[s])).replace(/<\/?(?:time|svg|path|g|circle|rect|ellipse|line|polyline|polygon|defs|use|symbol)\b[^>]*(?:>|$)/gi,' ').normalize('NFKC').replace(/\s+/g,' ').trim();
}
// 상품 상세와 공지 본문을 구분한다. 호스트와 경로를 함께 검사한다.
export function isProductPage(url) {
 try {
  const u=new URL(url),h=u.hostname,p=u.pathname;
  return (h==='nol.yanolja.com'&&/^\/ticket\/products\//i.test(p))
   || (/(^|\.)ticketlink\.co\.kr$/.test(h)&&/^\/product\//i.test(p))
   || (h==='ticket.melon.com'&&/^\/performance\/index\.htm$/i.test(p))
   || (h==='ticket.yes24.com'&&/^\/(?:Perf\/Detail\/PerfDetail\.aspx|Special\/\d+)/i.test(p))
   || (h==='ticket.clipservice.co.kr'&&/^\/Clipservice\/Ticket\/ShowDetail$/i.test(p))
   || (h==='m-ticket.clipservice.co.kr'&&/^\/Play\/PlayDetail$/i.test(p));
 }catch{return false;}
}
export const sourceLinkLabel=url=>isProductPage(url)?'예매페이지':'공지 원문';
