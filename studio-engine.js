(() => {
  'use strict';
  const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, Number(v) || 0));
  const fresh = () => ({version:1, rootNote:60, scale:'chromatic', keyboardMode:'keys', stretchMode:'tape', pitchPrecision:'macro', names:{}, links:{}, automation:[]});
  let settings = fresh();
  let automationMode='off', queuedScene=null, preparing=0, preparationError='', startGeneration=0, stopGeneration=0, resampling=false, pendingStart=false, projectGeneration=0, preparationQueue=Promise.resolve(), previewGeneration=0, renderScope='mix';
  const keys=new Map(), audioIds=new WeakMap(), prepared=new Map();
  let audioId=0, preview=null, selectedNote=null, sustainDown=false, liveBend=0;
  let runtimeParams=Object.create(null),preparedBytes=0;
  const automatable=new Set(['master','trackVolume','cutoff','resonance','pan']);
  const id = buf => {if(!audioIds.has(buf))audioIds.set(buf,++audioId);return audioIds.get(buf);};
  const trackState = i => {stashActiveChopTrack();return chopTracks[i];};
  const emit = () => window.dispatchEvent(new CustomEvent('bd:state',{detail:state()}));
  function state(){
    const sections=seqSections();
    return {bpm,rootNote:settings.rootNote,scale:settings.scale,keyboardMode:settings.keyboardMode,track:activeChopTrack,slice:selSlice,
      selectedLane:selLane,padMode,playing:isPlaying,starting:pendingStart||audioStarting,recording:recOn||seqRecording,sceneIndex:seqSelectedSection,
      scenes:sections.map(s=>({...s,name:settings.names[s.id]||`Scene ${s.index+1}`,linked:!!settings.links[s.id]})),
      queuedScene,sliceCount:slices.length,sampleName,hasSample:!!sampleBuf,sampleMono,chopFavorite:!!slices[selSlice]?.favorite,
      pitchPrecision:settings.pitchPrecision,stretchMode:settings.stretchMode,stretchStatus:preparing?'Preparing audio…':preparationError||'Ready',
      controllerName:byId('ctrlLabel')?.textContent||'Code 25',controllerProfile:midiCfg.profile,code25Primary:isCode25(),automationMode,
      selectedNote,bar:editBar,template:editPat};
  }
  function touch(){updateProjectUI();emit();}
  function remember(){rememberSequence();}
  function currentPage(){return steps;}
  function notes(){
    const out=[];for(let step=0;step<STEPS;step++)for(const n of currentPage()[CHOP+activeChopTrack][step].notes||[])out.push({...n,step});
    return out;
  }
  function addNote(n){
    remember();const step=Math.floor(clamp(n.step,0,15)), row=currentPage()[CHOP+activeChopTrack], cell=row[step];
    const note={id:seqId(),pitch:Math.round(clamp(n.pitch,-24,24)),duration:clamp(n.duration||1,.05,128),vel:clamp(n.vel??.8),slice:Math.floor(clamp(n.slice??selSlice,0,15)),offset:clamp(n.offset||0,0,.99)};
    (cell.notes||(cell.notes=[])).push(note);selectedNote=note.id;renderAll();touch();return note;
  }
  function updateNote(noteId,patch){
    const found=notes().find(n=>n.id===noteId);if(!found)return;remember();
    const cell=currentPage()[CHOP+activeChopTrack][found.step],n=cell.notes.find(n=>n.id===noteId);
    for(const [k,[a,b]] of Object.entries({pitch:[-24,24],duration:[.05,128],vel:[0,1],slice:[0,15],offset:[0,.99]}))if(patch[k]!=null)n[k]=clamp(patch[k],a,b);
    if(patch.step!=null){cell.notes=cell.notes.filter(x=>x!==n);const target=currentPage()[CHOP+activeChopTrack][Math.floor(clamp(patch.step,0,15))];(target.notes||(target.notes=[])).push(n);}
    selectedNote=noteId;renderAll();touch();
  }
  function deleteNote(noteId){remember();for(const cell of currentPage()[CHOP+activeChopTrack])cell.notes=(cell.notes||[]).filter(n=>n.id!==noteId);selectedNote=null;renderAll();touch();}
  function pitchFor(note){
    if(settings.scale==='chromatic')return clamp(note-settings.rootNote,-24,24);
    const allowed=settings.scale==='major'?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10];
    let candidate=note;while(candidate>0&&!allowed.includes(((candidate-settings.rootNote)%12+12)%12))candidate--;
    return clamp(candidate-settings.rootNote,-24,24);
  }
  function preparation(track,slice,pitch=0,inspect=false){
    const tr=trackState(track),sl=tr.slices[slice],source=tr.sampleBuf;if(!source||!sl)return null;
    const p=withChopTrack(track,()=>cleanSlice(sl)),tempo=tr.matchTempo&&tr.sampleBpm>0?bpm/tr.sampleBpm:1;
    const totalPitch=clamp(p.pitch+pitch,-24,24),key=[id(source),p.start,p.end,p.rev,p.fadeIn,p.fadeOut,tempo,totalPitch].join(':');
    const estimate=Math.ceil((p.end-p.start)*source.sampleRate/tempo)*Math.min(2,source.numberOfChannels)*4;
    if(inspect)return {key,estimate};
    let entry=prepared.get(key);if(entry)return entry;
    if(estimate>128*1024*1024)throw Error('This stretched sample is too long. Use Tape mode or a shorter chop.');
    entry={buffer:null,promise:null,source,key,bytes:0};prepared.set(key,entry);preparing++;preparationError='';
    const generation=projectGeneration;
    const run=async()=>{
    if(generation!==projectGeneration)throw Error('Audio preparation cancelled.');
    const sr=source.sampleRate,begin=Math.round(p.start*sr),length=Math.max(1,Math.round((p.end-p.start)*sr));
    const crop=new AudioBuffer({length,sampleRate:sr,numberOfChannels:Math.min(2,source.numberOfChannels)});
    for(let ch=0;ch<crop.numberOfChannels;ch++){
      const from=source.getChannelData(ch),to=crop.getChannelData(ch);
      for(let i=0;i<length;i++){const pos=p.rev?begin+length-1-i:begin+i;let gain=1;if(p.fadeIn)gain=Math.min(gain,i/(p.fadeIn*sr));if(p.fadeOut)gain=Math.min(gain,(length-1-i)/(p.fadeOut*sr));to[i]=(from[pos]||0)*Math.max(0,gain);}
    }
    return window.BeatdeckStretch.prepare(crop,{tempo,pitch:totalPitch});
    };
    entry.promise=preparationQueue.then(run).then(buffer=>{if(generation!==projectGeneration||prepared.get(key)!==entry)throw Error('Audio preparation cancelled.');entry.buffer=buffer;entry.bytes=buffer.length*buffer.numberOfChannels*4;preparedBytes+=entry.bytes;
      while(preparedBytes>128*1024*1024&&prepared.size>1){const [oldKey,old]=prepared.entries().next().value;if(old===entry)break;prepared.delete(oldKey);preparedBytes-=old.bytes;}
      return buffer;}).catch(error=>{if(prepared.get(key)===entry)prepared.delete(key);if(generation===projectGeneration)preparationError=error.message;throw error;}).finally(()=>{preparing--;emit();});
    preparationQueue=entry.promise.catch(()=>{});

    return entry;
  }
  const originalVoice=playSamplerVoice;
  playSamplerVoice=(n,time,velocity,options={})=>{
    options={...options,automated:runtimeParams[chopContextTrack]};
    if(settings.stretchMode!=='stretch'||options.prepared)return originalVoice(n,time,velocity,options);
    const track=chopContextTrack,ctx=ac,generation=projectGeneration,playbackGeneration=stopGeneration,entry=preparation(track,n,options.pitch||0);if(!entry)return null;
    if(entry.buffer)return originalVoice(n,time,velocity,{...options,prepared:entry.buffer});
    const proxy={track,ctx,mode:options.forceGate?'hold':slices[n]?.mode||'oneshot',cancelled:false,voice:null,
      release(at,r){if(this.voice){this.voice.release(at,r);return;}if(at==null||at<=ctx.currentTime)this.cancelled=true;else this.releaseAt={at,r};},stopNow(){this.cancelled=true;this.voice?.stopNow();}};
    if(typeof ctx.startRendering==='function')throw Error('Prepare samples before rendering.');
    entry.promise.then(buffer=>{if(proxy.cancelled||ctx!==ac||playbackGeneration!==stopGeneration||generation!==projectGeneration||trackState(track).sampleBuf!==entry.source||proxy.releaseAt?.at<=ctx.currentTime)return;proxy.voice=withChopTrack(track,()=>originalVoice(n,Math.max(time,ctx.currentTime+.002),velocity,{...options,prepared:buffer}));if(proxy.releaseAt)proxy.voice?.release(proxy.releaseAt.at,proxy.releaseAt.r);}).catch(error=>toast(error.message));
    return proxy;
  };
  function keyOff(key,force=false){
    const pending=keys.get(key);if(!pending)return;if(sustainDown&&pending.melodic&&!force){pending.sustained=true;return;}keys.delete(key);pending.cancelled=true;
    if(pending.voice)pending.voice.release();
    const duration=isPlaying&&pending.tick>=0?Math.max(.05,seqTickAt(ac.currentTime)-pending.tick):1;
    if(pending.note)pending.note.duration=duration;if(pending.event)pending.event.duration=duration;touch();
  }
  function keyOn(note,velocity,key){
    keyOff(key,true);if(!sampleBuf)return;const track=activeChopTrack,slice=settings.keyboardMode==='chops'?Math.floor(note-(midiCfg.keyBase??48)):selSlice;
    if(slice<0||slice>=slices.length)return;
    const pitch=settings.keyboardMode==='chops'?0:pitchFor(note),held={cancelled:false,voice:null,tick:-1,melodic:true};keys.set(key,held);
    withSound(()=>{
      if(held.cancelled)return;
      held.voice=playChopTrack(track,slice,ac.currentTime+.002,clamp(velocity),{gated:true,forceGate:true,pitch,melodic:true});
      held.tick=isPlaying?seqTickAt(ac.currentTime):-1;
      if(seqRecording){held.event=captureSongEvent({type:'note',lane:CHOP+track,vel:clamp(velocity),slice:slice+1,pitch,melodic:true,duration:null});}
      else if(recOn&&isPlaying){
        const prior=recentSteps.filter(s=>s.time<=ac.currentTime).at(-1);if(prior){
          const page=prior.section?songRegionPage(prior.section,prior.partBar):patterns[prior.pat].map(row=>row.slice(prior.bar*16,(prior.bar+1)*16));
          const cell=page[CHOP+track][prior.step],n={id:seqId(),pitch,slice,vel:clamp(velocity),duration:1,offset:0};(cell.notes||(cell.notes=[])).push(n);held.note=n;
        }
      }
      flashPad(CHOP+track);emit();
    });
  }
  const oldStop=stop;
  stop=()=>{stopGeneration++;startGeneration++;pendingStart=false;audioStarting=false;sustainDown=false;liveBend=0;for(const key of [...keys.keys()])keyOff(key,true);oldStop();runtimeParams=Object.create(null);if(masterGain)masterGain.gain.value=+master.value/100;laneVol.forEach((v,i)=>{if(laneGains[i])laneGains[i].gain.value=v;});emit();};
  const oldScheduleHits=scheduleHits;
  scheduleHits=(pat,step,time,bar=0,regionId=null)=>{
    const section=regionId||`pattern-${pat}`,tick=bar*16+step;
    if(automationMode!=='off')for(const point of settings.automation.filter(p=>p.section===section&&p.tick>=tick&&p.tick<tick+1))applyAutomated(point.param,point.value,point.lane,time);
    oldScheduleHits(pat,step,time,bar,regionId);
    const page=regionId?songRegionPage(regionId,bar):patterns[pat];if(!page)return;
    for(let track=0;track<NCHOP;track++)for(const n of page[CHOP+track][regionId?step:bar*16+step]?.notes||[]){
      const at=time+(n.offset||0)*stepDur(step),voice=playChopTrack(track,n.slice,at,n.vel,{gated:true,forceGate:true,pitch:n.pitch});
      voice?.release(at+Math.max(.005,n.duration*secondsPer16()));
    }
  };
  const oldPlayEvent=playSongEvent;
  playSongEvent=(event,time,voices,ctx,bus)=>{
    if(renderScope==='track'&&event.type!=='note')return;
    if(event.type==='note'&&isChopLane(event.lane)&&event.melodic===true){
      const voice=playChopTrack(event.lane-CHOP,event.slice-1,time,event.vel,{gated:true,forceGate:true,pitch:event.pitch});
      voice?.release(time+Math.max(.005,(event.duration||1)*secondsPer16()));return;
    }return oldPlayEvent(event,time,voices,ctx,bus);
  };
  async function prepareSequence(sequence){
    if(settings.stretchMode!=='stretch')return;
    const requests=new Map(),required=new Set();
    const request=(track,slice,pitch=0)=>{const spec=preparation(track,slice,pitch,true);if(spec)requests.set(spec.key,{track,slice,pitch,...spec});};
    for(const entry of sequence){
      const p=typeof entry==='number'?entry:entry.pattern,bar=typeof entry==='number'?0:entry.bar,region=entry.regionId;
      const page=region?songRegionPage(region,bar):patterns[p];if(!page)continue;
      for(let track=0;track<NCHOP;track++)for(let step=0;step<16;step++){
        const cell=page[CHOP+track][region?step:bar*16+step];if(!cell)continue;
        if(cell.on&&cell.slice)request(track,cell.slice-1);
        for(const n of cell.notes||[])request(track,n.slice,n.pitch);
      }
    }
    for(const e of seqEvents)if(e.type==='note'&&isChopLane(e.lane))request(e.lane-CHOP,e.slice-1,e.melodic?e.pitch||0:0);
    if([...requests.values()].reduce((sum,r)=>sum+r.estimate,0)>128*1024*1024)throw Error('This stretched arrangement exceeds 128 MB. Use Tape mode or a shorter selection.');
    for(const r of requests.values()){const e=preparation(r.track,r.slice,r.pitch);if(e){required.add(e);await e.promise;}}
    if([...required].some(e=>!prepared.has(e.key)))throw Error("This stretched arrangement exceeds the prepared-audio cache. Use Tape mode or a shorter selection.");
  }
  const oldStart=start;
  start=()=>{
    if(settings.stretchMode!=='stretch')return oldStart();
    if(isPlaying||pendingStart||audioStarting)return;const generation=++startGeneration;pendingStart=true;audioStarting=true;emit();
    return prepareSequence(exportSeq()).then(()=>{if(generation===startGeneration){pendingStart=false;audioStarting=false;oldStart();}}).catch(e=>{if(generation===startGeneration)toast('Could not prepare playback: '+e.message);}).finally(()=>{if(generation===startGeneration){pendingStart=false;audioStarting=false;emit();}});
  };
  const oldRender=renderBeat;
  function renderPrepared(sequence){const prior=runtimeParams;runtimeParams=Object.create(null);try{return oldRender(sequence);}finally{runtimeParams=prior;}}
  renderBeat=async sequence=>{const generation=projectGeneration;await prepareSequence(sequence);if(generation!==projectGeneration)throw Error('The project changed during preparation.');return renderPrepared(sequence);};
  const oldBarStart=barStart;
  barStart=time=>{
    if(queuedScene!=null){const section=seqSections()[queuedScene];queuedScene=null;if(section){songPos=section.index;seqPartBar=-1;seqTransportBar=section.start-1;playPat=section.pattern;firstBar=false;}}
    return oldBarStart(time);
  };
  const oldEnsure=ensureRegionPages;
  ensureRegionPages=section=>{
    const source=settings.links[section.id];if(source){const parent=seqSectionIds.indexOf(source);if(parent>=0){const s={...section,id:source};const pages=oldEnsure(s);seqRegionPages[section.id]=pages;return pages;}delete settings.links[section.id];}
    return oldEnsure(section);
  };
  function scene(action,index=seqSelectedSection,value){
    const sections=seqSections(),section=sections[index];
    if(action==='add'){byId('songAdd').onclick();touch();return;}
    if(!section)return;seqSelectedSection=index;
    if(action==='select'){editIndependentSongBar(section,0,false);}
    if(action==='launch'){
      setSongMode(true);if(isPlaying){queuedScene=index;toast('Queued '+(settings.names[section.id]||`Scene ${index+1}`));}else{editIndependentSongBar(section,0,false);start();queuedScene=index;}
    }
    if(action==='rename'){remember();settings.names[section.id]=String(value||`Scene ${index+1}`).slice(0,80);}
    if(action==='duplicate'||action==='variation'){
      byId('seqDuplicate').onclick();const next=seqSections()[index+1];if(next){settings.names[next.id]=(settings.names[section.id]||`Scene ${index+1}`)+(action==='variation'?' variation':' repeat');
        if(action==='duplicate'){settings.links[next.id]=settings.links[section.id]||section.id;seqRegionPages[next.id]=seqRegionPages[section.id];}
        else delete settings.links[next.id];}
    }
    if(action==='remove'){
      remember();
      for(const [child,parent] of Object.entries(settings.links))if(parent===section.id){seqRegionPages[child]=cloneRegionBars(section.id);delete settings.links[child];}
      delete settings.links[section.id];delete settings.names[section.id];byId('seqRemoveSection').onclick();
    }
    renderPatBar();touch();
  }
  const paramInfo={cutoff:[20,20000,'cutoff'],resonance:[.1,20,'resonance'],pan:[-1,1,'pan'],attack:[0,5,'attack'],release:[.005,5,'release'],pitch:[-24,24,'pitch']};
  function sampleEditRange(name){
    if(!sampleBuf||!slices[selSlice])return null;
    const p=cleanSlice(slices[selSlice]),frame=1/sampleBuf.sampleRate;
    if(name==='trimStart')return {field:'start',lo:0,hi:sampleBuf.duration,value:p.start};
    if(name==='trimEnd')return {field:'end',lo:0,hi:sampleBuf.duration,value:p.end};
    if(name==='fadeIn'||name==='fadeOut')return {field:name,lo:0,hi:(p.end-p.start)*.2,value:p[name]};
    return null;
  }
  function nudgeSample(name,delta){
    if(!Number.isFinite(delta)||!delta)return;
    const range=sampleEditRange(name);if(!range)return;
    const sr=sampleBuf.sampleRate,step=Math.max(1/sr,.001);
    const target=Math.round(clamp(range.value+delta*step,range.lo,range.hi)*sr)/sr;
    const snap=byId('trimSnap'),prior=snap.checked;snap.checked=false;
    try{editSample(range.field,target,true,true);}finally{snap.checked=prior;}
    touch();
  }
  function stepPitch(direction){
    if(!sampleBuf||!slices[selSlice])return;
    const step=settings.pitchPrecision==='micro'?.01:1;
    editSample('pitch',Math.round(clamp(cleanSlice(slices[selSlice]).pitch+direction*step,-24,24)*100)/100,true,true);touch();
  }
  function getParam(name){
    const range=sampleEditRange(name);if(range)return range.hi>range.lo?clamp((range.value-range.lo)/(range.hi-range.lo)):0;
    if(name==='master')return +master.value/100;if(name==='trackVolume')return laneVol[selLane];if(name==='swing')return swing/60;if(name==='human')return human/100;
    const info=paramInfo[name];if(!info)return 0;const v=sampleSettings(slices[selSlice])[info[2]];return name==='cutoff'?Math.log(v/20)/Math.log(1000):(v-info[0])/(info[1]-info[0]);
  }
  function applyAutomated(name,value,lane,time){
    if(name==='master'){masterGain?.gain.setValueAtTime(value,time);return;}
    if(name==='trackVolume'){laneGains[lane]?.gain.setValueAtTime(value,time);return;}
    if(!isChopLane(lane))return;const track=lane-CHOP,params=runtimeParams[track]||(runtimeParams[track]={});
    const info=paramInfo[name];if(!info)return;const actual=name==='cutoff'?20*1000**value:info[0]+(info[1]-info[0])*value;params[info[2]]=actual;
    for(const voice of voicesFor(ac,track)){
      const target=name==='pan'?voice.pan?.pan:name==='cutoff'?voice.filter?.frequency:name==='resonance'?voice.filter?.Q:null;
      target?.setValueAtTime(actual,time);
    }
  }
  function setParam(name,value,record=true,lane=selLane){
    value=clamp(value);if(name==='master'){master.value=value*100;master.oninput?.();}
    else if(name==='trackVolume')setLaneVol(lane,value);
    else if(name==='swing')setSwing(value*60);else if(name==='human')setHuman(value*100);
    else if(['trimStart','trimEnd','fadeIn','fadeOut'].includes(name)){const range=sampleEditRange(name);if(range)editSample(range.field,range.lo+(range.hi-range.lo)*value,true,true);}
    else if(paramInfo[name]){const [lo,hi,key]=paramInfo[name];withChopTrack(isChopLane(lane)?lane-CHOP:activeChopTrack,()=>editSample(key,name==='cutoff'?20*1000**value:lo+(hi-lo)*value));}
    if(record&&automatable.has(name)&&automationMode==='record'&&isPlaying){
      const prior=recentSteps.filter(s=>s.time<=ac.currentTime).at(-1);if(prior){const section=prior.section||`pattern-${prior.pat}`,tick=(prior.section?prior.partBar:prior.bar)*16+prior.step;
        const existing=settings.automation.find(p=>p.section===section&&p.tick===tick&&p.param===name&&p.lane===lane);
        if(existing)existing.value=value;else settings.automation.push({section,tick,param:name,value,lane});}
    }touch();
  }
  function useCode25(){
    if(!isCode25()){
      if(!store.get(CODE25_BACKUP_KEY))store.set(CODE25_BACKUP_KEY,JSON.parse(JSON.stringify(midiCfg)));
      midiCfg={profile:'maudio-code25',pads:DEFAULT_PADS.slice(),padCh:9,keyChannel:0,keyBase:48,keysCalibrated:true,binds:{},padMode:'play'};midiOut=null;mk2ScreensOn=false;saveMidi();
    }
    byId('readyBanner').hidden=true;setPadMode(padMode);renderBinds();wirePorts();showCode25Preset();emit();
  }
  function transport(action){
    if(action==='start'){if(!isPlaying)start();}else if(action==='play')(isPlaying||pendingStart||audioStarting)?stop():start();else if(action==='stop')stop();else if(action==='record')setRec(!recOn);
    else if(action==='recordSong')recordSongTake();else if(action==='rewind'){stop();songPos=0;seqLastSongTick=0;setEditorBar(0);}
    else if(action==='undo')undoSequence();else if(action==='redo')redoSequence();touch();
  }
  function auditionSlice(index,velocity=.8,key='pad-'+index){
    if(!slices[index])return;selectSlice(index);keyOff(key);const pending={cancelled:false,voice:null,tick:-1};keys.set(key,pending);
    withSound(()=>{if(!pending.cancelled)pending.voice=playChopPad(index,velocity,{gated:true});});
  }
  function selectSlice(index){selSlice=Math.floor(clamp(index,0,Math.max(0,slices.length-1)));syncSamplerControls();drawWave();touch();}
  function chop(action){
    const s=slices[selSlice];if(!s)return;rememberSampleEdit();
    if(action==='favorite')s.favorite=!s.favorite;
    if(action==='duplicate'){if(slices.length>=16){toast('All 16 chops are in use.');return;}slices.push({...s});selSlice=slices.length-1;}
    if(action==='variation'){
      const favorites=slices.map((s,i)=>s.favorite?[i,{...s}]:null).filter(Boolean);const count=slices.length;
      const length=Math.min(sampleBuf.duration,60/bpm);for(let i=0;i<count;i++)if(!slices[i].favorite){const start=Math.random()*Math.max(0,sampleBuf.duration-length);slices[i]=cleanSlice({...slices[i],start,end:start+length});}
      for(const [i,sl] of favorites)slices[i]=sl;
    }afterSampleEdit();touch();
  }
  async function resample(bars=4,scope='mix'){
    if(resampling){toast('Resampling is already in progress.');return false;}
    if(!chopTracks.some((_,i)=>!trackState(i).sampleBuf)){toast('All four chop tracks are occupied. Clear one before resampling.');return false;}
    resampling=true;
    const generation=projectGeneration,selectedLane=selLane,liveStates=loops.map(L=>L.state);
    try{
      stop();const sequence=exportSeq().slice(0,Math.max(1,bars));if(!sequence.length)throw Error('Add a pattern first.');const cycle=sequence.slice();while(sequence.length<bars)sequence.push({...cycle[sequence.length%cycle.length]});
      await prepareSequence(sequence);if(generation!==projectGeneration)return false;
      const prior=laneMuted.slice(),priorLoops=loops.map(L=>L.state),priorScope=renderScope;let rendering;
      try{
        renderScope=scope==='track'?'track':'mix';
        if(scope==='track')for(let i=0;i<LANES;i++)laneMuted[i]=i!==selectedLane;
        else loops.forEach((L,i)=>{L.state=liveStates[i];});
        rendering=renderPrepared(sequence);
      }finally{laneMuted.splice(0,laneMuted.length,...prior);loops.forEach((L,i)=>{L.state=priorLoops[i];});renderScope=priorScope;renderLoops();}
      const buffer=await rendering;if(generation!==projectGeneration)return false;
      const target=chopTracks.findIndex((_,i)=>!trackState(i).sampleBuf);if(target<0){toast('All four chop tracks are occupied. Clear one before resampling.');return false;}
      const file=new File([encodeWav(buffer)],`Resample-${bpm}bpm.wav`,{type:'audio/wav'});
      const loaded=await loadChopTrackFile(target,file,{isCurrent:()=>generation===projectGeneration});
      if(!loaded||generation!==projectGeneration)return false;setActiveChopTrack(target);touch();return true;
    }catch(error){if(generation!==projectGeneration)return false;throw error;}finally{resampling=false;}
  }
  async function previewLibrary(entry){
    if(!ProjectAPI)return;stopPreview();const generation=previewGeneration;const result=checkProjectResult(await ProjectAPI.readLibrarySample(entry.id));if(generation!==previewGeneration)return;const file=new File([result.data],result.name);const buf=await decodeFile(file);if(generation!==previewGeneration)return;await ensureSound();if(generation!==previewGeneration)return;preview=ac.createBufferSource();preview.buffer=buf;const gain=ac.createGain();gain.gain.value=.5;preview.connect(gain);gain.connect(ac.destination);preview.onended=()=>gain.disconnect();preview.start();
  }
  function stopPreview(){previewGeneration++;try{preview?.stop();}catch{}preview=null;}
  const saveState=()=>JSON.parse(JSON.stringify(settings));
  function restoreStudio(value){
    const v=value&&typeof value==='object'?value:{},next=fresh();
    next.rootNote=Number.isFinite(v.rootNote)?Math.floor(clamp(v.rootNote,24,96)):60;
    next.scale=['major','minor'].includes(v.scale)?v.scale:'chromatic';
    next.pitchPrecision=v.pitchPrecision==='micro'?'micro':'macro';next.keyboardMode=v.keyboardMode==='chops'?'chops':'keys';next.stretchMode=v.stretchMode==='stretch'?'stretch':'tape';
    next.names=Object.fromEntries(Object.entries(v.names&&typeof v.names==='object'?v.names:{}).filter(([id,name])=>id.length<=100&&typeof name==='string').map(([id,name])=>[id,name.slice(0,80)]));
    next.links=Object.fromEntries(Object.entries(v.links&&typeof v.links==='object'?v.links:{}).filter(([id,parent])=>id.length<=100&&typeof parent==='string'&&parent.length<=100&&id!==parent));
    for(const id of Object.keys(next.links)){const visited=new Set([id]);let parent=next.links[id];while(parent&&next.links[parent]){if(visited.has(parent)){delete next.links[id];break;}visited.add(parent);parent=next.links[parent];}}
    next.automation=(Array.isArray(v.automation)?v.automation:[]).slice(0,20000).filter(p=>p&&typeof p.section==='string'&&p.section.length<=100&&automatable.has(p.param)&&Number.isFinite(p.tick)&&p.tick>=0&&Number.isFinite(p.value)&&Number.isInteger(p.lane)&&p.lane>=0&&p.lane<LANES).map(p=>({section:p.section,tick:clamp(p.tick,0,16384),param:p.param,value:clamp(p.value),lane:p.lane}));
    next.automationMode=v.automationMode==='off'?'off':next.automation.length?'play':'off';
    projectGeneration++;chopLoadTokens.forEach((_,i)=>chopLoadTokens[i]++);stopGeneration++;startGeneration++;pendingStart=false;audioStarting=false;stopPreview();settings=next;automationMode=next.automationMode;selectedNote=null;prepared.clear();preparedBytes=0;runtimeParams=Object.create(null);
  }
  const oldCapture=captureProjectState;captureProjectState=()=>({...oldCapture(),studio:saveState()});
  const oldSnapshot=seqSnapshot;seqSnapshot=()=>JSON.stringify({...JSON.parse(oldSnapshot()),studio:saveState()});
  const oldRestore=restoreSequence;restoreSequence=text=>{restoreStudio(JSON.parse(text).studio);oldRestore(text);touch();};
  const oldApply=applySaved;applySaved=data=>{data=upgradeDrumState(data);restoreStudio(data.studio);oldApply(data);emit();};
  const oldMidi=onMidi;onMidi=event=>{if(learning)return oldMidi(event);if(window.Code25?.handle(event))return;oldMidi(event);};
  const oldWire=wirePorts;wirePorts=()=>{oldWire();if(isCode25())midiOut=null;window.Code25?.refresh();};
  window.addEventListener('blur',()=>{sustainDown=false;for(const key of [...keys.keys()])keyOff(key,true);});
  window.BD={state,setSampleMono:value=>{rememberSampleEdit();sampleMono=!!value;afterSampleEdit();touch();},notes,addNote,updateNote,deleteNote,selectSlice,auditionSlice,releaseAudition:keyOff,
    selectTrack:i=>{setActiveChopTrack(Math.floor(clamp(i,0,3)));touch();},selectDrum:i=>{selectLane(Math.floor(clamp(i,0,15)));touch();},
    setPadMode:mode=>{setPadMode(mode);touch();},setKeyboardMode:mode=>{sustainDown=false;for(const key of [...keys.keys()])keyOff(key,true);settings.keyboardMode=mode==='chops'?'chops':'keys';touch();},
    setProjectKey:(root,scale)=>{settings.rootNote=Math.floor(clamp(root,24,96));settings.scale=['major','minor'].includes(scale)?scale:'chromatic';touch();},
    setBpm:v=>{setBpm(clamp(v,20,300));touch();},getParam,setParam,nudgeSample,stepPitch,setPitchPrecision:mode=>{settings.pitchPrecision=mode==='micro'?'micro':'macro';touch();},getTrackVolume:i=>laneVol[CHOP+clamp(i,0,3)],setTrackVolume:(i,v)=>setParam('trackVolume',v,true,CHOP+Math.floor(clamp(i,0,3))),
    noteOn:keyOn,noteOff:keyOff,livePitchBend:()=>liveBend,
    sustain:on=>{sustainDown=!!on;if(!sustainDown)for(const [key,pending] of keys)if(pending.sustained)keyOff(key,true);},
    pitchBend:semitones=>{liveBend=clamp(semitones,-2,2);for(const pending of keys.values()){const voice=pending.voice?.voice||pending.voice;if(pending.melodic&&voice?.src?.detune)voice.src.detune.setValueAtTime(liveBend*100,ac.currentTime);}},
    modulation:value=>setParam('cutoff',1-clamp(value)),padOn:(i,v)=>{if(padMode==='chops')auditionSlice(i,v,'codepad-'+i);else withSound(()=>onPad(i,Math.round(clamp(v)*127)));},padOff:i=>keyOff('codepad-'+i),transport,scene,chop,
    setStretchMode:mode=>{settings.stretchMode=mode==='stretch'?'stretch':'tape';preparationError='';if(sampleBuf&&settings.stretchMode==='stretch')preparation(activeChopTrack,selSlice)?.promise.catch(e=>toast(e.message));touch();},resample,
    automation:(action,index,value)=>{if(action==='clear'){remember();settings.automation=[];}else if(action==='delete'){remember();settings.automation.splice(index,1);}else if(action==='edit'&&settings.automation[index]){remember();Object.assign(settings.automation[index],{value:clamp(value.value),tick:Math.max(0,Number(value.tick)||0)});}else{automationMode=['record','play'].includes(action)?action:'off';settings.automationMode=automationMode;}touch();},automationState:()=>({mode:automationMode,points:settings.automation}),
    save:()=>ProjectAPI?saveSongProject():store.set(patKey(),captureProjectState()),midiInputs:()=>midiAccess?[...midiAccess.inputs.values()].map(p=>({id:p.id,name:p.name,state:p.state,connection:p.connection})):[],connectMidi:()=>connectMidi(),useCode25,
    legacyMapping:()=>JSON.parse(JSON.stringify(midiCfg)),storeGet:key=>store.get(key),storeSet:(key,value)=>store.set(key,value),report:toast,previewLibrary,stopPreview};
  restoreStudio(store.get(patKey())?.studio);
  useCode25();
  setInterval(emit,300);
})();
