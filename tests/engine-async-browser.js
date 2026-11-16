(async()=>{
  const checks=[];const assert=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
  stop();BD.selectTrack(0);BD.setStretchMode('stretch');await BeatdeckStretch.ready();
  const originalPrepare=BeatdeckStretch.prepare,originalPlay=playChopTrack;
  let unblock,entered;const begun=new Promise(r=>entered=r),gate=new Promise(r=>unblock=r);
  BeatdeckStretch.prepare=async(...args)=>{entered();await gate;return originalPrepare(...args);};
  try{
    const voice=withChopTrack(0,()=>playSamplerVoice(0,ac.currentTime+.01,.8,{pitch:3,forceGate:true}));
    voice.release(ac.currentTime+3,.01);await begun;
    assert(!voice.cancelled,'Future note-off preserves a cold prepared voice');
    unblock();await new Promise(r=>setTimeout(r,100));
    assert(!!voice.voice,'Cold prepared voice starts after preparation');voice.stopNow();
  }finally{BeatdeckStretch.prepare=originalPrepare;unblock?.();}
  let melodicCalls=0;playChopTrack=(...args)=>{if(args[4]?.forceGate)melodicCalls++;return null;};
  try{
    playSongEvent({type:'note',lane:CHOP,slice:1,pitch:0,vel:.8},ac.currentTime,new Map(),ac,masterGain);
    assert(melodicCalls===0,'Legacy one-shot event retains original playback semantics');
    playSongEvent({type:'note',lane:CHOP,slice:1,pitch:7,melodic:true,duration:2,vel:.8},ac.currentTime,new Map(),ac,masterGain);
    assert(melodicCalls===1,'Only explicitly melodic song events use note duration');
  }finally{playChopTrack=originalPlay;}
  let unblockStart,enteredStart;const startGate=new Promise(r=>unblockStart=r),startBegun=new Promise(r=>enteredStart=r);
  BeatdeckStretch.prepare=async(...args)=>{enteredStart();await startGate;return originalPrepare(...args);};
  try{
    patterns[0]=emptySteps();selectPattern(0);setSongMode(false);BD.addNote({step:0,pitch:9,duration:2,vel:.8});
    const starting=start();await startBegun;assert(BD.state().starting,'Preparing transport exposes its starting state');
    BD.transport('play');unblockStart();await starting;
    assert(!isPlaying&&!BD.state().starting,'Play toggle cancels preparation without starting later');
  }finally{BeatdeckStretch.prepare=originalPrepare;unblockStart?.();stop();}
  let releaseStop,enterStop;const stopGate=new Promise(r=>releaseStop=r),stopBegun=new Promise(r=>enterStop=r);
  BeatdeckStretch.prepare=async(...args)=>{enterStop();await stopGate;return originalPrepare(...args);};
  try{
    const pendingVoice=withChopTrack(0,()=>playSamplerVoice(0,ac.currentTime+.01,.8,{pitch:11,forceGate:true}));
    await stopBegun;stop();releaseStop();await new Promise(r=>setTimeout(r,100));
    assert(!pendingVoice.voice,'Stop prevents an untracked cold scheduled voice from sounding later');
  }finally{BeatdeckStretch.prepare=originalPrepare;releaseStop?.();}
  let releaseResample,enterResample;const resampleGate=new Promise(r=>releaseResample=r),resampleBegun=new Promise(r=>enterResample=r);
  BeatdeckStretch.prepare=async(...args)=>{enterResample();await resampleGate;return originalPrepare(...args);};
  try{
    patterns[0]=emptySteps();selectPattern(0);BD.addNote({step:0,pitch:10,duration:2,vel:.8});
    const result=BD.resample(1,'track');await resampleBegun;
    const replacement=captureProjectState();replacement.studio=null;applySaved(replacement);
    const before=chopTracks.map(t=>t.sampleBuf);releaseResample();
    assert(await result===false&&before.every((buffer,i)=>buffer===chopTracks[i].sampleBuf),'Changing project cancels an outstanding resample');
  }finally{BeatdeckStretch.prepare=originalPrepare;releaseResample?.();stop();}
  BD.selectTrack(0);BD.setStretchMode('stretch');await renderBeat([]);
  const longSource=ac.createBuffer(2,30*48000,48000);
  withChopTrack(0,()=>{sampleBuf=longSource;slices=[{...SAMPLE_DEFAULTS,start:0,end:30,mode:'hold'}];sampleBpm=120;matchTempo=false;});stashActiveChopTrack();
  patterns[0]=emptySteps();selectPattern(0);for(let i=0;i<16;i++)BD.addNote({step:i,pitch:i,duration:1,vel:.5});
  let prepareCalls=0;BeatdeckStretch.prepare=async(...args)=>{prepareCalls++;return originalPrepare(...args);};
  try{
    let rejected=false;try{await renderBeat([{pattern:0,bar:0}]);}catch(error){rejected=/128 MB/.test(error.message);}
    assert(rejected&&prepareCalls===0,'Oversized stretched arrangements fail preflight before processing crops');
  }finally{BeatdeckStretch.prepare=originalPrepare;}
  BD.automation('record');isPlaying=true;recentSteps.push({time:ac.currentTime-.01,section:null,pat:0,bar:0,step:0});
  try{BD.setTrackVolume(0,.37);assert(BD.automationState().points.some(p=>p.param==='trackVolume'&&p.lane===CHOP&&p.value===.37),'Code25 track faders record mixer automation');}
  finally{stop();BD.automation('off');}
  return {passed:checks.length,checks};
})()
