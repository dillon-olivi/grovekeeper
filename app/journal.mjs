// Daily journal (owner request, 3 November 2026; docs/JOURNAL.md). One entry per day, saved with that day and reopened
// any time. Pure functions shared by the desktop page (journal-view.js), the server's planner validation (core.mjs) and
// the phone app (copied in by tools/build-mobile.mjs). Entries never award XP and are never shown to anyone else.
// Each entry carries the same change stamps as tasks, so phone and computer merge per day (the newest edit of a day wins).
// Owner, 3 November 2026: no length limit on writing, and an optional title per day. The text ceiling below is only a
// guard against a damaged file (about 150,000 words in one day); the title is one short line.
export const JOURNAL_LIMITS={entries:10000,text:1000000,title:120};
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,DEVICE=/^[A-Za-z0-9-]{1,64}$/,DAY=/^\d{4}-\d{2}-\d{2}$/;
const stampOk=r=>(r.updatedAt===undefined&&r.updatedBy===undefined)||(typeof r.updatedAt==='string'&&ISO.test(r.updatedAt)&&typeof r.updatedBy==='string'&&DEVICE.test(r.updatedBy));
const validDay=s=>typeof s==='string'&&DAY.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const cleanTitle=t=>String(t??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,JOURNAL_LIMITS.title);

// Validation for the planner file. The id is the day itself, so there is at most one entry per day. An entry needs
// writing or a title (or both).
export function validateJournal(s){
 const list=s.journal===undefined?[]:s.journal;
 if(!Array.isArray(list))throw Error('Invalid journal.');
 if(list.length>JOURNAL_LIMITS.entries)throw Error('Too many journal entries.');
 const days=new Set();
 return list.map(r=>{
  if(!r||!validDay(r.id)||r.date!==r.id||days.has(r.id))throw Error('Journal entries need one valid date each.');
  if(typeof r.text!=='string'||r.text.length>JOURNAL_LIMITS.text)throw Error('Journal entries must be text.');
  if(r.title!==undefined&&(typeof r.title!=='string'||!r.title.trim()||r.title.length>JOURNAL_LIMITS.title||/[\r\n]/.test(r.title)))throw Error('Journal titles are one line of up to '+JOURNAL_LIMITS.title+' characters.');
  if(!r.text.trim()&&!r.title)throw Error('Empty journal entry.');
  if(r.finishedAt!==undefined&&(typeof r.finishedAt!=='string'||!ISO.test(r.finishedAt)))throw Error('Invalid finish time on a journal entry.');
  if(!stampOk(r))throw Error('Invalid change stamp on a journal entry.');
  days.add(r.id);return {id:r.id,date:r.date,...(r.title!==undefined?{title:r.title}:{}),text:r.text,...(r.finishedAt?{finishedAt:r.finishedAt}:{}),...(r.updatedAt?{updatedAt:r.updatedAt,updatedBy:r.updatedBy}:{})};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

// Edits. Pass the text, and optionally a title (leave it out to keep the current title). Clearing both removes the day.
const list=s=>s.journal||[];
export const entryFor=(s,day)=>list(s).find(r=>r.id===day)||null;
export function writeEntry(s,day,text,title){
 if(!validDay(day))return s;
 const old=entryFor(s,day),body=String(text??'').slice(0,JOURNAL_LIMITS.text),name=title===undefined?(old?.title||''):cleanTitle(title);
 if(!body.trim()&&!name)return old?{...s,journal:list(s).filter(r=>r.id!==day)}:s;
 if(old&&old.text===body&&(old.title||'')===name)return s;
 const make=r=>{const {title:_,...rest}=r;return {...rest,...(name?{title:name}:{}),text:body};};
 const next=old?list(s).map(r=>r.id===day?make(r):r):[...list(s),make({id:day,date:day})];
 return {...s,journal:next.sort((a,b)=>a.id.localeCompare(b.id))};
}
// Finish the day's entry (owner, 4 November 2026): the "I journaled today" confirmation. It stays finished if you
// come back and add more; finishing again only refreshes the time. Never XP.
export function finishEntry(s,day,at=new Date().toISOString()){
 const old=entryFor(s,day);if(!old||!ISO.test(at))return s;
 return {...s,journal:list(s).map(r=>r.id===day?{...r,finishedAt:at}:r)};
}
export const isFinished=r=>!!r?.finishedAt;
export const wordCount=text=>String(text||'').trim().split(/\s+/).filter(Boolean).length;
// The name shown in lists: the title, or the first three words when there is no title.
export function entryName(r){
 if(r.title)return r.title;
 const words=String(r.text||'').trim().split(/\s+/).filter(Boolean);
 return words.slice(0,3).join(' ')+(words.length>3?'…':'');
}
// Newest first; an optional search matches the title or words anywhere in the entry.
export function journalList(s,query=''){
 const q=String(query).trim().toLocaleLowerCase();
 return list(s).filter(r=>!q||r.text.toLocaleLowerCase().includes(q)||(r.title||'').toLocaleLowerCase().includes(q)).sort((a,b)=>b.id.localeCompare(a.id))
  .map(r=>({id:r.id,date:r.date,finished:!!r.finishedAt,title:r.title||'',name:entryName(r),preview:r.text.replace(/\s+/g,' ').trim().slice(0,140),words:wordCount(r.text)}));
}

// A gentle, encouraging line for an empty page, picked at random each time a day is opened.
export const JOURNAL_PROMPTS=[
 'Did today go well?',
 'No matter how today went, writing something is always a good choice.',
 'Being here is good enough.',
 'Did you get what you wanted done today?',
 'Let your thoughts out.',
 'What is one thing you want to remember about today?',
 'A few words count. So does one.',
 'What made you smile today?',
 'What was hard today? You got through it.',
 'You showed up today. That matters.',
 'What are you grateful for right now?',
 'What did you learn today, big or small?',
 'Write it down, then let it go.',
 'What would make tomorrow a little easier?',
 'Who made your day better?',
 'What are you proud of today?',
 'There is no wrong way to do this.',
 'Rest is progress too. How are you feeling?',
 'What gave you energy today, and what drained it?',
 'Small steps still move you forward. What was yours today?',
 'Be kind to yourself on the page.',
 'What is on your mind right now?',
 'Today does not have to be perfect to be worth writing about.',
 'What would you tell a friend who had your day?',
 'One good thing about today…',
 'Your story is worth keeping.',
 'What surprised you today?',
 'Take a breath. Then write whatever comes.',
 'What did you do today that future you will thank you for?',
 'Every page is a fresh start.'
];
export const randomPrompt=(rand=Math.random)=>JOURNAL_PROMPTS[Math.floor(rand()*JOURNAL_PROMPTS.length)%JOURNAL_PROMPTS.length];

// Journal analytics (owner, 4 November 2026): how often and how much you write. Days are local planner days (ISO).
// Optional from/to limit the period; streaks always look at the whole journal and end today (or yesterday, so an
// unwritten today does not break a streak before the day is over).
const nextDay=d=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10);};
export function journalStats(s,{from='',to='',today=''}={}){
 const all=list(s).filter(r=>r.text.trim()||r.title).sort((a,b)=>a.id.localeCompare(b.id));
 const rows=all.filter(r=>(!from||r.id>=from)&&(!to||r.id<=to)),byDay={};
 for(const r of rows)byDay[r.id]=wordCount(r.text);
 const words=rows.reduce((n,r)=>n+byDay[r.id],0),longest=rows.reduce((b,r)=>byDay[r.id]>(b?.words||0)?{id:r.id,words:byDay[r.id]}:b,null);
 let best=0,run=0,prev='';for(const r of all){run=prev&&nextDay(prev)===r.id?run+1:1;best=Math.max(best,run);prev=r.id;}
 let current=0;if(today&&all.length){const days=new Set(all.map(r=>r.id));let d=days.has(today)?today:(()=>{const y=new Date(today+'T12:00:00Z');y.setUTCDate(y.getUTCDate()-1);return y.toISOString().slice(0,10);})();
  while(days.has(d)){current++;const y=new Date(d+'T12:00:00Z');y.setUTCDate(y.getUTCDate()-1);d=y.toISOString().slice(0,10);}}
 return {entries:rows.length,words,average:rows.length?Math.round(words/rows.length):0,finished:rows.filter(r=>r.finishedAt).length,longest,byDay,streak:current,bestStreak:best,total:all.length};
}
