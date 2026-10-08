import { createHash } from 'node:crypto';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function extractImages(html, pageUrl) {
  // 공통 로고·버튼을 제외하고 공식 상세 콘텐츠 이미지만 대상으로 삼는다.
  const section = html.match(/<dl[^>]+id=["']jsDetails["'][^>]*>([\s\S]*?)<\/dl>/i)?.[1] ?? html;
  const found=[];
  for (const m of section.matchAll(/<img\b[^>]*>/gi)) {
    const src=m[0].match(/(?:data-src|src)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    let u;try {u=new URL(src.replaceAll('&amp;','&'),pageUrl);}catch {continue;}
    if (!['http:','https:'].includes(u.protocol)) continue;
    if (/logo|icon|btn_|banner|poster|common\/|favicon|\/tr$|viewtracking/i.test(u.pathname) || /facebook\.com|acecounter\.com|google-analytics\.com/.test(u.hostname)) continue;
    found.push(u.href);
  }
  return [...new Set(found)];
}
export function isBlocked(html) {return /Restricted access|비정상적인 접근|Verify you are human|Access Denied|Checking your browser/i.test(html);}

// HTTP 200으로 반환되는 오류 페이지도 정상 상세 페이지와 구분한다.
export function pageProblem(html) {
 if(isBlocked(html))return "blocked";
 if(/상품정보가 올바르지 않습니다|상품이 존재하지 않습니다/.test(html))return "invalid_product";
 return null;
}
export function imageCollectionStatus(record) {
 if(record.images.length)return "images_need_extraction";
 if(record.pages.some(p=>p.status==="blocked"))return "blocked";
 if(record.pages.some(p=>["fetch_failed","image_fetch_failed","invalid_product"].includes(p.status)))return "fetch_failed";
 return record.pages.length?"no_images":"no_sources";
}
