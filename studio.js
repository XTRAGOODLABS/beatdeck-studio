(() => {
  'use strict';
  if (!window.BD || document.getElementById('studioWorkspace')) return;
  const $ = id => document.getElementById(id);
  const app = $('app');
  const oldWorkspace = $('appearanceWorkspace');
  const sampler = $('samplerDrawer');
  const sequence = oldWorkspace.querySelector('.stage');
  const arrangement = $('seqArrangement');
  const loops = $('loopsDrawer');
  const legacyDrawer = $('drawer');
  const exportDrawer = $('exportDrawer');
  const api = window.BD;
  const colors = ['#e78073','#df9c58','#d5b95c','#a4bd6c','#69b58c','#65b9b5','#6dadd0','#7e9ed6','#938ddd','#b28bd4','#ce88bb','#d98d9d','#d49d7e','#b2b787','#88adac','#9fabc5'];
  let tab = 'library';
  let state = api.state();
  let sceneSignature = '';
  let controllerMounted = false;
  let libraryPreview = null;
  const held = new Set();

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(text, action, className = '') {
    const node = el('button', `mini ${className}`.trim(), text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function run(action) {
    try {
      const result = action();
      if (result && typeof result.catch === 'function') result.catch(error => api.report(error.message));
      return result;
    } catch (error) { api.report(error.message); }
  }
  function select(options, label, onChange) {
    const node = el('select', 'kitsel');
    node.setAttribute('aria-label', label);
    for (const [value, name] of options) {
      const option = el('option', '', name);
      option.value = value;
      node.append(option);
    }
    node.addEventListener('change', () => run(() => onChange(node.value)));
    return node;
  }
  function field(label, control) {
    const node = el('label', 'studio-field');
    node.append(el('span', '', label), control);
    return node;
  }
  function syncSelect(node, value) {
    if (node !== document.activeElement && node.value !== String(value)) node.value = String(value);
  }

  document.documentElement.classList.add('bd-studio');
  const workspace = el('div', 'studio-workspace');
  workspace.id = 'studioWorkspace';
  workspace.setAttribute('aria-label', 'Beatdeck studio workspace');
  const rail = $('appearanceSidebar');
  rail.classList.add('studio-rail');
  const railTitle = el('div', 'studio-rail-title', 'SOUNDS');
  rail.prepend(railTitle);
  const sceneRail = el('section', 'studio-scenes');
  sceneRail.setAttribute('aria-label', 'Scenes');
  const sceneHeading = el('div', 'studio-section-heading');
  sceneHeading.append(el('h2', '', 'Scenes'), button('+', () => run(() => api.scene('add')), 'studio-icon'));
  sceneHeading.lastElementChild.setAttribute('aria-label', 'Add scene');
  const sceneList = el('div', 'studio-scene-list');
  sceneList.id = 'studioSceneList';
  sceneRail.append(sceneHeading, sceneList);
  rail.append(sceneRail);

  const main = el('main', 'studio-main');
  const upper = el('div', 'studio-upper');
  const sound = el('section', 'studio-sound');
  sound.setAttribute('aria-label', 'Selected sound');
  sampler.hidden = false;
  sampler.setAttribute('aria-label', 'Sample deck');
  const waveHeading = sampler.querySelector('.sampler-head h2');
  waveHeading.textContent = 'Sample deck';
  sound.append(sampler);
  const sampleReadout=el('div','studio-selected-sample');sampleReadout.id='studioSelectedSample';sampler.querySelector('.sampler-head').after(sampleReadout);

  const controls = el('div', 'studio-play-controls');
  const keyboardMode = select([['keys','Keys'],['chops','Chops']], 'Piano keyboard mode', value => api.setKeyboardMode(value));
  keyboardMode.id = 'studioKeyboardMode';
  const root = select(Array.from({length:12}, (_, i) => [60+i, ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][i]]), 'Project root note', value => api.setProjectKey(+value, scale.value));
  root.id = 'studioRoot';
  const scale = select([['chromatic','Chromatic'],['major','Major'],['minor','Minor']], 'Project scale', value => api.setProjectKey(+root.value, value));
  scale.id = 'studioScale';
  const stretch = select([['stretch','Stretch'],['tape','Tape']], 'Sample tempo and pitch mode', value => api.setStretchMode(value));
  stretch.id = 'studioStretchMode';
  const voiceMode=select([['mono','Mono'],['poly','Poly']], 'Sample voices: Mono chokes previous notes; Poly allows chords', value=>api.setSampleMono(value==='mono'));
  voiceMode.id='studioVoiceMode';
  controls.append(field('VOICES',voiceMode),field('PIANO KEYS', keyboardMode), field('KEY', root), field('SCALE', scale), field('PLAYBACK', stretch));
  const stretchStatus = el('span', 'studio-small-status');
  stretchStatus.id = 'studioStretchStatus';
  stretchStatus.setAttribute('role','status');
  controls.append(stretchStatus);
  const wave = sampler.querySelector('.wave-wrap');
  wave.after(controls);

  const pads = el('div', 'studio-chop-pads');
  pads.id = 'studioChopPads';
  pads.setAttribute('role', 'group');
  pads.setAttribute('aria-label', 'Sixteen sample chops');
  for (let i=0; i<16; i++) {
    const pad = button('', () => {}, 'studio-chop-pad');
    pad.style.setProperty('--pad-color', colors[i]);
    pad.dataset.slice = i;
    pad.setAttribute('aria-label', `Select and play chop ${i+1}`);
    pad.append(el('span', 'studio-pad-number', String(i+1).padStart(2,'0')), el('span', 'studio-pad-name', `Chop ${i+1}`));
    const key = `studio-chop-${i}`;
    const start = () => {
      if (held.has(key)) return;
      held.add(key);
      run(() => {
        api.selectSlice(i);
        if (api.auditionSlice) api.auditionSlice(i, 1, key);
        else api.noteOn(api.state().rootNote || 60, 1, key);
      });
      pad.classList.add('hit');
    };
    const end = () => {
      if (!held.delete(key)) return;
      run(() => api.releaseAudition ? api.releaseAudition(key) : api.noteOff(key));
      pad.classList.remove('hit');
    };
    pad.addEventListener('pointerdown', event => { if (event.button !== 0) return; pad.setPointerCapture(event.pointerId); start(); });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) pad.addEventListener(event, end);
    pad.addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); if (!event.repeat) start(); } });
    pad.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); end(); } });
    pad.addEventListener('blur', end);
    pads.append(pad);
  }
  controls.after(pads);
  const chopActions = el('div', 'studio-chop-actions');
  const favorite = button('☆ Keep chop', () => run(() => api.chop('favorite')));
  favorite.id = 'studioChopFavorite';
  chopActions.append(favorite, button('Duplicate chop', () => run(() => api.chop('duplicate'))), button('Find another set', () => run(() => api.chop('variation'))));
  pads.after(chopActions);

  const detail = el('details', 'studio-sound-details');
  detail.append(el('summary', '', 'Trim, tone & envelope'));
  detail.append($('sampleEditor'));
  sampler.append(detail);
  const oldPitchNotice = detail.querySelector('p.readout:last-child');
  if (oldPitchNotice && oldPitchNotice.textContent.includes('Pitch changes playback speed')) oldPitchNotice.textContent = 'Tape links pitch and speed. Stretch prepares audio with independent tempo and pitch.';

  const notePanel = el('section', 'studio-notes');
  notePanel.setAttribute('aria-label', 'Scene notes');
  const noteHeader = el('div', 'studio-note-header');
  const title = el('div');
  title.append(el('span', 'studio-eyebrow', 'SCENE EDITOR'), el('h2', '', 'Notes & groove'));
  noteHeader.append(title);
  const scope = el('span', 'studio-edit-scope', 'Pattern notes');
  scope.id = 'studioEditScope';
  noteHeader.append(scope);
  notePanel.append(noteHeader);
  sequence.classList.remove('seq-song-view');
  sequence.classList.add('seq-pattern-view');
  const melodic = el('div', 'studio-note-editor');
  melodic.id = 'studioNoteEditor';
  notePanel.append(melodic, sequence);
  upper.append(sound, notePanel);

  const lower = el('section', 'studio-lower');
  lower.setAttribute('aria-label', 'Library, arrangement and performance');
  const tabs = el('div', 'studio-tabs');
  tabs.setAttribute('role','tablist');
  const panels = {};
  const tabButtons = {};
  for (const [id, name] of [['library','Library'],['song','Song'],['mixer','Mixer'],['perform','Perform'],['controller','Code25']]) {
    const b = button(name, () => openTab(id), 'studio-tab');
    b.id = `studioTab-${id}`;
    b.setAttribute('role','tab');
    b.setAttribute('aria-controls',`studioPanel-${id}`);
    const panel = el('div', `studio-tab-panel studio-${id}`);
    panel.id = `studioPanel-${id}`;
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby', b.id);
    panels[id] = panel;
    tabButtons[id] = b;
    tabs.append(b);
  }
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const keys=Object.keys(tabButtons), current=keys.indexOf(tab);
    const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(current+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;
    event.preventDefault(); openTab(keys[next]); tabButtons[keys[next]].focus();
  });
  const resampling = el('div', 'studio-resample');
  const resampleBars=select([['1','1 bar'],['2','2 bars'],['4','4 bars'],['8','8 bars']], 'Resample length', () => {});
  resampleBars.value='4';
  const resampleScope=select([['mix','Full mix'],['track','Selected track']], 'Resample source', () => {});
  const resampleButton=button('↳ Resample to chops', async () => {
    resampleButton.disabled=true;
    try { await api.resample(+resampleBars.value,resampleScope.value); }
    catch(error) { api.report(error.message); }
    finally { resampleButton.disabled=false; }
  });
  resampling.append(resampleScope,resampleBars,resampleButton);
  tabs.append(resampling);
  lower.append(tabs,...Object.values(panels));
  main.append(upper, lower);
  workspace.append(rail, main);
  oldWorkspace.replaceWith(workspace);

  const songStage = el('div', 'stage studio-song-stage');
  songStage.append(arrangement);
  arrangement.open=true;
  const sceneTools=el('div','studio-scene-tools');
  const sceneName=el('input');
  sceneName.type='text';sceneName.maxLength=80;sceneName.placeholder='Name this scene';sceneName.setAttribute('aria-label','Selected scene name');
  sceneName.addEventListener('change',()=>run(()=>api.scene('rename',state.sceneIndex,sceneName.value.trim())));
  sceneTools.append(field('SCENE',sceneName),button('Launch next bar',()=>run(()=>api.scene('launch',state.sceneIndex))),button('Linked repeat',()=>run(()=>api.scene('duplicate',state.sceneIndex))),button('Independent variation',()=>run(()=>api.scene('variation',state.sceneIndex))));
  const scopeHint=el('p','studio-scope-hint','Linked repeats share notes. Independent variations can be edited separately. Sound edits affect this track throughout the song.');
  panels.song.append(sceneTools,scopeHint,songStage);

  const library=$('librarySettings');
  const libraryControls=library.querySelector('.library-controls');
  const libraryPagination=library.querySelectorAll('.library-controls')[1];
  const libraryHeading=el('div','studio-library-heading');
  libraryHeading.append(el('span','studio-small-status','Browse without replacing the selected sound'),button('Folders…',()=>run(()=>$('librarySettingsBtn').onclick())));
  panels.library.append(libraryHeading,libraryControls,$('libraryFileList'),libraryPagination,$('libraryStatus'));
  const browseHeading=[...library.querySelectorAll('h3')].find(x=>x.textContent==='Browse audio');
  if(browseHeading)browseHeading.remove();
  const foldersLabel=library.querySelector('h2');
  if(foldersLabel)foldersLabel.textContent='Sample & drum folders';
  for(const b of rail.querySelectorAll('[data-appearance-library]')) {
    b.onclick=async()=>{openTab('library');$('libraryKind').value=b.dataset.appearanceLibrary;await refreshLibrary();};
  }
  const libraryObserver = new MutationObserver(() => decorateLibrary());
  libraryObserver.observe($('libraryFileList'),{childList:true});
  function decorateLibrary() {
    if(typeof libraryFiles==='undefined')return;
    const query=$('librarySearch').value.toLowerCase();
    const files=libraryFiles.filter(file=>file.relative.toLowerCase().includes(query)).slice(libraryPage*100,(libraryPage+1)*100);
    [...$('libraryFileList').querySelectorAll('.library-file-row')].forEach((row,i)=>{
      if(row.querySelector('.studio-preview')||!files[i])return;
      const entry=files[i];
      const preview=button('▶',()=>{
        if(libraryPreview===entry.id){api.stopPreview();libraryPreview=null;preview.textContent='▶';return;}
        api.stopPreview();libraryPreview=entry.id;
        run(()=>api.previewLibrary(entry));
        for(const b of $('libraryFileList').querySelectorAll('.studio-preview'))b.textContent='▶';
        preview.textContent='■';
      },'studio-preview');
      preview.setAttribute('aria-label',`Preview ${entry.name}`);row.insertBefore(preview,row.firstChild);
    });
  }
  async function refreshLibrary(){
    if(typeof ProjectAPI==='undefined'||!ProjectAPI?.libraryInfo)return;
    try{
      libraryFolders=checkProjectResult(await ProjectAPI.libraryInfo());
      drawLibraryFolders();drawLibraryPicker();await scanLibraryFolder();
    }catch(error){api.report(error.message);}
  }

  const mixerHeading=el('div','studio-section-heading');
  mixerHeading.append(el('h2','','Selected track & automation'),el('span','studio-small-status','Code25 faders use pickup to prevent jumps'));
  const mixerControls=el('div','studio-mixer-controls');
  const mixerInputs=[];
  for(const [name,label] of [['trackVolume','Track level'],['pan','Pan'],['cutoff','Filter'],['resonance','Resonance'],['attack','Attack'],['release','Release'],['swing','Swing'],['human','Human feel']]){
    const input=el('input');input.type='range';input.min='0';input.max='1';input.step='0.001';input.setAttribute('aria-label',label);
    input.addEventListener('input',()=>run(()=>api.setParam(name,+input.value)));
    mixerInputs.push({name,input});mixerControls.append(field(label,input));
  }
  const automation=el('div','studio-automation-tools');
  const autoStatus=el('span','studio-small-status');autoStatus.id='studioAutomationStatus';autoStatus.setAttribute('role','status');
  for(const [action,label]of [['record','● Write moves'],['play','Read automation'],['off','Off'],['clear','Clear moves']])automation.append(button(label,()=>run(()=>api.automation(action)),action==='clear'?'warn':''));
  automation.append(autoStatus);
  panels.mixer.append(mixerHeading,mixerControls,automation);
  const automationPlot=el('canvas','studio-automation-plot');automationPlot.id='studioAutomationPlot';automationPlot.setAttribute('aria-label','Recorded automation overview');panels.mixer.append(automationPlot);

  const performanceHeading=el('div','studio-performance-heading');
  const performanceModes=el('div','seg');performanceModes.setAttribute('aria-label','Performance pad mode');
  for(const [mode,label]of [['play','Drums'],['chops','Chops'],['steps','Steps'],['loops','Loops']]){
    const b=button(label,()=>run(()=>api.setPadMode(mode)));b.dataset.studioMode=mode;performanceModes.append(b);
  }
  performanceHeading.append(el('h2','','Live clips & scenes'),performanceModes,button('Record performance',()=>run(()=>api.transport('recordSong'))));
  const performanceScenes=el('div','studio-performance-scenes');
  performanceScenes.id='studioPerformanceScenes';
  loops.hidden=false;
  panels.perform.append(performanceHeading,performanceScenes,loops);
  const mapping=el('div','studio-code25-map');mapping.id='studioCode25Map';
  panels.controller.append(mapping);
  const legacyController=el('details','studio-legacy-controller');legacyController.append(el('summary','','Other controllers & legacy assignments'),legacyDrawer);
  legacyDrawer.hidden=false;panels.controller.append(legacyController);
  const utility=el('div','studio-utilities');utility.append(exportDrawer);main.append(utility);
  $('samplerBtn').onclick=()=>{sampler.hidden=false;sampler.scrollIntoView({block:'nearest',inline:'nearest'});};
  $('loopsBtn').onclick=()=>openTab('perform');
  $('ctrlBtn').onclick=()=>openTab('controller');
  $('librarySettingsBtn').textContent='Folders';
  $('seqSongView').onclick=()=>openTab('song');
  $('seqPatternView').onclick=()=>{sequence.classList.remove('seq-song-view');sequence.classList.add('seq-pattern-view');};
  $('copyPat').textContent='Copy pattern';
  const patLabel=sequence.querySelector('.patbar>.lab');if(patLabel)patLabel.textContent='PATTERN';
  const legacyExport=$('exportBtn').onclick;
  $('exportBtn').onclick=()=>{run(()=>legacyExport());if(!$('exportDrawer').hidden)$('exportDrawer').scrollIntoView({block:'nearest'});};
  const undo=button('↶',()=>run(()=>api.transport('undo')),'studio-icon');undo.setAttribute('aria-label','Undo edit');
  const redo=button('↷',()=>run(()=>api.transport('redo')),'studio-icon');redo.setAttribute('aria-label','Redo edit');
  app.querySelector('.transport').append(undo,redo);
  const keyReadout=el('span','studio-key-readout');keyReadout.id='studioKeyReadout';app.querySelector('.transport').after(keyReadout);
  const controllerShortcut=button('Code25',()=>openTab('controller'),'studio-controller-shortcut');controllerShortcut.id='studioControllerShortcut';
  app.querySelector('.pat-tools').prepend(controllerShortcut);
  const status=el('span','studio-live-status');status.id='studioLiveStatus';status.setAttribute('role','status');tabs.append(status);

  function openTab(next){
    tab=panels[next]?next:'library';
    for(const [id,panel]of Object.entries(panels)){
      const active=id===tab;panel.hidden=!active;tabButtons[id].setAttribute('aria-selected',String(active));tabButtons[id].tabIndex=active?0:-1;
    }
    if(tab!=='library'){run(()=>api.stopPreview());libraryPreview=null;}
    if(tab==='library')run(refreshLibrary);
    if(tab==='controller'&&window.Code25&&!controllerMounted){window.Code25.render(mapping);controllerMounted=true;}
    if(tab==='song'){arrangement.open=true;requestAnimationFrame(()=>{if(typeof drawWholeSongNotes==='function')drawWholeSongNotes();});}
    workspace.dataset.panel=tab;
    if(typeof drawWave==='function')requestAnimationFrame(()=>{peaks=null;drawWave();});
  }
  function renderScenes(s){
    const signature=JSON.stringify([s.sceneIndex,s.scenes,s.queuedScene]);
    if(signature===sceneSignature)return;
    sceneSignature=signature;sceneList.replaceChildren();performanceScenes.replaceChildren();
    if(!s.scenes?.length){sceneList.append(el('p','studio-empty-scenes','Add a scene to start your song.'));}
    for(const [i,scene]of (s.scenes||[]).entries()){
      const row=el('div','studio-scene-row');
      const b=button('',()=>run(()=>api.scene('select',i)),'studio-scene');
      b.append(el('span','studio-scene-number',String(i+1).padStart(2,'0')),el('span','studio-scene-name',scene.name||`Scene ${i+1}`),el('small','',`${scene.bars}b`));
      b.setAttribute('aria-pressed',String(s.sceneIndex===i));
      if(s.sceneIndex===i)b.classList.add('active');
      const launch=button('▶',()=>run(()=>api.scene('launch',i)),'studio-scene-launch');launch.setAttribute('aria-label',`Launch ${scene.name||`scene ${i+1}`} next bar`);
      row.append(b,launch);sceneList.append(row);
      const live=button(scene.name||`Scene ${i+1}`,()=>run(()=>api.scene('launch',i)),'studio-live-scene');live.append(el('small','',`${scene.bars} bars`));live.classList.toggle('active',s.sceneIndex===i);performanceScenes.append(live);
    }
    if(sceneName!==document.activeElement)sceneName.value=s.scenes?.[s.sceneIndex]?.name||'';
    sceneName.disabled=!s.scenes?.length;
    for(const b of sceneTools.querySelectorAll('button'))b.disabled=!s.scenes?.length;
  }
  function plotAutomation(){
    const auto=api.automationState();
    autoStatus.textContent=`${auto.mode==='record'?'Writing':auto.mode==='play'?'Reading':'Automation off'} · ${Array.isArray(auto.points)?auto.points.length:0} moves`;
    const ctx=automationPlot.getContext('2d');if(!ctx)return;
    const width=Math.max(200,automationPlot.clientWidth),height=70,dpr=window.devicePixelRatio||1;
    if(automationPlot.width!==width*dpr||automationPlot.height!==height*dpr){automationPlot.width=width*dpr;automationPlot.height=height*dpr;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.strokeStyle='#36404c';ctx.lineWidth=1;
    for(let x=0;x<=8;x++){ctx.beginPath();ctx.moveTo(x*width/8,0);ctx.lineTo(x*width/8,height);ctx.stroke();}
    const points=Array.isArray(auto.points)?auto.points:[];
    if(!points.length)return;
    const end=Math.max(1,...points.map(p=>Number(p.tick??p.time??0)));
    ctx.strokeStyle='#eeb46d';ctx.lineWidth=2;ctx.beginPath();
    points.forEach((point,i)=>{const x=Number(point.tick??point.time??0)/end*width,y=(1-Math.max(0,Math.min(1,Number(point.value)||0)))*(height-8)+4;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  }
  function update(next){
    state=next||api.state();
    syncSelect(voiceMode,state.sampleMono?'mono':'poly');syncSelect(keyboardMode,state.keyboardMode||'keys');syncSelect(root,60+((state.rootNote||60)%12));syncSelect(scale,state.scale||'chromatic');syncSelect(stretch,state.stretchMode||'tape');
    stretchStatus.textContent=state.stretchStatus||'';
    keyReadout.textContent=`${root.options[root.selectedIndex]?.text||'C'} ${state.scale==='minor'?'min':state.scale==='major'?'maj':''}`;
    const activeSlice=Math.max(0,Math.min(15,state.slice||0));
    for(const b of pads.children){const active=+b.dataset.slice===activeSlice;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));b.disabled=!state.hasSample;}
    favorite.textContent=state.chopFavorite?'★ Keep chop':'☆ Keep chop';favorite.setAttribute('aria-pressed',String(!!state.chopFavorite));
    for(const b of chopActions.children)b.disabled=!state.hasSample;
    for(const b of performanceModes.children)b.classList.toggle('on',b.dataset.studioMode===state.padMode);
    const editorOrigin=$('seqEditorOrigin');scope.textContent=editorOrigin?.textContent?.includes('song')?'Song occurrence':'Pattern notes';
    controllerShortcut.textContent=state.controllerName||'Code25';
    for(const {name,input}of mixerInputs)if(input!==document.activeElement)input.value=api.getParam(name);
    renderScenes(state);
    if(tab==='mixer')plotAutomation();
    const currentName=state.sampleName||'No sample loaded';waveHeading.title=currentName;sampleReadout.textContent=currentName;sampleReadout.title=currentName;
  }
  window.addEventListener('bd:state',event=>update(event.detail));
  window.addEventListener('blur',()=>{for(const key of held){if(api.releaseAudition)api.releaseAudition(key);else api.noteOff(key);}held.clear();for(const b of pads.children)b.classList.remove('hit');});
  window.addEventListener('resize',()=>{if(tab==='mixer')plotAutomation();});
  document.addEventListener('click',event=>{
    if(event.target.closest('#appearanceTracks')||event.target.closest('#chopTrackSelect'))sampler.hidden=false;
  });
  openTab('library');
  update(state);
  window.dispatchEvent(new CustomEvent('bd:studio-mounted'));
})();
