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
    if (/logo|icon|btn_|banner|poster|common\//i.test(u.pathname)) continue;
    found.push(u.href);
  }
  return [...new Set(found)];
}
export function isBlocked(html) {return /Restricted access|비정상적인 접근|Verify you are human|Access Denied|Checking your browser/i.test(html);}
