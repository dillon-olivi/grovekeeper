// Sync preparation (owner approved 3 November 2026; docs/MOBILE-SYNC.md). Pure functions, no I/O.
// Every save compares the new planner with the saved one: records that are new or changed get `updatedAt` (ISO time)
// and `updatedBy` (this device's id); unchanged records keep their stamps; records that disappeared leave a tombstone
// {kind, id, deletedAt, by} so another device can later tell "deleted here" from "never seen". A record that comes
// back (Undo) drops its tombstone. Nothing else in the planner changes, and older files without stamps load as before.
export const STAMP_KINDS={tasks:'task',habits:'habit',habitLogs:'habitLog',logs:'log',groceries:'grocery',groceryTrips:'groceryTrip',journal:'journal'};   // groceries: 0.12.0; journal: 0.13.0
export const TOMBSTONE_DAYS=90,TOMBSTONE_MAX=5000;
const keyOf=(kind,r)=>kind==='habitLogs'?`${r.habitId}|${r.date}`:r.id;
const body=r=>{const {updatedAt,updatedBy,...rest}=r;return JSON.stringify(rest);};

export function stampChanges(prev,next,{now=new Date().toISOString(),device}={}){
 if(!device)throw Error('A device id is required to stamp changes.');
 const out={...next},seen=new Map();
 const before=(prev&&typeof prev==='object')?prev:{};
 for(const [kind,label] of Object.entries(STAMP_KINDS)){
  const old=new Map((before[kind]||[]).map(r=>[keyOf(kind,r),r]));
  if(next[kind]===undefined&&!(before[kind]||[]).length)continue;   // optional lists (groceries) stay absent when unused
  out[kind]=(next[kind]||[]).map(r=>{
   const k=keyOf(kind,r),o=old.get(k);seen.set(label+':'+k,true);
   if(o&&body(o)===body(r))return o.updatedAt?{...r,updatedAt:o.updatedAt,updatedBy:o.updatedBy}:stripStamps(r);
   return {...r,updatedAt:now,updatedBy:device};
  });
  for(const [k] of old)if(!seen.has(label+':'+k))seen.set('gone:'+label+':'+k,{kind:label,id:k});
 }
 let tombs=(before.tombstones||[]).filter(t=>!seen.has(t.kind+':'+t.id));
 const known=new Set(tombs.map(t=>t.kind+':'+t.id));
 for(const [key,t] of seen)if(key.startsWith('gone:')&&!known.has(t.kind+':'+t.id))tombs.push({kind:t.kind,id:t.id,deletedAt:now,by:device});
 out.tombstones=pruneTombstones(tombs,now);
 if(!out.tombstones.length)delete out.tombstones;
 return out;
}
function stripStamps(r){const {updatedAt,updatedBy,...rest}=r;return rest;}
export function pruneTombstones(list,now=new Date().toISOString()){
 const cutoff=new Date(new Date(now).getTime()-TOMBSTONE_DAYS*86400000).toISOString();
 return list.filter(t=>t.deletedAt>=cutoff).sort((a,b)=>a.deletedAt.localeCompare(b.deletedAt)).slice(-TOMBSTONE_MAX);
}

// Validation helpers used by core.mjs (fail closed on malformed stamps or tombstones).
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,DEVICE=/^[A-Za-z0-9-]{1,64}$/;
export const validStamp=r=>(r.updatedAt===undefined&&r.updatedBy===undefined)||(typeof r.updatedAt==='string'&&ISO.test(r.updatedAt)&&typeof r.updatedBy==='string'&&DEVICE.test(r.updatedBy));
export const stampOf=r=>r.updatedAt?{updatedAt:r.updatedAt,updatedBy:r.updatedBy}:{};
export function validTombstones(list){
 if(list===undefined)return true;
 if(!Array.isArray(list)||list.length>TOMBSTONE_MAX)return false;
 const kinds=new Set(Object.values(STAMP_KINDS)),keys=new Set();
 return list.every(t=>t&&kinds.has(t.kind)&&typeof t.id==='string'&&t.id&&t.id.length<=220&&typeof t.deletedAt==='string'&&ISO.test(t.deletedAt)&&typeof t.by==='string'&&DEVICE.test(t.by)&&!keys.has(t.kind+':'+t.id)&&keys.add(t.kind+':'+t.id));
}
