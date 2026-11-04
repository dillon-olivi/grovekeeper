// Grovekeeper phone app: planner logic (owner approved 3 November 2026; docs/PHONE-APP.md). Pure functions shared by
// the phone screens and the tests. Edits produce records in exactly the shape the desktop validates (core.mjs), are
// stamped like desktop saves (sync-stamps.mjs) and merge with the same rules (sync.mjs).
import {stampChanges} from './sync-stamps.mjs';
import {mergePlanners} from './sync.mjs';

export const SYNC_FORMAT='grovekeeper-sync',SYNC_VERSION=1,PLANNER_VERSIONS=[2,3];
const pad=n=>String(n).padStart(2,'0');
export const isoDay=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const addDays=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return isoDay(d);};
export const monday=day=>{const d=new Date(day+'T12:00:00');return addDays(day,-((d.getDay()+6)%7));};
const ALL_DAYS=[0,1,2,3,4,5,6];
const uuid=()=>globalThis.crypto?.randomUUID?.()||'m-'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);

// The shared copy must be a Grovekeeper planner of a format this app understands; anything else is left untouched.
export function readEnvelope(content){
 if(!content||typeof content!=='object'||content.format!==SYNC_FORMAT)throw Error('The copy in Drive is not a Grovekeeper planner.');
 if(content.version!==SYNC_VERSION)throw Error('Your computer has a newer Grovekeeper. Update this app (reload it) to keep syncing.');
 const s=content.state;
 if(!s||!PLANNER_VERSIONS.includes(s.version)||!['tasks','habits','habitLogs','logs','rest'].every(k=>Array.isArray(s[k]))||!Array.isArray(s.categories))throw Error('The copy in Drive could not be read. Nothing was changed.');
 return {state:s,progress:content.progress||null};
}
export const makeEnvelope=(state,device,progress,now=new Date().toISOString())=>({format:SYNC_FORMAT,version:SYNC_VERSION,updatedAt:now,device,state,...(progress?{progress}:{})});

const defaultCategory=s=>(s.categories.find(c=>!c.archived)||s.categories[0])?.id||'Personal';
const doneLog=(s,h,day)=>{const r=s.habitLogs.find(x=>x.habitId===h.id&&x.date===day);return !!r&&r.amount>=(r.goal||h.goal);};

// What the phone shows: today's tasks and routines, and the next week's tasks.
export function todayView(s,today){
 const weekday=new Date(today+'T12:00:00').getDay();
 const tasks=s.tasks.filter(t=>t.date===today);
 const routines=s.habits.filter(h=>!h.paused&&!h.retired&&(h.createdDate||'1970-01-01')<=today&&(h.days||ALL_DAYS).includes(weekday)).map(h=>({id:h.id,title:h.title,done:doneLog(s,h,today)}));
 const upcoming=s.tasks.filter(t=>t.date&&t.date>today&&t.date<=addDays(today,7)&&!t.done).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
 const unassigned=s.tasks.filter(t=>!t.date&&!t.done&&t.week===monday(today));
 return {tasks,routines,upcoming,unassigned,done:tasks.filter(t=>t.done).length+routines.filter(r=>r.done).length,total:tasks.length+routines.length};
}

// Edits return a new planner; the caller stamps and saves it.
export function addTask(s,title,day){
 const clean=String(title||'').replace(/\s+/g,' ').trim().slice(0,300);if(!clean)return s;
 return {...s,tasks:[...s.tasks,{id:uuid(),title:clean,category:defaultCategory(s),date:day,week:monday(day),done:false,completedDate:null}]};
}
export function toggleTask(s,id,today){
 return {...s,tasks:s.tasks.map(t=>t.id!==id?t:{...t,done:!t.done,completedDate:!t.done?today:null})};
}
export function moveTask(s,id,day){
 return {...s,tasks:s.tasks.map(t=>t.id!==id||t.done?t:{...t,date:day,week:monday(day)})};
}
export function deleteTask(s,id){return {...s,tasks:s.tasks.filter(t=>t.id!==id)};}
export function toggleRoutine(s,habitId,today){
 const h=s.habits.find(x=>x.id===habitId);if(!h)return s;
 const done=doneLog(s,h,today),existing=s.habitLogs.find(x=>x.habitId===habitId&&x.date===today);
 // Same as the desktop checklist: completing records amount = goal, reopening sets it back to 0 (the row stays).
 const row={habitId:h.id,title:h.title,category:h.category,unit:h.unit,goal:existing?.goal||h.goal,date:today,amount:done?0:(existing?.goal||h.goal)};
 return {...s,habitLogs:existing?s.habitLogs.map(x=>x===existing?{...x,amount:row.amount}:x):[...s.habitLogs,row]};
}
export const commit=(prev,next,device,now)=>stampChanges(prev,next,{device,now});

// One sync: download, merge, upload when the shared copy is behind. The phone never creates the shared copy from
// nothing: the computer must sync first, so a fresh phone can never overwrite a real planner with an empty one.
export async function syncWithDrive({drive,local,device,now=new Date().toISOString()}){
 const file=await drive.find();
 if(!file){if(!local)throw Error('No planner in Drive yet. On your computer, open Settings → General → Phone sync and connect Google Drive first.');await drive.upload(makeEnvelope(local.state,device,local.progress,now));return local;}
 const remote=readEnvelope(await drive.download(file));
 const state=local?mergePlanners(local.state,remote.state,{now}):remote.state;
 if(JSON.stringify(state)!==JSON.stringify(remote.state))await drive.upload(makeEnvelope(state,device,remote.progress,now),file.id);
 return {state,progress:remote.progress};
}
