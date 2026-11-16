const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {readProject,writeProject}=require('../project-files.cjs');
test('portable song round-trips sixteen drums, four chops and eight loops',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'beatdeck-16-drums-'));
 try{const ids=[...Array.from({length:16},(_,i)=>'drum'+i),...Array.from({length:4},(_,i)=>'chop'+i),...Array.from({length:8},(_,i)=>'loop'+i)],assets=ids.map((id,i)=>({id,data:Buffer.alloc(44,i)})),manifest={format:'beatdeck-project',version:1,id:'two-kits',name:'Two kits',state:{v:7,drumCount:16}};
  const file=path.join(dir,'full.beatdeck');await writeProject(file,{manifest,assets});const loaded=await readProject(file);assert.deepEqual(loaded.assets.map(a=>a.id),ids);for(let i=0;i<assets.length;i++)assert.deepEqual(Buffer.from(loaded.assets[i].data),assets[i].data);
  await assert.rejects(writeProject(path.join(dir,'invalid.beatdeck'),{manifest,assets:[{id:'drum16',data:Buffer.alloc(44)}]}),/Invalid project audio manifest/);
  await writeProject(path.join(dir,'legacy.beatdeck'),{manifest,assets:assets.filter(a=>!/^drum(?:8|9|1[0-5])$/.test(a.id))});assert.equal((await readProject(path.join(dir,'legacy.beatdeck'))).assets.length,20);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
