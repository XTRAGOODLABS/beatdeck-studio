(async()=>{
 document.querySelector('#launchContinue')?.click();stop();wake();const checks=[];const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 assert(TRACKS.length===16&&LANES===20,'Two eight-piece kits plus four chop tracks');
 const mapBefore=JSON.stringify(Code25.status().config);
 await useBuiltinKit('classic',0);await useBuiltinKit('tr808',1);
 assert(kitIds[0]==='classic'&&kitIds[1]==='tr808','Kits can select different sound sets');
 const audio=ac.createBuffer(1,100,44100);laneBuffers[0]=audio;laneBuffers[8]=audio;await useBuiltinKit('electro',1);
 assert(laneBuffers[0]===audio&&laneBuffers[8]===null,'Loading Kit B preserves Kit A audio');laneBuffers[0]=null;
 setPadMode('play');selectLane(0);onPad(15,100);assert(selLane!==7,'Pad 16 plays a drum instead of selecting lane 8');
 await new Promise(resolve=>setTimeout(resolve,160));
 for(let i=0;i<16;i++){
  const pad=document.querySelector(`[data-appearance-drum="${i}"]`),idle=getComputedStyle(pad).backgroundColor;onPad(i,100);
  assert(pad.classList.contains('hit')&&getComputedStyle(pad).backgroundColor!==idle,`Drum pad ${i+1} visibly lights on a hit`);
  await new Promise(resolve=>setTimeout(resolve,160));assert(!pad.classList.contains('hit')&&getComputedStyle(pad).backgroundColor===idle,`Drum pad ${i+1} returns to its idle color`);
 }
 const legacy={v:7,patterns:Array.from({length:8},()=>Array.from({length:12},()=>Array.from({length:16},()=>({on:false,vel:.8,prob:100,rat:1,slice:0})))),laneVol:Array.from({length:12},(_,i)=>i/20),cutGroup:[0,0,0,1,1,0,0,0],songEvents:[{type:'note',lane:8,slice:1}],regionNotes:{part:[[[8,0,1,.8,100,1,1,[]]]]},studio:{automation:[{lane:9,param:'pan',value:.4}]}};
 legacy.patterns[0][8][0].on=true;legacy.patterns[0][8][0].slice=1;const upgraded=upgradeDrumState(legacy);
 assert(upgraded.patterns[0][16][0].slice===1&&!upgraded.patterns[0][8][0].on,'Legacy chop notes stay on chop tracks');
 assert(upgraded.laneVol[16]===.4&&upgraded.cutGroup.length===16,'Legacy mix levels and choke groups migrate');
 assert(upgraded.songEvents[0].lane===16&&upgraded.regionNotes.part[0][0][0]===16&&upgraded.studio.automation[0].lane===17,'Legacy song events, regions and automation migrate');
 assert(JSON.stringify(upgradeDrumState(upgraded))===JSON.stringify(upgraded),'Migration runs exactly once');
 const state=captureProjectState();assert(state.drumCount===16,'Saved state identifies the 16-drum layout');
 const saved=captureProject();assert(saved.sounds.drums.length===16&&saved.sounds.kitIds.length===2,'Project contains both kits');
 assert(JSON.stringify(Code25.status().config)===mapBefore,'Code25 assignments stay unchanged');
 const before=kitIds.slice();await renderBeat([{pattern:0,bar:0}]);assert(kitIds.every((k,i)=>k===before[i]),'Offline rendering preserves both kit selections');
 assert(document.querySelectorAll('[data-appearance-drum]').length===16&&document.querySelectorAll('.pages-kit-select').length===2,'Drum browser exposes both kit selectors and 16 pads');
 const physicalOrder=[13,14,15,16,9,10,11,12,5,6,7,8,1,2,3,4];assert([...document.querySelectorAll('.pages-kit-pads [data-appearance-drum]')].map(p=>+p.dataset.appearanceDrum+1).join(',')===physicalOrder.join(','),'Drum pads match hardware: Kit B above Kit A, bottom-left numbering');
 return {passed:checks.length,checks};
})()
