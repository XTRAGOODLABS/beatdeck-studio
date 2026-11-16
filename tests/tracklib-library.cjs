const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSampleLibrary}=require('../sample-library.cjs');
test('Tracklib is a distinct recursive library and preserves existing sample/drum registrations',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'beatdeck-tracklib-'));
 try{
  const root=path.join(tmp,'settings'),samples=path.join(tmp,'samples'),drums=path.join(tmp,'drums'),tracklib=path.join(tmp,'TRACKLIB');
  for(const p of [root,samples,drums,path.join(tracklib,'Loops')])await fs.mkdir(p,{recursive:true});
  await fs.writeFile(path.join(samples,'sample.wav'),Buffer.alloc(44,1));await fs.writeFile(path.join(drums,'kick.wav'),Buffer.alloc(44,2));await fs.writeFile(path.join(tracklib,'Loops','break.wav'),Buffer.alloc(44,3));
  const saved={samples:[{id:'samples',path:samples,name:'Samples'}],drums:[{id:'drums',path:drums,name:'Drums'}]};const before=JSON.stringify(saved);await fs.writeFile(path.join(root,'sample-folders.json'),before);
  const lib=createSampleLibrary({root,dialog:{},tracklibRoot:tracklib}),info=await lib.info();
  assert.deepEqual(info.samples,saved.samples);assert.deepEqual(info.drums,saved.drums);assert.equal(info.tracklib[0].path,await fs.realpath(tracklib));
  assert.equal(await fs.readFile(path.join(root,'sample-folders.json'),'utf8'),before,'Automatic discovery does not rewrite existing registrations');
  const sampleFiles=await lib.scan(null,'samples','samples'),trackFiles=await lib.scan(null,'tracklib',info.tracklib[0].id);
  assert.deepEqual(sampleFiles.files.map(f=>f.name),['sample.wav']);assert.deepEqual(trackFiles.files.map(f=>f.relative),[path.join('Loops','break.wav')]);
  assert.deepEqual(Buffer.from((await lib.read(null,trackFiles.files[0].id)).data),Buffer.alloc(44,3));
  await assert.rejects(lib.scan(null,'samples',info.tracklib[0].id),/not in this library/);
  await lib.remove(null,'tracklib',info.tracklib[0].id);await assert.rejects(lib.read(null,trackFiles.files[0].id),/Refresh/);
  assert.deepEqual(Buffer.from((await lib.read(null,sampleFiles.files[0].id)).data),Buffer.alloc(44,1),'Removing Tracklib does not invalidate regular sample tokens');
  const reopened=createSampleLibrary({root,dialog:{},tracklibRoot:tracklib});assert.deepEqual((await reopened.info()).tracklib,[],'An explicitly removed folder is not silently re-added');
  assert.deepEqual(await fs.readFile(path.join(tracklib,'Loops','break.wav')),Buffer.alloc(44,3),'Original Tracklib audio remains unchanged');
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('missing Tracklib source leaves an empty distinct list without changing other libraries',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'beatdeck-tracklib-missing-'));
 try{const lib=createSampleLibrary({root:tmp,dialog:{},tracklibRoot:path.join(tmp,'missing')});assert.deepEqual(await lib.info(),{samples:[],drums:[],tracklib:[]});await assert.rejects(lib.scan(null,'unknown','x'),/Unknown library/);}
 finally{await fs.rm(tmp,{recursive:true,force:true});}
});
