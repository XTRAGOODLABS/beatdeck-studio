(() => {
 'use strict';
 const $=id=>document.getElementById(id),api=window.BD;if(!api)return;
 const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!=null)n.textContent=text;return n;};
 const btn=(label,fn,cls='')=>{const n=make('button',cls,label);n.type='button';n.onclick=fn;return n;};
 const icons={projects:'▱',drums:'▦',samples:'∿',tracklib:'◈',fx:'⌁',instruments:'♮'};
 document.documentElement.classList.add('bd-pages');
 const old=$('studioWorkspace'),app=$('app'),shell=make('div','pages-shell');shell.id='pagesWorkspace';
 const browser=make('aside','pages-browser');browser.setAttribute('aria-label','Browser');
 const browserHead=make('div','pages-browser-head');browserHead.append(make('span','','BROWSER'),btn('‹',()=>{shell.classList.toggle('browser-closed');toggle.textContent=shell.classList.contains('browser-closed')?'Browser ›':'‹ Browser';},'pages-collapse'));browser.append(browserHead);
 const categories=make('nav','pages-categories');categories.setAttribute('aria-label','Library categories');
 const browserBody=make('div','pages-browser-body');browser.append(categories,browserBody);
 const panels={},buttons={};
 for(const [id,label] of [['projects','Projects'],['drums','Drums'],['samples','Audio Samples'],['tracklib','Tracklib'],['fx','FX'],['instruments','Instruments']]){
  const b=btn('',()=>category(id),'pages-category');b.append(make('span','pages-category-icon',icons[id]),make('span','',label));b.setAttribute('aria-pressed','false');categories.append(b);buttons[id]=b;
  const p=make('section','pages-browser-panel');p.hidden=true;p.dataset.category=id;browserBody.append(p);panels[id]=p;
 }
 const main=make('main','pages-main');const head=make('div','pages-main-head');
 const toggle=btn('‹ Browser',()=>{shell.classList.toggle('browser-closed');toggle.textContent=shell.classList.contains('browser-closed')?'Browser ›':'‹ Browser';},'pages-browser-toggle');
 const pageTitle=make('h1','','Sample');const trackNav=make('div','pages-track-nav');trackNav.append($('appearanceTracks'));head.append(toggle,pageTitle,trackNav);main.append(head);
 const canvas=make('div','pages-canvas');main.append(canvas);
 const pages={},pageButtons={},bottom=make('nav','pages-bottom');bottom.setAttribute('aria-label','Tool pages');
 const names=[['sample','Sample'],['sequence','Sequence'],['song','Song'],['mixer','Mixer'],['perform','Perform'],['controller','Code25']];
 for(const [id,label]of names){const p=make('section','pages-page');p.hidden=true;p.dataset.page=id;pages[id]=p;canvas.append(p);const b=btn(label,()=>page(id),'pages-page-button');b.setAttribute('aria-pressed','false');b.setAttribute('aria-label',label+' page');pageButtons[id]=b;bottom.append(b);}
 const previewLabel=make('span','pages-preview-label','BEATDECK STUDIO');bottom.append(previewLabel);main.append(bottom);shell.append(browser,main);old.after(shell);
 const sound=old.querySelector('.studio-sound'),notes=old.querySelector('.studio-notes');pages.sample.append(sound);pages.sequence.append(notes);
 for(const id of ['song','mixer','perform','controller'])pages[id].append($('studioPanel-'+id));
 const scenes=old.querySelector('.studio-scenes');pages.song.prepend(scenes);
 const resampling=old.querySelector('.studio-resample');pages.perform.append(resampling);
 const originalRail=$('appearanceSidebar'),projectBar=app.querySelector('.project-bar');panels.projects.append(make('h2','','Your projects'),projectBar);
 const projectTitle=make('span','pages-project-title',$('projectName').value||'Untitled');app.querySelector('.tb-brand').after(projectTitle);
 const originalLibrary=$('studioPanel-library'),library=make('div','pages-library');while(originalLibrary.firstChild)library.append(originalLibrary.firstChild);panels.samples.append(library);
 const drumPadContainer=$('appearanceDrums'),drumPads=[...drumPadContainer.children],drums=make('div','pages-drum-pads');drums.append(drumPadContainer);panels.drums.append(make('h2','','Two drum kits'));
 for(const bank of [1,0]){const group=make('section','pages-kit-bank');group.dataset.drumKit=bank;const heading=make('h3','',`Kit ${bank?'B':'A'} · Pads ${bank?'9–16':'1–8'}`),select=kitSelectors[bank],grid=make('div','pages-kit-pads');select.classList.add('pages-kit-select');select.setAttribute('aria-label',`Kit ${bank?'B':'A'} sounds`);const holder=select.closest('.ctl');group.append(heading,select,grid);if(holder)holder.remove();for(const pad of [...drumPads.slice(bank*8+4,bank*8+8),...drumPads.slice(bank*8,bank*8+4)])grid.append(pad);panels.drums.append(group);}
 // Keep the original pad container for its existing renderer and hit feedback.
 drumPadContainer.hidden=true;panels.drums.append(drums);
 panels.instruments.append(make('h2','','Sample instruments'),make('p','pages-help','Play the selected chop across the keyboard.'));
 for(let i=0;i<4;i++)panels.instruments.append(btn('Chops '+(i+1),()=>{api.selectTrack(i);api.setKeyboardMode('keys');page('sample');},'pages-instrument'));
 const fx=panels.fx;fx.append(make('h2','','Track FX'));
 for(const [id,label]of [['cutoff','Filter'],['resonance','Resonance'],['pan','Pan']]){const l=make('label','pages-fx-control',label),input=make('input');input.type='range';input.min=0;input.max=1;input.step=.001;input.value=api.getParam(id);input.setAttribute('aria-label','Sidebar '+label);input.oninput=()=>api.setParam(id,+input.value);l.append(input);fx.append(l);}
 fx.append(btn('Open mixer →',()=>page('mixer'),'pages-text-button'));
 // Move secondary sampler tools into a real context inspector.
 const sampler=$('samplerDrawer'),detail=sampler.querySelector('.studio-sound-details'),inspector=make('aside','pages-inspector');inspector.hidden=true;
 inspector.append(make('div','pages-inspector-title','SOUND SETTINGS'));detail.open=true;detail.querySelector('summary').hidden=true;inspector.append(detail);
 for(const node of [...sampler.querySelectorAll(':scope>.sampler-ctl,:scope>#chopHelp')])inspector.prepend(node);
 sound.append(inspector);const settings=btn('Sound settings',()=>{inspector.hidden=!inspector.hidden;sound.classList.toggle('inspector-open',!inspector.hidden);redraw();},'pages-settings');sampler.querySelector('.sampler-head').append(settings);
 const editorGuard=new MutationObserver(()=>{if($('sampleEditor').parentElement!==detail)detail.append($('sampleEditor'));});editorGuard.observe(sampler,{childList:true});
 const focus=btn('Focus chop',()=>{if(!sampleBuf||!slices[selSlice])return;const sl=slices[selSlice];setSamplerZoom(samplerZoom>1?1:sampleBuf.duration/Math.max(.001,(sl.end-sl.start)*1.7));focus.textContent=samplerZoom>1?'Full sample':'Focus chop';redraw();},'pages-focus');sampler.querySelector('.sampler-head').insertBefore(focus,settings);
 const pads=$('studioChopPads'),actions=sampler.querySelector('.studio-chop-actions');const sampleFoot=make('div','pages-sample-foot');sampleFoot.append(pads,actions);sampler.append(sampleFoot);
 const waveform=sampler.querySelector('.wave-wrap');const ruler=make('div','pages-wave-ruler');for(let i=1;i<=9;i++)ruler.append(make('span','',String(i)));waveform.before(ruler);
 const musicStrip=make('div','pages-musical-controls');musicStrip.setAttribute('aria-label','Pitch tempo and key controls');waveform.after(musicStrip);
 const controlGroup=(name)=>{const g=make('div','pages-music-group'),label=make('span','pages-music-label',name),row=make('div','pages-music-row');g.append(label,row);musicStrip.append(g);return row;};
 const pitchRow=controlGroup('SAMPLE PITCH');const pitchInput=$('slicePitch'),oldPitchLabel=pitchInput.parentElement;pitchInput.setAttribute('aria-label','Sample pitch in semitones');pitchInput.title='Pitch in semitones';pitchRow.append(btn('−',()=>api.stepPitch(-1),'pages-musical-step'),pitchInput,btn('+',()=>api.stepPitch(1),'pages-musical-step'));oldPitchLabel.remove();
 const pitchPrecision=btn('Macro',()=>api.setPitchPrecision(api.state().pitchPrecision==='micro'?'macro':'micro'),'pages-pitch-precision');pitchPrecision.setAttribute('aria-label','Pitch precision');pitchRow.append(pitchPrecision,btn('Reset',()=>api.setParam('pitch',.5),'pages-musical-reset'));
 const tempoRow=controlGroup('SAMPLE TEMPO');const tempoInput=$('sampleBpm'),oldTempo=tempoInput.closest('.ctl');tempoInput.setAttribute('aria-label','Source sample BPM');tempoInput.addEventListener('change',()=>{saveChopState();updateProjectUI();window.dispatchEvent(new CustomEvent('bd:state',{detail:api.state()}));});tempoRow.append(tempoInput);if(oldTempo)oldTempo.remove();
 const scaleTempo=factor=>{tempoInput.value=Math.max(1,Math.min(999,(Number(tempoInput.value)||api.state().bpm)*factor));tempoInput.dispatchEvent(new Event('change'));};
 tempoRow.append(btn('½',()=>scaleTempo(.5),'pages-musical-step'),btn('×2',()=>scaleTempo(2),'pages-musical-step'),$('matchTempo').closest('label'));
 const keyRow=controlGroup('PROJECT KEY');keyRow.append(btn('−',()=>{const s=api.state();api.setProjectKey(60+((s.rootNote-60+11)%12),s.scale);},'pages-musical-step'),$('studioRoot').closest('label'),btn('+',()=>{const s=api.state();api.setProjectKey(60+((s.rootNote-60+1)%12),s.scale);},'pages-musical-step'),$('studioScale').closest('label'));
 controlGroup('PLAYBACK').append($('studioStretchMode').closest('label'));
 const reference=make('span','pages-note-reference');reference.setAttribute('aria-label','Unpitched sample key');$('studioStretchMode').closest('.pages-music-group').append(reference);
 const noteLabels=make('label','pages-note-labels','Middle C display '),octaveDisplay=make('select');octaveDisplay.setAttribute('aria-label','Middle C octave label');
 for(const [value,text]of [[4,'C4 · MIDI 60'],[3,'C3 · MIDI 60']]){const option=make('option','',text);option.value=value;octaveDisplay.append(option);}octaveDisplay.value=window.BeatdeckNoteDisplay.middleC();octaveDisplay.onchange=()=>window.BeatdeckNoteDisplay.setMiddleC(octaveDisplay.value);noteLabels.append(octaveDisplay);inspector.append(noteLabels);
 function refreshNoteReference(){const root=api.state().rootNote;reference.textContent='Unpitched key '+window.BeatdeckNoteDisplay.name(root)+' · MIDI '+root;reference.title='This key plays the selected chop with no keyboard transposition. Its own sample pitch setting still applies.';octaveDisplay.value=window.BeatdeckNoteDisplay.middleC();}
 window.addEventListener('bd:note-display',refreshNoteReference);window.addEventListener('bd:state',refreshNoteReference);refreshNoteReference();


 const modeBar=make('div','pages-mode-bar');modeBar.append(make('span','pages-mode-caption','CODE25'),make('span','','E1 Start'),make('span','','E2 End'),make('span','','E3 Fade in'),make('span','','E4 Fade out'));const precision=make('strong','','MACRO');modeBar.append(precision);sampler.append(modeBar);
 originalRail.hidden=true;old.hidden=true;
 // Keep all existing controls and IDs; only their layout changes.
 const oldTabs=old.querySelector('.studio-tabs');if(oldTabs)oldTabs.hidden=true;
 const tools=app.querySelector('.pat-tools');if(tools){for(const id of ['loopsBtn','studioControllerShortcut'])if($(id))$(id).hidden=true;}
 const utility=old.querySelector('.studio-utilities');if(utility)main.append(utility);
 let currentPage='sample',currentCategory='samples';
 function updateRuler(){if(typeof waveView!=='function')return;const view=waveView();[...ruler.children].forEach((n,i)=>{const t=view.start+view.length*i/8;n.textContent=Math.floor(t/60)+':'+(t%60).toFixed(1).padStart(4,'0');});}
 function redraw(){requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));if(typeof drawWave==='function'){peaks=null;drawWave();}updateRuler();if(typeof drawWholeSongNotes==='function'&&currentPage==='song')drawWholeSongNotes();});}
 function page(id){if(!pages[id])return;currentPage=id;for(const [key,p]of Object.entries(pages)){p.hidden=key!==id;pageButtons[key].setAttribute('aria-pressed',String(key===id));}
  if(['song','mixer','perform','controller'].includes(id))$('studioTab-'+id).click();
  const native=$('studioPanel-'+id);if(native)native.hidden=false;
  pageTitle.textContent=names.find(n=>n[0]===id)[1];shell.dataset.page=id;redraw();
 }
 function category(id){if(currentCategory==='tracklib'&&id!=='tracklib')stopTrackPreview();currentCategory=id;for(const [key,p]of Object.entries(panels)){p.hidden=key!==id;buttons[key].setAttribute('aria-pressed',String(key===id));}
  if(id==='samples'||id==='drums'){panels[id].append(library);const kind=$('libraryKind'),option=[...kind.options].find(o=>o.text.toLowerCase().includes(id==='drums'?'drum':'sample'));if(option){kind.value=option.value;kind.dispatchEvent(new Event('change'));}}
 }
 // Tracklib uses a distinct library kind; no files or folder IDs are mixed with Samples/Drums.
 const tracklib=panels.tracklib;tracklib.append(make('h2','','Tracklib'));
 const trackPath=make('p','pages-source-path','~/Desktop/TRACKLIB');tracklib.append(trackPath);
 const trackTools=make('div','pages-track-tools'),trackFolder=make('select','pages-track-folder');trackFolder.setAttribute('aria-label','Tracklib folder');
 const refreshTrack=btn('Refresh',()=>refreshTracklib());const addTrack=btn('+ Folder',async()=>{try{const result=await window.beatdeckProjects.addFolder('tracklib');if(result.error)throw Error(result.error);if(!result.canceled)await refreshTracklib();}catch(e){trackStatus.textContent=e.message;}});
 trackTools.append(trackFolder,refreshTrack,addTrack);tracklib.append(trackTools);
 const trackSearch=make('input','pages-track-search');trackSearch.placeholder='Search Tracklib';trackSearch.setAttribute('aria-label','Search Tracklib');tracklib.append(trackSearch);
 const trackStatus=make('p','pages-help','Loading Tracklib…');trackStatus.setAttribute('role','status');tracklib.append(trackStatus);
 const trackList=make('div','pages-tracklib-list');tracklib.append(trackList);
 let catalog=[],trackGeneration=0,audition=null,previewEntry=null,previewButton=null;
 function stopTrackPreview(){audition?.pause();audition=null;api.stopPreview();if(previewButton)previewButton.textContent='▶ Audition';previewEntry=null;previewButton=null;}
 function trackEntry(file){const match=file.name.match(/(\d+(?:\.\d+)?)bpm-([A-G][#b]?m?)/i),stem=file.name.replace(/\.[^.]+$/,'').split('--')[0],dash=stem.indexOf('-');return {...file,title:dash>=0?stem.slice(dash+1):stem,artist:dash>=0?stem.slice(0,dash):'',bpm:match?+match[1]:null,key:match?match[2]:null,clearance:file.name.includes('[Clearance Required]')?'Clearance Required':''};}
 async function refreshTracklib(){
  const generation=++trackGeneration;stopTrackPreview();refreshTrack.disabled=true;trackStatus.textContent='Refreshing Tracklib…';
  try{
   if(!window.beatdeckProjects)throw Error('Open Beatdeck to browse your Tracklib folder.');
   const info=await window.beatdeckProjects.libraryInfo();if(info.error)throw Error(info.error);if(generation!==trackGeneration)return;
   const folders=info.tracklib||[],previous=trackFolder.value||api.storeGet('beatdeck:tracklib:folder');trackFolder.replaceChildren();
   for(const f of folders){const o=make('option','',f.name);o.value=f.id;o.title=f.path;trackFolder.append(o);}if(folders.some(f=>f.id===previous))trackFolder.value=previous;
   const folder=folders.find(f=>f.id===trackFolder.value);trackPath.textContent=folder?.path||'No Tracklib folder selected';
   if(!folder){catalog=[];trackRows();trackStatus.textContent='Add your Tracklib folder to start.';return;}
   const result=await window.beatdeckProjects.scanFolder('tracklib',folder.id);if(result.error)throw Error(result.error);if(generation!==trackGeneration)return;
   catalog=result.files.map(trackEntry);trackRows();trackStatus.textContent=`${catalog.length} ${catalog.length===1?'file':'files'}${result.truncated?' · first 5,000 shown':''}${result.skipped?' · some folders could not be read':''}`;
  }catch(e){if(generation===trackGeneration){catalog=[];trackRows();trackStatus.textContent=e.message;}}
  finally{if(generation===trackGeneration)refreshTrack.disabled=false;}
 }
 trackFolder.onchange=()=>{api.storeSet('beatdeck:tracklib:folder',trackFolder.value);refreshTracklib();};
 function trackRows(){trackList.replaceChildren();const filtered=catalog.filter(f=>(f.name+' '+f.relative).toLowerCase().includes(trackSearch.value.toLowerCase()));
  for(const f of filtered){const row=make('details','pages-tracklib-row'),summary=make('summary','pages-tracklib-summary'),body=make('div','pages-tracklib-body');summary.title=f.name;summary.append(make('span','pages-tracklib-title',f.title));row.append(summary,body);body.append(make('span','pages-file-type',f.name.split('.').pop().toUpperCase()),make('h3','',f.title),make('p','',f.artist),make('div','pages-file-meta',[f.bpm?f.bpm+' BPM':'',f.key||''].filter(Boolean).join(' · ')));
   const relative=make('p','pages-track-relative',f.relative);relative.title=f.relative;body.append(relative);
   const controls=make('div','pages-file-actions');const play=btn('▶ Audition',async()=>{if(previewEntry===f.id){stopTrackPreview();return;}stopTrackPreview();previewEntry=f.id;previewButton=play;try{play.textContent='■ Stop';await api.previewLibrary(f);}catch(e){stopTrackPreview();trackStatus.textContent=e.message;}});
   const load=btn('Load →',async()=>{load.disabled=true;stopTrackPreview();const generation=projectGeneration,target=api.state().track;
    try{const result=await window.beatdeckProjects.readLibrarySample(f.id);if(result.error)throw Error(result.error);if(generation!==projectGeneration)return;const file=new File([result.data],result.name,{type:'audio/'+fileExtension(result.name)});const loaded=await loadChopTrackFile(target,file,{isCurrent:()=>generation===projectGeneration});if(loaded&&generation===projectGeneration){api.selectTrack(target);page('sample');}}
    catch(e){trackStatus.textContent=e.message;}finally{load.disabled=false;}});
   controls.append(play,load);body.append(controls);if(f.clearance)body.append(make('span','pages-clearance',f.clearance));trackList.append(row);}
  if(!filtered.length)trackList.append(make('p','pages-help',catalog.length?'No matching Tracklib files.':'No Tracklib audio found.'));
 }
 function fileExtension(name){return name.split('.').pop().toLowerCase()==='wav'?'wav':'mpeg';}
 trackSearch.oninput=trackRows;tracklib.append(make('p','pages-help','Separate local library · original files stay in your Tracklib folder.'));
 refreshTracklib();
 $('samplerBtn').onclick=()=>page('sample');$('loopsBtn').onclick=()=>page('perform');$('ctrlBtn').onclick=()=>page('controller');$('studioControllerShortcut').onclick=()=>page('controller');$('seqSongView').onclick=()=>page('song');
 app.addEventListener('input',e=>{if(e.target.id==='projectName')projectTitle.textContent=e.target.value||'Untitled';});
 window.addEventListener('bd:state',()=>{pitchPrecision.textContent=api.state().pitchPrecision==='micro'?'Micro · 0.01 st':'Macro · 1 st';pitchInput.step=api.state().pitchPrecision==='micro'?'0.01':'1';updateRuler();precision.textContent=window.Code25?.status().encoderMode?.toUpperCase()||'MACRO';projectTitle.textContent=$('projectName').value||'Untitled';});
 window.BeatdeckPages={page,category};category('tracklib');page('sample');
})();
