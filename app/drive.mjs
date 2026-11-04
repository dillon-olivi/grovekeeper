// JournalScape phone app: the Drive app-folder file shared with the computer (same file and format as
// google-drive.mjs on the desktop). Uses a short-lived access token from Google's browser sign-in; no secrets.
export const SYNC_FILE='grovekeeper-sync.json',DRIVE_SCOPE='https://www.googleapis.com/auth/drive.appdata';
const API='https://www.googleapis.com/drive/v3/files',UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
export function createPhoneDrive({getToken,fetcher=(...a)=>fetch(...a)}){
 async function call(url,init={}){
  for(let attempt=0;attempt<2;attempt++){
   const token=await getToken(attempt>0);
   const r=await fetcher(url,{...init,headers:{...(init.headers||{}),Authorization:'Bearer '+token}});
   if(r.status===401&&attempt===0)continue;
   if(!r.ok){let reason='';try{reason=(await r.json())?.error?.errors?.[0]?.reason||'';}catch{}throw Error(/accessNotConfigured|SERVICE_DISABLED/i.test(reason)?'The Google Drive API is turned off in the Google Cloud project.':r.status===403?'Google Drive refused access. Sign in again.':`Google Drive is not responding (${r.status}). Your changes are kept on this phone.`);}
   return r.status===204?null:r.json();
  }
 }
 async function find(){const u=new URL(API);u.searchParams.set('spaces','appDataFolder');u.searchParams.set('q',`name='${SYNC_FILE}' and trashed=false`);u.searchParams.set('fields','files(id,modifiedTime,size)');
  const files=(await call(u))?.files||[];return files.sort((a,b)=>String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0]||null;}
 async function download(file){const u=new URL(API+'/'+encodeURIComponent(file.id));u.searchParams.set('alt','media');return call(u);}
 async function upload(content,fileId){
  const body=JSON.stringify(content);
  if(fileId){const u=new URL(UPLOAD+'/'+encodeURIComponent(fileId));u.searchParams.set('uploadType','media');u.searchParams.set('fields','id,modifiedTime');return call(u,{method:'PATCH',headers:{'Content-Type':'application/json'},body});}
  const b='grovekeeper-'+Math.random().toString(36).slice(2),meta=JSON.stringify({name:SYNC_FILE,parents:['appDataFolder'],mimeType:'application/json'});
  const u=new URL(UPLOAD);u.searchParams.set('uploadType','multipart');u.searchParams.set('fields','id,modifiedTime');
  return call(u,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${b}`},body:`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`});
 }
 return {find,download,upload};
}
