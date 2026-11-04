// Merge rules for syncing two copies of the planner (docs/MOBILE-SYNC.md; owner approved 3 November 2026).
// Pure functions, no I/O, nothing wired to storage yet. Inputs are validated planner states whose records carry the
// stamps written by sync-stamps.mjs (`updatedAt`, `updatedBy`) and whose deletions are `tombstones`.
//
// Rules:
// - Records (tasks, routines, routine days, logs) are matched by id (routine days by routine + date). When both copies
//   have a record, the later `updatedAt` wins; equal times fall back to the device id, so every device picks the same
//   winner. An unstamped record (older than sync) loses to a stamped one; two unstamped ones keep the local copy.
// - A record on one side only is kept unless the other side deleted it at or after the record's last change
//   (a later edit beats an older deletion; a record the other side never saw is simply new to it).
// - Tombstones from both sides are combined (latest deletion per record) and dropped for records that still exist.
// - A routine is never removed while routine days still refer to it; it comes back retired, so history stays valid.
// - Categories, settings and targets are preferences: the local copy wins, unknown remote categories are added, and
//   the highest level ever reached (identity.peakLevel) takes the larger value so earned rewards never shrink.
// - Rest days are combined. XP is never merged: it is recomputed from completions, so a task completed on both
//   devices (same id) still counts once.
import {STAMP_KINDS,pruneTombstones} from './sync-stamps.mjs';

const keyOf=(kind,r)=>kind==='habitLogs'?`${r.habitId}|${r.date}`:r.id;
const label=kind=>STAMP_KINDS[kind];
// Later change wins; ties break on device id, then local, so the result is the same on every device.
export function newer(a,b){
 if(!a)return b;if(!b)return a;
 const ta=a.updatedAt||'',tb=b.updatedAt||'';
 if(ta!==tb)return ta>tb?a:b;
 const da=a.updatedBy||'',db=b.updatedBy||'';
 return db>da?b:a;
}
function tombIndex(...lists){
 const out=new Map();
 for(const list of lists)for(const t of list||[]){const k=t.kind+':'+t.id,old=out.get(k);if(!old||t.deletedAt>old.deletedAt||(t.deletedAt===old.deletedAt&&t.by>old.by))out.set(k,t);}
 return out;
}
const deletedAfter=(tomb,r)=>!!tomb&&(!r.updatedAt||tomb.deletedAt>=r.updatedAt);

export function mergeRecords(kind,local=[],remote=[],tombs){
 const mine=new Map(local.map(r=>[keyOf(kind,r),r])),theirs=new Map(remote.map(r=>[keyOf(kind,r),r]));
 const order=[...mine.keys(),...[...theirs.keys()].filter(k=>!mine.has(k))],out=[];
 for(const k of order){
  const a=mine.get(k),b=theirs.get(k),tomb=tombs.get(label(kind)+':'+k);
  const pick=a&&b?newer(a,b):(a||b);
  if(deletedAfter(tomb,pick))continue;   // a deletion at or after the last edit wins
  out.push(pick);
 }
 return out;
}

export function mergePlanners(local,remote,{now=new Date().toISOString()}={}){
 if(!remote)return local;
 const tombs=tombIndex(local.tombstones,remote.tombstones),out={...local};
 for(const kind of Object.keys(STAMP_KINDS))out[kind]=mergeRecords(kind,local[kind],remote[kind],tombs);
 // Keep any routine that routine days still refer to (restored as retired), so history and validation stay intact.
 const habitIds=new Set(out.habits.map(h=>h.id)),allHabits=new Map([...(remote.habits||[]),...(local.habits||[])].map(h=>[h.id,h]));
 for(const r of out.habitLogs)if(!habitIds.has(r.habitId)&&allHabits.has(r.habitId)){out.habits.push({...allHabits.get(r.habitId),retired:true,paused:true});habitIds.add(r.habitId);}
 out.habitLogs=out.habitLogs.filter(r=>habitIds.has(r.habitId));
 // Preferences: local wins; add categories only the other side has; earned peak level never shrinks.
 const cats=new Set((local.categories||[]).map(c=>c.id));
 out.categories=[...(local.categories||[]),...(remote.categories||[]).filter(c=>!cats.has(c.id))];
 out.targets={...(remote.targets||{}),...(local.targets||{})};
 const peak=Math.max(local.settings?.identity?.peakLevel||0,remote.settings?.identity?.peakLevel||0);
 out.settings={...local.settings,...(peak?{identity:{...(local.settings?.identity||{}),peakLevel:peak}}:{})};
 out.rest=[...new Set([...(local.rest||[]),...(remote.rest||[])])].sort();
 // Tombstones: latest per record, minus records that exist again, pruned like local ones.
 const present=new Set(Object.keys(STAMP_KINDS).flatMap(kind=>out[kind].map(r=>label(kind)+':'+keyOf(kind,r))));
 const kept=pruneTombstones([...tombs.values()].filter(t=>!present.has(t.kind+':'+t.id)),now);
 if(kept.length)out.tombstones=kept;else delete out.tombstones;
 return out;
}
