import {sameActor} from './actor-search.js';
export function validPeriod(from,to) {
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s??'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 return valid(from)&&valid(to)&&from<=to;
}
export function overlapsPeriod(show,from,to) {
 return !from&&!to||validPeriod(from,to)&&show.from<=to&&show.to>=from;
}
export function periodSessions(casting,from,to,actor='',now=Date.now()) {
 if(!casting||!validPeriod(from,to))return null;
 return (casting.shows??[]).filter(r=>r.date>=from&&r.date<=to&&new Date(r.date+'T'+r.time+':00+09:00').getTime()>=now&&(!actor||r.cast.some(n=>sameActor(n,actor)))).length;
}
export function showFilterLink(id,actor='',from='',to='') {
 const q=new URLSearchParams();if(actor)q.set('actor',actor);
 if(validPeriod(from,to)){q.set('from',from);q.set('to',to);}
 return '#/show/'+id+(q.size?'?'+q:'');
}
