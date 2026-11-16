const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const AUDIO=/\.(wav|aif|aiff|mp3|m4a|flac|ogg)$/i;
function createSampleLibrary({root,dialog,tracklibRoot=path.join(require('node:os').homedir(),'Desktop','TRACKLIB')}){
  const file=path.join(root,'sample-folders.json'),tokens=new Map();let folders={samples:[],drums:[],tracklib:[]},ready=null,queue=Promise.resolve();
  const kind=value=>{if(!['samples','drums','tracklib'].includes(value))throw Error('Unknown library type');return value;};
  const init=()=>ready||(ready=(async()=>{
    await fs.mkdir(root,{recursive:true});let tracklibConfigured=false;
    try{const saved=JSON.parse(await fs.readFile(file,'utf8'));tracklibConfigured=Array.isArray(saved.tracklib);for(const type of ['samples','drums','tracklib'])if(Array.isArray(saved[type]))folders[type]=saved[type].filter(x=>x&&typeof x.id==='string'&&typeof x.path==='string').slice(0,40);}catch{}
    if(!tracklibConfigured&&tracklibRoot)try{const directory=await fs.realpath(tracklibRoot);if((await fs.stat(directory)).isDirectory())folders.tracklib=[{id:'tracklib-local',path:directory,name:path.basename(directory)}];}catch{}
  })());
  async function persist(){const snapshot=JSON.stringify(folders);queue=queue.catch(()=>{}).then(async()=>{const temp=file+'.tmp';await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,file);});await queue;}
  return {
    async info(){await init();return folders;},
    async add(state,type){type=kind(type);await init();if(folders[type].length>=40)throw Error('Maximum 40 folders per library');const selected=await dialog.showOpenDialog(state.win,{title:type==='tracklib'?'Add Tracklib Folder':type==='drums'?'Add Drum Folder':'Add Sample Folder',properties:['openDirectory']});if(selected.canceled||!selected.filePaths?.length)return {canceled:true};const directory=await fs.realpath(selected.filePaths[0]);if(!(await fs.stat(directory)).isDirectory())throw Error('Choose a folder');if(!folders[type].some(x=>x.path===directory))folders[type].push({id:crypto.randomUUID(),path:directory,name:path.basename(directory)||directory});await persist();return {folders};},
    async remove(_state,type,id){type=kind(type);await init();folders[type]=folders[type].filter(x=>x.id!==id);for(const [token,entry] of tokens)if(entry.folderId===id)tokens.delete(token);await persist();return {folders};},
    async scan(_state,type,id){
      type=kind(type);await init();const folder=folders[type].find(x=>x.id===id);if(!folder)throw Error('Folder is not in this library');
      for(const [token,entry] of tokens)if(entry.folderId===id)tokens.delete(token);
      const rootPath=await fs.realpath(folder.path),files=[];let skipped=0,truncated=false;
      async function walk(directory,depth){
        if(depth>8){skipped++;return;}let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch{skipped++;return;}
        entries.sort((a,b)=>a.name.localeCompare(b.name));
        for(const entry of entries){
          if(files.length>=5000){truncated=true;return;}if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
          const candidate=path.join(directory,entry.name);if(entry.isDirectory())await walk(candidate,depth+1);
          else if(entry.isFile()&&AUDIO.test(entry.name)){
            const token=crypto.randomUUID();tokens.set(token,{path:candidate,root:rootPath,folderId:id});files.push({id:token,name:entry.name,relative:path.relative(rootPath,candidate)});
          }
        }
      }
      await walk(rootPath,0);if(tokens.size>20000){const keep=new Set(files.map(f=>f.id));for(const key of tokens.keys())if(tokens.size>20000&&!keep.has(key))tokens.delete(key);}
      return {files,skipped,truncated};
    },
    async read(_state,token){
      const entry=tokens.get(token);if(!entry)throw Error('Refresh the folder before loading this file');
      if(!Object.values(folders).flat().some(folder=>folder.id===entry.folderId))throw Error('Folder was removed');
      const actual=await fs.realpath(entry.path),relative=path.relative(entry.root,actual);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('File is outside the selected folder');
      const info=await fs.stat(actual);if(!info.isFile()||info.size>128*1024*1024)throw Error('Audio file is too large (maximum 128 MB)');
      return {name:path.basename(actual),data:new Uint8Array(await fs.readFile(actual))};
    }
  };
}
module.exports={createSampleLibrary};
