const normalize=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s·:：\[\]()]/g,'');
export function matchesTitleVenue(show,query='') {
 const q=normalize(query);return !q||normalize(show.title).includes(q)||normalize(show.venue).includes(q);
}
