const KEY = 'musical-site:favorites';
export function readFavorites(storage) {
 try {const ids=JSON.parse(storage.getItem(KEY)??'[]');return new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'&&/^PF\w+$/.test(id)):[]);}catch{return new Set();}
}
export function saveFavorites(storage,favorites) {
 try {storage.setItem(KEY,JSON.stringify([...favorites]));return true;}catch{return false;}
}
export function favoritesFirst(shows,favorites,compare) {
 return [...shows].sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id))||compare(a,b));
}
