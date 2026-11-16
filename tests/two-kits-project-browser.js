(async()=>{
 document.querySelector('#launchContinue')?.click();stop();wake();const checks=[],assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const legacy=captureProject();legacy.state=structuredClone(legacy.state);delete legacy.state.drumCount;
 legacy.state.patterns=legacy.state.patterns.map(rows=>[...rows.slice(0,8),...rows.slice(16)]);legacy.state.laneVol=[...legacy.state.laneVol.slice(0,8),...legacy.state.laneVol.slice(16)];legacy.state.cutGroup=legacy.state.cutGroup.slice(0,8);legacy.state.regionNotes={};legacy.state.songEvents=[];
 legacy.sounds.drums=Array.from({length:8},()=>({assetId:null,name:''}));legacy.sounds.chops=Array.from({length:4},()=>({assetId:null,name:'',slices:[]}));legacy.sounds.clips=Array.from({length:8},()=>({assetId:null,name:''}));legacy.sounds.mutes=[...legacy.sounds.mutes.slice(0,8),...legacy.sounds.mutes.slice(16)];delete legacy.sounds.kitIds;
 legacy.state.patterns[0][8][0]={...legacy.state.patterns[0][8][0],on:true,slice:1};
 const staged=await stageSongProject({manifest:{format:'beatdeck-project',version:1,state:legacy.state,sounds:legacy.sounds,assets:[]},assets:[]});commitSongProject(staged);
 assert(patterns[0][16][0].slice===1&&!patterns[0][8][0].on,'Legacy portable song opens with chops intact');assert(captureProject().sounds.drums.length===16,'Migrated file captures 16 drum slots');
 await useBuiltinKit('lofi',0);await useBuiltinKit('tr808',1);assert(kitFilters[0].frequency.value===3000&&kitFilters[1].frequency.value===20000,'Kit tone buses are independent');
 patterns[0]=emptySteps();Object.assign(patterns[0][15][0],{on:true,vel:1});const audio=await renderBeat([{pattern:0,bar:0}]);assert(audio.getChannelData(0).some(v=>Math.abs(v)>.001),'Kit B alone renders audible audio');
 const snap=captureProject(),roundtrip=await stageSongProject({manifest:{format:'beatdeck-project',version:1,state:snap.state,sounds:snap.sounds,assets:[]},assets:[]});commitSongProject(roundtrip);assert(kitIds[0]==='lofi'&&kitIds[1]==='tr808'&&patterns[0][15][0].on,'Both kit choices and Kit B notes survive project round-trip');
 for(const key of Object.keys(groupVoices))delete groupVoices[key];cutGroup[3]=cutGroup[11]=1;trigger(3,ac.currentTime+.01,1);trigger(11,ac.currentTime+.01,1);assert(Object.keys(groupVoices).length===2,'Choke groups stay independent between kits');
 return {passed:checks.length,checks};
})()
