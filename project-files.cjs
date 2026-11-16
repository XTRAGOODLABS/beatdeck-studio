const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const MAGIC=Buffer.from('BEATDECKP001'),MAX_FILE=256*1024*1024,MAX_MANIFEST=16*1024*1024;
const ASSET_ID=/^(drum(?:[0-9]|1[0-5])|chop[0-3]|loop[0-7])$/;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function validateManifest(manifest){
  if(!manifest||manifest.format!=='beatdeck-project'||manifest.version!==1||typeof manifest.id!=='string'||manifest.id.length>100||typeof manifest.name!=='string'||manifest.name.length>200||!manifest.state||manifest.state.v!==7||!Array.isArray(manifest.assets)||manifest.assets.length>28)throw Error('Unsupported or invalid Beatdeck project');
  const seen=new Set();let bytes=0;
  for(const asset of manifest.assets){if(!ASSET_ID.test(asset.id)||seen.has(asset.id)||!Number.isSafeInteger(asset.byteLength)||asset.byteLength<44||asset.byteLength>MAX_FILE||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('Invalid project audio manifest');seen.add(asset.id);bytes+=asset.byteLength;}
  if(bytes>MAX_FILE)throw Error('Project audio exceeds 256 MB');return bytes;
}
async function writeProject(file,payload){
  const assets=Array.isArray(payload.assets)?payload.assets:[];
  const manifest={...payload.manifest,assets:assets.map(asset=>{const bytes=Buffer.from(asset.data);return {id:asset.id,byteLength:bytes.length,sha256:digest(bytes)};})};
  validateManifest(manifest);const json=Buffer.from(JSON.stringify(manifest));
  const bytes=assets.map(asset=>Buffer.from(asset.data));
  if(json.length>MAX_MANIFEST||MAGIC.length+4+json.length+bytes.reduce((n,b)=>n+b.length,0)>MAX_FILE)throw Error('Project exceeds the 256 MB file limit');
  const header=Buffer.alloc(MAGIC.length+4);MAGIC.copy(header);header.writeUInt32LE(json.length,MAGIC.length);
  const temporary=file+'.'+crypto.randomUUID()+'.tmp';let handle;
  try{
    handle=await fs.open(temporary,'wx',0o600);
    for(const buffer of [header,json,...bytes])for(let offset=0;offset<buffer.length;){const result=await handle.write(buffer,offset,Math.min(4*1024*1024,buffer.length-offset),null);if(!result.bytesWritten)throw Error('Incomplete project write');offset+=result.bytesWritten;}
    await handle.sync();await handle.close();handle=null;await fs.rename(temporary,file);return manifest;
  }finally{if(handle)await handle.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});}
}
async function readExact(handle,length,position){const data=Buffer.alloc(length);let offset=0;while(offset<length){const result=await handle.read(data,offset,length-offset,position+offset);if(!result.bytesRead)throw Error('Incomplete Beatdeck project');offset+=result.bytesRead;}return data;}
async function readProject(file,metadataOnly=false){
  const handle=await fs.open(file,'r');
  try{
    const info=await handle.stat();if(info.size>MAX_FILE||info.size<MAGIC.length+4)throw Error('Invalid project size');
    const header=await readExact(handle,MAGIC.length+4,0);if(!header.subarray(0,MAGIC.length).equals(MAGIC))throw Error('Not a Beatdeck project file');
    const size=header.readUInt32LE(MAGIC.length);if(size>MAX_MANIFEST||size<2||size>info.size-header.length)throw Error('Invalid project header');
    const manifest=JSON.parse((await readExact(handle,size,header.length)).toString('utf8')),total=validateManifest(manifest);
    if(header.length+size+total!==info.size)throw Error('Project is incomplete or contains unexpected data');
    if(metadataOnly)return {manifest,assets:[]};
    let offset=header.length+size;const assets=[];
    for(const asset of manifest.assets){const data=await readExact(handle,asset.byteLength,offset);if(digest(data)!==asset.sha256)throw Error('Project audio is damaged: '+asset.id);assets.push({id:asset.id,data:new Uint8Array(data)});offset+=asset.byteLength;}
    return {manifest,assets};
  }finally{await handle.close();}
}
function createProjectService({app,dialog,ipcMain,onCloseApproved,onCloseCanceled}){
  const windows=new Map(),pending=new Map();let index=[],ready=null,writeQueue=Promise.resolve();
  const root=path.join(app.getPath('userData'),'Songs'),indexFile=path.join(root,'recent.json'),recoveryFile=path.join(root,'recovery.beatdeck');
  const init=()=>ready||(ready=(async()=>{await fs.mkdir(root,{recursive:true});try{const data=JSON.parse(await fs.readFile(indexFile,'utf8'));if(Array.isArray(data))index=data.filter(x=>typeof x.id==='string'&&typeof x.filePath==='string').slice(0,20);}catch{}})());
  async function saveIndex(){const tmp=indexFile+'.tmp';await fs.writeFile(tmp,JSON.stringify(index),{mode:0o600});await fs.rename(tmp,indexFile);}
  async function remember(manifest,filePath){index=[{id:manifest.id,name:manifest.name,filePath,updated:manifest.updated},...index.filter(x=>x.id!==manifest.id&&x.filePath!==filePath)].slice(0,20);await saveIndex();app.addRecentDocument?.(filePath);}
  function windowState(event){const item=windows.get(event.sender.id);if(!item||item.win.webContents!==event.sender||event.senderFrame&&event.senderFrame!==event.sender.mainFrame)throw Error('Unknown project window');return item;}
  async function recoveryInfo(){try{const file=await readProject(recoveryFile,true);return {name:file.manifest.name,updated:file.manifest.updated};}catch{return null;}}
  function register(name,handler){ipcMain.handle('projects:'+name,async(event,...args)=>{try{const state=windowState(event);await init();return await handler(state,...args);}catch(error){return {error:error.message};}});}
  const library=require('./sample-library.cjs').createSampleLibrary({root,dialog});
  register('libraryInfo',()=>library.info());
  register('addFolder',(state,kind)=>library.add(state,kind));
  register('removeFolder',(state,kind,id)=>library.remove(state,kind,id));
  register('scanFolder',(state,kind,id)=>library.scan(state,kind,id));
  register('readLibrarySample',(state,token)=>library.read(state,token));
  register('info',async()=>({recent:index,recovery:await recoveryInfo()}));
  register('resume',async(state,id)=>{const previous=index.find(item=>item.id===id);state.current=previous?{id:previous.id,filePath:previous.filePath}:null;return {current:state.current};});
  register('save',async(state,payload,saveAs=false)=>{
    if(!payload?.manifest||!Array.isArray(payload.assets))throw Error('Missing song data');
    let target=!saveAs&&state.current?.id===payload.manifest.id?state.current.filePath:null;
    if(!target){
      const directory=path.join(app.getPath('documents'),'Beatdeck Songs');await fs.mkdir(directory,{recursive:true});
      const safe=String(payload.manifest.name||'Untitled').replace(/[\x00-\x1f/\\:]/g,'_').slice(0,100);
      const choice=await dialog.showSaveDialog(state.win,{title:'Save Beatdeck Song',defaultPath:path.join(directory,safe+'.beatdeck'),filters:[{name:'Beatdeck Song',extensions:['beatdeck']}],properties:['createDirectory','showOverwriteConfirmation']});
      if(choice.canceled||!choice.filePath)return {canceled:true};target=choice.filePath.endsWith('.beatdeck')?choice.filePath:choice.filePath+'.beatdeck';
    }
    payload={...payload,manifest:{...payload.manifest,name:path.basename(target,'.beatdeck').slice(0,200)}};
    let manifest;writeQueue=writeQueue.catch(()=>{}).then(async()=>{manifest=await writeProject(target,payload);});await writeQueue;
    state.current={id:manifest.id,filePath:target};await remember(manifest,target).catch(()=>{});await fs.unlink(recoveryFile).catch(()=>{});
    return {saved:true,id:manifest.id,name:manifest.name,filePath:target,recent:index};
  });
  async function stageOpen(state,filePath,recovery=false){
    const bundle=await readProject(filePath),token=crypto.randomUUID();
    pending.set(token,{window:state.win.webContents.id,filePath,manifest:bundle.manifest,recovery});
    if(pending.size>8)pending.delete(pending.keys().next().value);return {...bundle,token,recovery};
  }
  register('open',async(state,id)=>{
    let filePath;
    if(id){filePath=index.find(item=>item.id===id)?.filePath;if(!filePath)throw Error('Song is not in Recent Songs');}
    else{const choice=await dialog.showOpenDialog(state.win,{title:'Open Beatdeck Song',filters:[{name:'Beatdeck Song',extensions:['beatdeck']}],properties:['openFile']});if(choice.canceled||!choice.filePaths?.length)return {canceled:true};filePath=choice.filePaths[0];}
    return stageOpen(state,filePath);
  });
  register('recover',state=>stageOpen(state,recoveryFile,true));
  register('opened',async(state,token)=>{
    const item=pending.get(token);if(!item||item.window!==state.win.webContents.id)throw Error('Expired project open');pending.delete(token);
    if(item.recovery){const previous=index.find(x=>x.id===item.manifest.id);state.current=previous?{id:previous.id,filePath:previous.filePath}:null;}
    else{state.current={id:item.manifest.id,filePath:item.filePath};await remember(item.manifest,item.filePath).catch(()=>{});}
    return {recent:index,filePath:state.current?.filePath||null};
  });
  register('autosave',async(state,payload)=>{writeQueue=writeQueue.catch(()=>{}).then(()=>writeProject(recoveryFile,payload));await writeQueue;return {saved:true};});
  register('discardRecovery',async()=>{await fs.unlink(recoveryFile).catch(()=>{});return {};});
  register('confirm',async(state,name)=>{
    const result=await dialog.showMessageBox(state.win,{type:'question',message:'Save changes to '+String(name||'Untitled').slice(0,200)+'?',detail:'Your song has changes that have not been saved.',buttons:['Save','Discard Changes','Cancel'],defaultId:0,cancelId:2,noLink:true});return {choice:['save','discard','cancel'][result.response]||'cancel'};
  });
  register('title',async(state,name,dirty)=>{state.win.setTitle((dirty?'● ':'')+String(name||'Untitled').slice(0,200)+' — Beatdeck');return {};});
  register('close',async(state,allow)=>{state.closePending=false;clearTimeout(state.closeTimer);if(allow){state.allowClose=true;if(onCloseApproved)onCloseApproved(state.win);else state.win.close();}else onCloseCanceled?.();return {};});
  return {
    attachWindow(win){
      const state={win,current:null,allowClose:false,closePending:false,closeTimer:null},windowId=win.webContents.id;windows.set(windowId,state);
      win.on('closed',()=>{clearTimeout(state.closeTimer);windows.delete(windowId);});
      win.on('close',event=>{
        if(state.allowClose)return;event.preventDefault();if(state.closePending)return;state.closePending=true;win.webContents.send('projects:command','close');
        state.closeTimer=setTimeout(async()=>{
          if(!state.closePending)return;
          const choice=await dialog.showMessageBox(win,{type:'question',message:'Beatdeck is not responding to the close request.',buttons:['Keep Open','Close Window'],defaultId:0,cancelId:0});
          state.closePending=false;
          if(choice.response===1){state.allowClose=true;if(onCloseApproved)onCloseApproved(win);else win.close();}else onCloseCanceled?.();
        },5000);state.closeTimer.unref?.();
      });
    },
    command(command){for(const [id,state] of [...windows])if(state.win.isDestroyed())windows.delete(id);for(const state of windows.values())if(state.win.isFocused?.())return state.win.webContents.send('projects:command',command);const first=windows.values().next().value;if(first)first.win.webContents.send('projects:command',command);}
  };
}
module.exports={readProject,writeProject,createProjectService,MAGIC,MAX_FILE};
