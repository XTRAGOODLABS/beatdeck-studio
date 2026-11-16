(() => {
 const checks=[],assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const display=window.BeatdeckNoteDisplay,before=BD.state(),pitch=BD.getParam('pitch'),mapping=JSON.stringify(window.Code25.status().config),saved=display.middleC();
 const select=document.querySelector('[aria-label="Middle C octave label"]');
 function choose(value){select.value=value;select.dispatchEvent(new Event('change'));}
 choose(4);assert(display.name(60)==='C4'&&display.name(36)==='C2','Standard MIDI octave names');
 choose(3);assert(display.name(60)==='C3'&&display.name(36)==='C1','Alternative octave names');
 assert(BD.storeGet('beatdeck:noteDisplay:middleC')===3,'Octave label preference persists locally');
 assert(document.querySelector('.pages-note-reference').textContent.includes(display.name(before.rootNote)),'Visible reference follows octave preference');
 assert(BD.state().rootNote===before.rootNote&&BD.getParam('pitch')===pitch,'Octave display leaves playback root and sample pitch unchanged');
 assert(JSON.stringify(window.Code25.status().config)===mapping,'Octave display preserves Code25 mapping');
 choose(saved);return {passed:checks.length,checks};
})()
