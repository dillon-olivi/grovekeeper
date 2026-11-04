// Journal export (owner request, 4 November 2026; docs/JOURNAL.md): take your whole journal with you, as one readable
// document (.txt or .md) or a .zip with one text file per day. Pure functions with no imports, shared by the desktop page
// (journal-view.js) and the phone app (copied in by tools/build-mobile.mjs). Free in every edition: it is your writing.
// Oldest entry first, like a book. Nothing is uploaded: the file is saved where the user chooses (on a phone, the share
// sheet offers Files, Google Drive, email and so on).

const sorted=s=>[...(s?.journal||[])].sort((a,b)=>a.id.localeCompare(b.id));
const longDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
const words=t=>String(t||'').trim().split(/\s+/).filter(Boolean).length;
// Text files use Windows line endings so they open cleanly in Notepad as well as everywhere else.
const crlf=t=>t.replace(/\r?\n/g,'\r\n');

export const JOURNAL_EXPORT_FORMATS=[
 {id:'txt',label:'One text document (.txt)',hint:'Opens anywhere: Notepad, Word, Google Docs.'},
 {id:'md',label:'One Markdown document (.md)',hint:'For note apps such as Obsidian or Notion.'},
 {id:'zip',label:'One file per day (.zip)',hint:'A folder of text files, one for each day you wrote.'}
];

export function journalSummary(s){const list=sorted(s);return {entries:list.length,words:list.reduce((n,r)=>n+words(r.text),0),first:list[0]?.id||'',last:list.at(-1)?.id||''};}

export function journalDocument(s,format='txt',today=''){
 const list=sorted(s),sum=journalSummary(s),md=format==='md';
 const head=md?['# My journal','',`*Exported from JournalScape${today?' on '+longDate(today):''} · ${sum.entries} ${sum.entries===1?'entry':'entries'}, ${sum.words} words*`,'']
  :['MY JOURNAL',`Exported from JournalScape${today?' on '+longDate(today):''} · ${sum.entries} ${sum.entries===1?'entry':'entries'}, ${sum.words} words`,''];
 const body=list.map(r=>{const date=longDate(r.id);
  if(md)return [`## ${date}${r.title?' — '+r.title:''}`,'',r.text.trim(),''].join('\n');
  const top=date+(r.title?' — '+r.title:'');return [top,'-'.repeat(Math.min(top.length,60)),r.text.trim(),'',''].join('\n');}).join('\n');
 const out=head.join('\n')+'\n'+body;return md?out:crlf(out);
}

// A file name that is safe on Windows, macOS, Android and iOS.
export function entryFileName(r){
 const title=String(r.title||'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').replace(/\s+/g,' ').replace(/[. ]+$/,'').trim().slice(0,60);
 return r.id+(title?' - '+title:'')+'.txt';
}

// ---- A small, dependency-free .zip writer (stored, not compressed; UTF-8 names). Journals are text, so files stay small.
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function zipFiles(files,when=new Date(2026,0,1)){
 const enc=new TextEncoder(),dosTime=(when.getHours()<<11)|(when.getMinutes()<<5)|(when.getSeconds()>>1),dosDate=((when.getFullYear()-1980)<<9)|((when.getMonth()+1)<<5)|when.getDate();
 const local=[],central=[];let offset=0;
 for(const f of files){
  const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);
  const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,dosTime,true);h.setUint16(12,dosDate,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);h.setUint16(28,0,true);
  const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,dosTime,true);c.setUint16(14,dosDate,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
  local.push(new Uint8Array(h.buffer),name,data);central.push(new Uint8Array(c.buffer),name);offset+=30+name.length+data.length;
 }
 const size=central.reduce((n,p)=>n+p.length,0),end=new DataView(new ArrayBuffer(22));
 end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,size,true);end.setUint32(16,offset,true);
 const parts=[...local,...central,new Uint8Array(end.buffer)],out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;
}

// The finished file: {name, type, data} where data is a string or bytes, ready for a Blob.
export function exportJournal(s,format='txt',today=''){
 const stamp=today||'export';
 if(format==='zip'){
  const used=new Set(),files=sorted(s).map(r=>{let name=entryFileName(r);for(let i=2;used.has(name.toLowerCase());i++)name=entryFileName(r).replace(/\.txt$/,` (${i}).txt`);used.add(name.toLowerCase());
   return {name:'JournalScape journal/'+name,data:crlf([longDate(r.id)+(r.title?' — '+r.title:''),'',r.text.trim(),''].join('\n'))};});
  files.unshift({name:'JournalScape journal/README.txt',data:crlf(journalDocument(s,'txt',today).split('\n').slice(0,2).join('\n')+'\n\nOne file per day you wrote, named by date (year-month-day) so they sort in order.\n')});
  return {name:`JournalScape journal ${stamp}.zip`,type:'application/zip',data:zipFiles(files)};
 }
 const md=format==='md';return {name:`JournalScape journal ${stamp}.${md?'md':'txt'}`,type:md?'text/markdown;charset=utf-8':'text/plain;charset=utf-8',data:(md?'':'﻿')+journalDocument(s,format,today)};
}
