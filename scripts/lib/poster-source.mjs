// 대표 포스터만 읽는다. 본문 캐스팅표·광고 이미지는 사용하지 않는다.
const clean=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").normalize('NFKC');
const letters=s=>clean(s).replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
export function posterFromPage(html,pageUrl,show) {
 if(/Restricted access|비정상적인 접근|Access Denied/.test(html))return null;
 const meta={};
 for(const m of html.matchAll(/<meta\b[^>]*>/gi)) {
  const attrs={};for(const a of m[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs))attrs[a[1].toLowerCase()]=clean(a[3]);
  if(attrs.property||attrs.name)meta[(attrs.property??attrs.name).toLowerCase()]=attrs.content;
 }
 const title=meta['og:title']??html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'';
 const expected=show.title.replace(/\s*[\[(].*$/,'').replace(/^.*?,\s*/,'');
 if(!letters(title).includes(letters(expected))||letters(expected).length<2)return null;
 try {
  const u=new URL(meta['og:image'],pageUrl);
  if(u.protocol!=='https:'||!['ticketimage.interpark.com','tkfile.yes24.com','commonfile.clipservice.co.kr','image.toast.com','images.ticketlink.co.kr','image.ticketlink.co.kr'].includes(u.hostname))return null;
  if(/logo|icon|default|noimage/i.test(u.pathname))return null;
  return u.href;
 }catch{return null;}
}
export function posterPages(links) {
 return [...new Set(links.flatMap(l=>{
  try {
   const u=new URL(l.url);
   if(u.hostname==='ticket.interpark.com') {
    const code=u.searchParams.get('GoodsCode');return /^\d+$/.test(code??'')?[`https://nol.yanolja.com/ticket/products/${code}`]:[];
   }
   return ['nol.yanolja.com','www.ticketlink.co.kr','ticketlink.co.kr','ticket.yes24.com','ticket.clipservice.co.kr'].includes(u.hostname)?[u.href.replace(/^http:/,'https:')]:[];
  }catch{return [];}
 }))].sort((a,b)=>Number(!a.includes('nol.yanolja.com'))-Number(!b.includes('nol.yanolja.com')));
}
