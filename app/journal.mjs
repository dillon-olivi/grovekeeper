// Daily journal (owner request, 3 November 2026; docs/JOURNAL.md). One entry per day, saved with that day and reopened
// any time. Pure functions shared by the desktop page (journal-view.js), the server's planner validation (core.mjs) and
// the phone app (copied in by tools/build-mobile.mjs). Entries never award XP and are never shown to anyone else.
// Each entry carries the same change stamps as tasks, so phone and computer merge per day (the newest edit of a day wins).
export const JOURNAL_LIMITS={entries:10000,text:20000};
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,DEVICE=/^[A-Za-z0-9-]{1,64}$/,DAY=/^\d{4}-\d{2}-\d{2}$/;
const stampOk=r=>(r.updatedAt===undefined&&r.updatedBy===undefined)||(typeof r.updatedAt==='string'&&ISO.test(r.updatedAt)&&typeof r.updatedBy==='string'&&DEVICE.test(r.updatedBy));
const validDay=s=>typeof s==='string'&&DAY.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;

// Validation for the planner file. The id is the day itself, so there is at most one entry per day.
export function validateJournal(s){
 const list=s.journal===undefined?[]:s.journal;
 if(!Array.isArray(list))throw Error('Invalid journal.');
 if(list.length>JOURNAL_LIMITS.entries)throw Error('Too many journal entries.');
 const days=new Set();
 return list.map(r=>{
  if(!r||!validDay(r.id)||r.date!==r.id||days.has(r.id))throw Error('Journal entries need one valid date each.');
  if(typeof r.text!=='string'||!r.text.trim()||r.text.length>JOURNAL_LIMITS.text)throw Error('Journal entries must be text up to '+JOURNAL_LIMITS.text.toLocaleString('en-US')+' characters.');
  if(!stampOk(r))throw Error('Invalid change stamp on a journal entry.');
  days.add(r.id);return {id:r.id,date:r.date,text:r.text,...(r.updatedAt?{updatedAt:r.updatedAt,updatedBy:r.updatedBy}:{})};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

// Edits. Writing an empty entry removes that day's entry.
const list=s=>s.journal||[];
export const entryFor=(s,day)=>list(s).find(r=>r.id===day)||null;
export function writeEntry(s,day,text){
 if(!validDay(day))return s;
 const body=String(text??'').slice(0,JOURNAL_LIMITS.text),old=entryFor(s,day);
 if(!body.trim())return old?{...s,journal:list(s).filter(r=>r.id!==day)}:s;
 if(old&&old.text===body)return s;
 const next=old?list(s).map(r=>r.id===day?{...r,text:body}:r):[...list(s),{id:day,date:day,text:body}];
 return {...s,journal:next.sort((a,b)=>a.id.localeCompare(b.id))};
}
// Newest first, with a one-line preview; an optional search matches words anywhere in the entry.
export function journalList(s,query=''){
 const q=String(query).trim().toLocaleLowerCase();
 return list(s).filter(r=>!q||r.text.toLocaleLowerCase().includes(q)).sort((a,b)=>b.id.localeCompare(a.id))
  .map(r=>({id:r.id,date:r.date,preview:r.text.replace(/\s+/g,' ').trim().slice(0,140),words:r.text.trim().split(/\s+/).filter(Boolean).length}));
}
export const wordCount=text=>String(text||'').trim().split(/\s+/).filter(Boolean).length;
