// JournalScape phone app (owner approved 3 November 2026; docs/PHONE-APP.md). Today's tasks and routines, quick add,
// the coming week, and your level as of the computer's last sync. Changes save on the phone first and sync through
// the same private Google Drive file as the desktop. Works offline; nothing is sent anywhere except your own Drive.
import {todayView,addTask,toggleTask,deleteTask,toggleRoutine,moveTask,commit,syncWithDrive,driveChanged,isoDay,addDays} from './logic.mjs';
import {createPhoneDrive,DRIVE_SCOPE} from './drive.mjs';
import {WEB_CLIENT_ID} from './config.mjs';
import {addItem,setInTrip,toggleGot,loadTrip,finishTrip,tripView,masterView,guessSection} from './groceries.mjs';
import {entryFor,writeEntry,journalList,wordCount,randomPrompt,JOURNAL_LIMITS} from './journal.mjs';

const KEY='grovekeeper.phone.v1',$=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const test=globalThis.__gkTest||null;   // automated checks inject a fake Drive and date (never set in normal use)
const today=()=>test?.today||isoDay();
let store=load(),syncing=false,syncError='',dirty=false,addDay='today',undoTimer,oneOff=false;

function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s?.state)return s;}catch{}return {device:null,state:null,progress:null,lastSync:null};}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch{toast('This phone is out of storage space. Your last change may not be kept.');}}
if(!store.device){store.device='phone-'+(crypto.randomUUID?.()||Date.now().toString(36)).replace(/[^A-Za-z0-9-]/g,'').slice(0,48);persist();}

// Google sign-in (browser token, Drive app folder only). The token lives in memory and is renewed when needed.
let token=null,tokenExpires=0,tokenClient=null,pendingToken=null;
function gis(){return new Promise((resolve,reject)=>{if(globalThis.google?.accounts?.oauth2)return resolve();const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=resolve;s.onerror=()=>reject(Error('Google sign-in could not load. Check your connection.'));document.head.append(s);});}
async function getToken(force=false){
 if(test)return 'test-token';
 if(!force&&token&&Date.now()<tokenExpires-60000)return token;
 if(!WEB_CLIENT_ID)throw Error('This copy of the app has no Google sign-in set up yet.');
 await gis();
 if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({client_id:WEB_CLIENT_ID,scope:DRIVE_SCOPE,callback:()=>{}});
 if(pendingToken)return pendingToken;
 pendingToken=new Promise((resolve,reject)=>{tokenClient.callback=r=>{pendingToken=null;if(r.error||!r.access_token)return reject(Error('Google sign-in was not completed.'));token=r.access_token;tokenExpires=Date.now()+(Number(r.expires_in)||3600)*1000;resolve(token);};tokenClient.error_callback=()=>{pendingToken=null;reject(Error('Google sign-in was closed.'));};tokenClient.requestAccessToken({prompt:store.state?'':'consent'});});
 return pendingToken;
}
const drive=test?.drive||createPhoneDrive({getToken});

async function sync(file){
 if(syncing)return;if(!navigator.onLine&&!test){renderSync();return;}
 syncing=true;renderSync();
 try{const result=await syncWithDrive({drive,local:store.state?{state:store.state,progress:store.progress}:null,device:store.device,file});if((result.progress?.totalXP??null)!==(store.progress?.totalXP??null))store.pending=[];   // the computer has counted them
  store.state=result.state;store.progress=result.progress;store.seen=result.seen;store.lastSync=new Date().toISOString();syncError='';dirty=false;persist();}
 catch(e){syncError=e.message;}
 finally{syncing=false;render();}
}
// While the app is open: a metadata-only check every few seconds; download only when the computer changed something.
async function check(){
 if(syncing||!store.state||document.hidden||(!navigator.onLine&&!test))return;
 if(document.activeElement?.matches?.('#add input,#gadd input')&&document.activeElement.value)return;
 if(['jtext','jtitle'].includes(document.activeElement?.id)||journalTimer)return;   // never reload the journal under someone writing   // never redraw under someone typing
 if(dirty)return sync();
 try{const file=await driveChanged(drive,store.seen);if(file)await sync(file);else{store.lastSync=new Date().toISOString();syncError='';persist();renderSync();}}catch(e){syncError=e.message;renderSync();}
}
let syncTimer;const syncSoon=(ms=800)=>{clearTimeout(syncTimer);syncTimer=setTimeout(sync,ms);};
function edit(fn){const prev=store.state,next=fn(prev);if(next===prev)return;store.state=commit(prev,next,store.device);dirty=true;persist();render();syncSoon();}

function ago(iso){if(!iso)return '';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function renderSync(){
 const b=$('#sync');
 b.textContent=syncing?'Syncing…':!navigator.onLine&&!test?'Offline · saved on phone':syncError?'Sync problem · tap':dirty?'Saving…':store.lastSync?'Synced '+ago(store.lastSync):'Sign in';
 b.title=syncError||'Sync now';
}
const label=day=>day===today()?'Today':day===addDays(today(),1)?'Tomorrow':new Date(day+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});

function render(){
 renderSync();const app=$('#app');
 if(!store.state){app.innerHTML=`<section class="card welcome"><h2>Your JournalScape, on your phone</h2><p class="muted">Sign in with the same Google account you connected on your computer (Settings → General → Phone sync). JournalScape opens only its own private folder in your Drive.</p><button class="primary" data-act="signin">Sign in with Google</button>${syncError?`<p class="small" style="color:#8a3b2e">${esc(syncError)}</p>`:''}</section>`;return;}
 const tabs=`<nav class="tabs" role="tablist">${[['today','Today'],['journal','Journal'],['groceries','Groceries']].map(([k,l])=>`<button type="button" role="tab" data-tab="${k}" aria-selected="${(store.tab||'today')===k}">${l}</button>`).join('')}</nav>`;
 if(store.tab==='groceries'){app.innerHTML=tabs+groceriesView();return;}
 if(store.tab==='journal'){app.innerHTML=tabs+journalView();return;}
 const d=today(),v=todayView(store.state,d),p=store.progress;
 // Completions made here count when the computer next syncs (XP is calculated there; 10 XP per task, docs/LEVEL-REWARDS.md).
 const pending=(store.pending||[]).filter(id=>store.state.tasks.some(t=>t.id===id&&t.done)).length;
 const level=p?`<section class="card level"><div class="row"><span class="title">${esc(p.title||'Wanderer')}</span><span class="lv">LEVEL ${esc(p.level)}</span></div><div class="track"><span style="width:${Math.min(100,(p.progressXP||0)/(p.levelXP||1)*100)}%"></span></div><div class="small">${esc(p.progressXP)} / ${esc(p.levelXP)} XP · as of your computer's last sync</div>${pending?`<div class="pending">+${pending*10} XP on its way · counted when your computer syncs</div>`:''}</section>`:'';
 const taskRow=t=>`<li class="${t.done?'done':''}"><button class="check" data-act="task" data-id="${esc(t.id)}" aria-pressed="${t.done}" aria-label="${t.done?'Reopen':'Complete'} ${esc(t.title)}">${t.done?'✓':''}</button><span class="text">${esc(t.title)}</span><button class="del" data-act="delete" data-id="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">×</button></li>`;
 const routineRow=r=>`<li class="${r.done?'done':''}"><button class="check" data-act="routine" data-id="${esc(r.id)}" aria-pressed="${r.done}" aria-label="${r.done?'Reopen':'Complete'} routine ${esc(r.title)}">${r.done?'✓':''}</button><span class="text">${esc(r.title)}<span class="tag">Routine</span></span></li>`;
 const upcoming=v.upcoming.map(t=>`<li><button class="check" data-act="task" data-id="${esc(t.id)}" aria-pressed="false" aria-label="Complete ${esc(t.title)}"></button><span class="text">${esc(t.title)}<br><span class="when">${esc(label(t.date))}</span></span><button class="del" data-act="today" data-id="${esc(t.id)}" aria-label="Move ${esc(t.title)} to today" title="Do it today">↑</button></li>`).join('');
 app.innerHTML=`${tabs}${level}
 <section class="card"><form class="add" id="add"><input name="title" maxlength="300" placeholder="Add a task" autocomplete="off" aria-label="New task"><button class="primary">Add</button></form>
  <div class="chips" role="group" aria-label="When">${['today','tomorrow'].map(k=>`<button type="button" data-day="${k}" aria-pressed="${addDay===k}">${k==='today'?'Today':'Tomorrow'}</button>`).join('')}</div></section>
 <section class="card"><h2>Today <span class="small muted">${v.done} of ${v.total} done</span></h2><ul class="list">${v.tasks.map(taskRow).join('')||'<li class="empty">Nothing planned yet. Add a task above.</li>'}</ul></section>
 ${v.routines.length?`<section class="card"><h2>Routines</h2><ul class="list">${v.routines.map(routineRow).join('')}</ul></section>`:''}
 ${upcoming?`<section class="card"><h2>Coming up</h2><ul class="list">${upcoming}</ul></section>`:''}
 <footer class="foot"><button data-act="sync">Sync now</button><button data-act="forget">Remove from this phone</button></footer>`;
}
// Groceries (3 November 2026; docs/GROCERIES.md): the trip by aisle, tap to check off; usual items and saved trips below.
// Journal (3 November 2026; docs/JOURNAL.md): today's entry (or any earlier day), saved as you write; earlier entries below.
let journalDay=null,journalTimer=null,journalPrompt=randomPrompt();
const shiftDay=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
function journalView(){
 const d=journalDay||today(),e=entryFor(store.state,d),list=journalList(store.state).slice(0,30);
 return `<section class="card journal"><div class="jhead"><button type="button" data-act="jprev" aria-label="Previous day">‹</button><h2>${esc(label(d))}</h2><button type="button" data-act="jnext" aria-label="Next day">›</button></div>
  <input type="text" id="jtitle" maxlength="${JOURNAL_LIMITS.title}" placeholder="Title (optional)" aria-label="Title for ${esc(label(d))}" value="${esc(e?.title||'')}" autocomplete="off" enterkeyhint="next">
  <textarea id="jtext" placeholder="${esc(journalPrompt)}" aria-label="Journal entry for ${esc(label(d))}">${esc(e?e.text:'')}</textarea>
  <div class="small muted" id="jcount">${e?wordCount(e.text)+' words':''}</div></section>
 ${list.length?`<section class="card"><h2>Past entries</h2><ul class="list">${list.map(r=>`<li><button type="button" class="jitem" data-act="jopen" data-id="${esc(r.id)}"><span class="when">${esc(longDay(r.id))}</span><strong class="${r.title?'':'untitled'}">${esc(r.name||'Untitled')}</strong></button></li>`).join('')}</ul></section>`:''}`;
}
// Saving a journal entry never redraws the page (so the keyboard and cursor stay put while writing).
function saveJournal(){clearTimeout(journalTimer);journalTimer=null;const t=$('#jtext');if(!t)return;const d=journalDay||today(),prev=store.state,next=writeEntry(prev,d,t.value,$('#jtitle')?.value??'');if(next===prev)return;store.state=commit(prev,next,store.device);dirty=true;persist();renderSync();syncSoon();}
document.addEventListener('input',e=>{if(e.target.id!=='jtext'&&e.target.id!=='jtitle')return;const n=wordCount($('#jtext')?.value);$('#jcount').textContent=n?n+' words':'';clearTimeout(journalTimer);journalTimer=setTimeout(saveJournal,800);});
document.addEventListener('focusout',e=>{if(e.target.id==='jtext'||e.target.id==='jtitle')saveJournal();});
document.addEventListener('keydown',e=>{if(e.target.id==='jtitle'&&e.key==='Enter'){e.preventDefault();$('#jtext')?.focus();}});
// "Today · Tuesday, November 3", or the weekday and date (the year only when it is not this year).
function longDay(d){const t=today(),date=new Date(d+'T12:00:00'),full=date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',...(d.slice(0,4)===t.slice(0,4)?{}:{year:'numeric'})});return d===t?'Today · '+full:d===shiftDay(t,-1)?'Yesterday · '+full:full;}
function groceriesView(){
 const s=store.state,v=tripView(s),usual=masterView(s),trips=s.groceryTrips||[];
 const row=r=>`<li class="${r.got?'done':''}"><button class="check" data-act="got" data-id="${esc(r.id)}" aria-pressed="${r.got}" aria-label="${r.got?'Put back':'Got'} ${esc(r.name)}">${r.got?'✓':''}</button><span class="text">${esc(r.name)}${r.note?` <span class="tag">${esc(r.note)}</span>`:''}${r.staple?'':'<span class="tag">once</span>'}</span><button class="del" data-act="unpull" data-id="${esc(r.id)}" aria-label="Take ${esc(r.name)} off this trip">×</button></li>`;
 return `<section class="card"><form class="add" id="gadd"><input name="title" maxlength="120" placeholder="Add an item" autocomplete="off" aria-label="Grocery item"><button class="primary">Add</button></form>
  <div class="chips"><button type="button" data-act="oneoff" aria-pressed="${oneOff}">Just this once</button></div></section>
 <section class="card"><h2>This trip <span class="small muted">${v.total?`${v.got} of ${v.total} in the cart`:''}</span></h2>
  ${v.total?v.sections.map(sec=>`<h3 class="aisle">${esc(sec.label)}</h3><ul class="list">${sec.items.map(row).join('')}</ul>`).join(''):'<p class="empty">Nothing on this trip yet. Add an item, or tap your usual items below.</p>'}
  ${v.got?`<button class="primary wide" data-act="finish">Finish trip (${v.got} bought)</button>`:''}</section>
 ${trips.length?`<section class="card"><h2>Saved trips</h2><div class="chips wrap">${trips.map(t=>`<button type="button" data-act="loadtrip" data-id="${esc(t.id)}" ${t.items.length?'':'disabled'}>+ ${esc(t.name)}</button>`).join('')}</div></section>`:''}
 ${usual.length?`<section class="card"><h2>Usual items</h2><ul class="list">${usual.map(r=>`<li class="${r.inTrip?'on':''}"><span class="text">${esc(r.name)}</span><button class="pill${r.inTrip?' on':''}" data-act="${r.inTrip?'unpull':'pull'}" data-id="${esc(r.id)}" aria-pressed="${r.inTrip}">${r.inTrip?'✓ On trip':'+ Add'}</button></li>`).join('')}</ul></section>`:''}`;
}
function toast(text,undo){const t=$('#toast');clearTimeout(undoTimer);t.innerHTML=`<span>${esc(text)}</span>${undo?'<button type="button">Undo</button>':''}`;t.hidden=false;if(undo)t.querySelector('button').onclick=()=>{t.hidden=true;undo();};undoTimer=setTimeout(()=>{t.hidden=true;},6000);}

document.addEventListener('submit',e=>{if(e.target.id==='gadd'){e.preventDefault();const input=e.target.elements.title,name=input.value.trim();if(!name)return;edit(s=>addItem(s,{name,section:guessSection(name),staple:!oneOff,inTrip:true}));oneOff=false;input.value='';render();$('#gadd input')?.focus();return;}if(e.target.id!=='add')return;e.preventDefault();const input=e.target.elements.title,day=addDay==='today'?today():addDays(today(),1);edit(s=>addTask(s,input.value,day));input.value='';input.focus();});
document.addEventListener('click',e=>{
 const tab=e.target.closest('[data-tab]');if(tab){saveJournal();store.tab=tab.dataset.tab;persist();render();scrollTo(0,0);return;}
 const day=e.target.closest('[data-day]');if(day){addDay=day.dataset.day;render();$('#add input')?.focus();return;}
 const b=e.target.closest('[data-act]');if(!b)return;const id=b.dataset.id;
 switch(b.dataset.act){
  case 'jprev':saveJournal();journalDay=shiftDay(journalDay||today(),-1);journalPrompt=randomPrompt();render();break;
  case 'jnext':saveJournal();journalDay=shiftDay(journalDay||today(),1);journalPrompt=randomPrompt();render();break;
  case 'jopen':saveJournal();journalDay=id;journalPrompt=randomPrompt();render();scrollTo(0,0);break;
  case 'got':edit(s=>toggleGot(s,id));break;
  case 'pull':edit(s=>setInTrip(s,id,true));break;
  case 'unpull':edit(s=>setInTrip(s,id,false));break;
  case 'loadtrip':edit(s=>loadTrip(s,id));break;
  case 'oneoff':oneOff=!oneOff;render();$('#gadd input')?.focus();break;
  case 'finish':{const before=store.state;edit(s=>finishTrip(s));toast('Trip finished. Bought items are back on your usual list.',()=>edit(s=>({...s,groceries:before.groceries,groceryTrips:before.groceryTrips})));break;}
  case 'signin':sync();break;
  case 'sync':sync();break;
  case 'task':{edit(s=>toggleTask(s,id,today()));const done=store.state.tasks.find(t=>t.id===id)?.done,list=(store.pending||[]).filter(x=>x!==id);store.pending=done?[...list,id]:list;persist();render();break;}
  case 'routine':edit(s=>toggleRoutine(s,id,today()));break;
  case 'today':edit(s=>moveTask(s,id,today()));break;
  case 'delete':{const t=store.state.tasks.find(x=>x.id===id),at=store.state.tasks.indexOf(t);edit(s=>deleteTask(s,id));toast(`Deleted “${t.title.slice(0,40)}”`,()=>edit(s=>s.tasks.some(x=>x.id===id)?s:{...s,tasks:[...s.tasks.slice(0,at),t,...s.tasks.slice(at)]}));break;}
  case 'forget':if(confirm('Remove JournalScape data from this phone? Your planner stays on your computer and in Drive.')){localStorage.removeItem(KEY);store=load();store.device=null;token=null;location.reload();}break;
 }
});
$('#sync').onclick=()=>sync();
addEventListener('online',()=>sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden&&store.state)sync();});
setInterval(check,5000);
if('serviceWorker' in navigator&&!test&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
render();if(store.state)sync();
