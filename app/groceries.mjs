// Grocery lists (owner request, 3 November 2026; docs/GROCERIES.md). Pure functions shared by the desktop page
// (groceries-view.js), the server's planner validation (core.mjs) and the phone app (copied in by tools/build-mobile.mjs).
//
// One list of items is both the master list and the current trip:
//   staple  true = a common item kept on the master list; false = a one-off, removed when its trip is finished
//   inTrip  on the current trip;  got  checked off in the store
// Saved trips (presets such as "Weekly shop") are named lists of item ids; loading one puts those items on the trip.
// Groceries never award XP. Records carry the same change stamps as tasks, so phone and computer merge them per item.
export const GROCERY_SECTIONS=[['produce','Produce'],['bakery','Bakery'],['dairy','Dairy & eggs'],['meat','Meat & fish'],['pantry','Pantry'],['frozen','Frozen'],['drinks','Drinks'],['snacks','Snacks'],['household','Household'],['care','Personal care'],['other','Other']];
const SECTION_IDS=new Set(GROCERY_SECTIONS.map(([id])=>id));
export const GROCERY_LIMITS={items:2000,trips:50,tripItems:500,name:120,note:60,tripName:60};
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,DEVICE=/^[A-Za-z0-9-]{1,64}$/,ID=/^[\w-]{1,100}$/;
const stampOk=r=>(r.updatedAt===undefined&&r.updatedBy===undefined)||(typeof r.updatedAt==='string'&&ISO.test(r.updatedAt)&&typeof r.updatedBy==='string'&&DEVICE.test(r.updatedBy));
const stamp=r=>r.updatedAt?{updatedAt:r.updatedAt,updatedBy:r.updatedBy}:{};
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const newId=()=>(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/[^\w-]/g,'');

// Validation for the planner file. Missing lists are fine (older files); malformed records fail closed like the rest of
// the planner. A saved trip that names a removed item simply drops that id.
export function validateGroceries(s){
 const items=s.groceries===undefined?[]:s.groceries,trips=s.groceryTrips===undefined?[]:s.groceryTrips;
 if(!Array.isArray(items)||!Array.isArray(trips))throw Error('Invalid grocery lists.');
 if(items.length>GROCERY_LIMITS.items||trips.length>GROCERY_LIMITS.trips)throw Error('Too many grocery items or saved trips.');
 const ids=new Set(),groceries=items.map(r=>{
  const name=typeof r?.name==='string'?clean(r.name):'';
  if(typeof r?.id!=='string'||!ID.test(r.id)||ids.has(r.id))throw Error('Grocery items need unique IDs.');
  if(!name||name.length>GROCERY_LIMITS.name)throw Error('Grocery items need a name up to '+GROCERY_LIMITS.name+' characters.');
  if(!SECTION_IDS.has(r.section)||typeof r.staple!=='boolean'||typeof r.inTrip!=='boolean'||typeof r.got!=='boolean')throw Error('Invalid grocery item.');
  if(r.note!==undefined&&(typeof r.note!=='string'||r.note.length>GROCERY_LIMITS.note))throw Error('Grocery notes must be up to '+GROCERY_LIMITS.note+' characters.');
  if(!stampOk(r))throw Error('Invalid change stamp on a grocery item.');
  ids.add(r.id);return {id:r.id,name,section:r.section,staple:r.staple,inTrip:r.inTrip,got:r.got,...(r.note?{note:clean(r.note)}:{}),...stamp(r)};
 });
 const tripIds=new Set(),groceryTrips=trips.map(t=>{
  const name=typeof t?.name==='string'?clean(t.name):'';
  if(typeof t?.id!=='string'||!ID.test(t.id)||tripIds.has(t.id)||ids.has(t.id))throw Error('Saved trips need unique IDs.');
  if(!name||name.length>GROCERY_LIMITS.tripName||!Array.isArray(t.items)||t.items.length>GROCERY_LIMITS.tripItems||!t.items.every(x=>typeof x==='string'))throw Error('Invalid saved grocery trip.');
  if(!stampOk(t))throw Error('Invalid change stamp on a saved trip.');
  tripIds.add(t.id);return {id:t.id,name,items:[...new Set(t.items)].filter(x=>ids.has(x)),...stamp(t)};
 });
 return {groceries,groceryTrips};
}

// Edits (each returns a new planner; unchanged input when nothing changes).
const items=s=>s.groceries||[],trips=s=>s.groceryTrips||[];
const put=(s,list)=>({...s,groceries:list});
const edit=(s,id,fn)=>put(s,items(s).map(r=>r.id===id?fn(r):r));
export function findItem(s,name){const key=clean(name).toLocaleLowerCase();return items(s).find(r=>r.name.toLocaleLowerCase()===key)||null;}
// Adding a name that already exists puts that item on the trip (and on the master list when asked) instead of a duplicate.
export function addItem(s,{name,section='other',staple=true,inTrip=true,note}={}){
 const n=clean(name).slice(0,GROCERY_LIMITS.name);if(!n)return s;
 const found=findItem(s,n);
 if(found)return edit(s,found.id,r=>({...r,inTrip:r.inTrip||inTrip,staple:r.staple||staple,...(inTrip&&!r.inTrip?{got:false}:{})}));
 if(items(s).length>=GROCERY_LIMITS.items)return s;
 const item={id:newId(),name:n,section:SECTION_IDS.has(section)?section:'other',staple:!!staple,inTrip:!!inTrip,got:false,...(clean(note)?{note:clean(note).slice(0,GROCERY_LIMITS.note)}:{})};
 return put(s,[...items(s),item]);
}
export const setInTrip=(s,id,on)=>edit(s,id,r=>({...r,inTrip:on,got:on?r.got:false}));
export const toggleGot=(s,id)=>edit(s,id,r=>({...r,got:!r.got,inTrip:true}));
export function updateItem(s,id,patch){return edit(s,id,r=>{const next={...r};
 if(patch.name!==undefined){const n=clean(patch.name).slice(0,GROCERY_LIMITS.name);if(n)next.name=n;}
 if(patch.section!==undefined&&SECTION_IDS.has(patch.section))next.section=patch.section;
 if(patch.staple!==undefined)next.staple=!!patch.staple;
 if(patch.note!==undefined){const v=clean(patch.note).slice(0,GROCERY_LIMITS.note);if(v)next.note=v;else delete next.note;}
 return next;});}
export function removeItem(s,id){return {...s,groceries:items(s).filter(r=>r.id!==id),groceryTrips:trips(s).map(t=>t.items.includes(id)?{...t,items:t.items.filter(x=>x!==id)}:t)};}
// Saved trips.
// Saved trips hold usual items only: a "just this once" item on the trip is left out (it stays a one-off).
export function saveTrip(s,name,ids=items(s).filter(r=>r.inTrip).map(r=>r.id)){
 const n=clean(name).slice(0,GROCERY_LIMITS.tripName);if(!n)return s;
 const keep=[...new Set(ids)].filter(id=>items(s).some(r=>r.id===id&&r.staple)).slice(0,GROCERY_LIMITS.tripItems);
 const s2=s;
 const same=trips(s2).find(t=>t.name.toLocaleLowerCase()===n.toLocaleLowerCase());
 if(same)return {...s2,groceryTrips:trips(s2).map(t=>t.id===same.id?{...t,name:n,items:keep}:t)};
 if(trips(s2).length>=GROCERY_LIMITS.trips)return s;
 return {...s2,groceryTrips:[...trips(s2),{id:newId(),name:n,items:keep}]};
}
export const deleteTrip=(s,id)=>({...s,groceryTrips:trips(s).filter(t=>t.id!==id)});
export function loadTrip(s,id){const t=trips(s).find(x=>x.id===id);if(!t)return s;const on=new Set(t.items);return put(s,items(s).map(r=>on.has(r.id)&&!r.inTrip?{...r,inTrip:true,got:false}:r));}
// Finishing: what was bought leaves the trip (one-offs disappear); anything not found stays on for next time.
export function finishTrip(s){
 const bought=items(s).filter(r=>r.inTrip&&r.got);if(!bought.length)return s;
 const gone=new Set(bought.filter(r=>!r.staple).map(r=>r.id));
 const next={...s,groceries:items(s).filter(r=>!gone.has(r.id)).map(r=>r.inTrip&&r.got?{...r,inTrip:false,got:false}:r)};
 return gone.size?{...next,groceryTrips:trips(s).map(t=>t.items.some(x=>gone.has(x))?{...t,items:t.items.filter(x=>!gone.has(x))}:t)}:next;
}
// Clearing empties the trip without shopping: one-offs disappear, staples go back to the master list.
export function clearTrip(s){
 const gone=new Set(items(s).filter(r=>r.inTrip&&!r.staple).map(r=>r.id));
 return {...s,groceries:items(s).filter(r=>!gone.has(r.id)).map(r=>r.inTrip||r.got?{...r,inTrip:false,got:false}:r),groceryTrips:trips(s).map(t=>t.items.some(x=>gone.has(x))?{...t,items:t.items.filter(x=>!gone.has(x))}:t)};
}

// Views: the trip grouped by store section (in a sensible walking order), and the master list alphabetically.
const sectionOrder=Object.fromEntries(GROCERY_SECTIONS.map(([id],i)=>[id,i]));
export const sectionLabel=id=>(GROCERY_SECTIONS.find(([k])=>k===id)||[,'Other'])[1];
export function tripView(s){
 const list=items(s).filter(r=>r.inTrip),by=new Map();
 for(const r of [...list].sort((a,b)=>(sectionOrder[a.section]-sectionOrder[b.section])||a.name.localeCompare(b.name)))(by.get(r.section)||by.set(r.section,[]).get(r.section)).push(r);
 return {sections:[...by].map(([id,rows])=>({id,label:sectionLabel(id),items:rows})),total:list.length,got:list.filter(r=>r.got).length};
}
export function masterView(s,query=''){const q=clean(query).toLocaleLowerCase();return items(s).filter(r=>r.staple&&(!q||r.name.toLocaleLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name));}
// A guess at the store section from the name, so most items land in the right aisle without choosing.
const GUESS=[['produce',/\b(apples?|bananas?|berr(y|ies)|lettuce|spinach|kale|onions?|garlic|potato(es)?|tomato(es)?|carrots?|peppers?|avocados?|lemons?|limes?|oranges?|grapes?|cucumbers?|broccoli|celery|herbs?|cilantro|parsley|basil|mushrooms?|fruit|veg(gies|etables?)?|salad|zucchini|squash|corn|ginger)\b/i],
 ['bakery',/\b(bread|bagels?|buns?|rolls?|tortillas?|croissants?|muffins?|baguette|pita|cake)\b/i],
 ['dairy',/\b(milk|cheese|butter|yog(h)?urt|eggs?|cream|sour cream|cottage)\b/i],
 ['meat',/\b(chicken|beef|pork|turkey|bacon|sausages?|ham|steak|fish|salmon|tuna|shrimp|ground|mince|lamb|deli)\b/i],
 ['frozen',/\b(frozen|ice cream|pizza)\b/i],
 ['drinks',/\b(coffee|tea|juice|soda|water|sparkling|beer|wine|kombucha)\b/i],
 ['snacks',/\b(chips|crackers|cookies|chocolate|candy|popcorn|pretzels|nuts|granola bars?)\b/i],
 ['household',/\b(paper towels?|toilet paper|detergent|soap|dish|trash bags?|foil|wrap|sponges?|cleaner|bleach|batteries|light ?bulbs?)\b/i],
 ['care',/\b(shampoo|conditioner|toothpaste|toothbrush|deodorant|razors?|lotion|floss|vitamins?|medicine|tissues?)\b/i],
 ['pantry',/\b(rice|pasta|beans|flour|sugar|salt|oil|vinegar|sauce|cereal|oats|oatmeal|soup|spices?|peanut butter|jam|honey|canned|broth|noodles|syrup|ketchup|mustard|mayo)\b/i]];
export function guessSection(name){const n=clean(name);for(const [id,re] of GUESS)if(re.test(n))return id;return 'other';}
