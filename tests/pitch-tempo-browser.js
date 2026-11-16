(()=>{
 document.querySelector('#launchContinue')?.click();stop();BD.selectTrack(0);wake();sampleBuf=ac.createBuffer(1,441000,44100);slices=[cleanSlice({start:0,end:10,pitch:0})];selSlice=0;stashActiveChopTrack();
 const checks=[];const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 BD.setPitchPrecision('macro');BD.stepPitch(1);assert(slices[0].pitch===1,'Macro pitch steps one semitone');
 BD.setPitchPrecision('micro');BD.stepPitch(1);assert(slices[0].pitch===1.01,'Micro pitch steps 0.01 semitone');BD.stepPitch(-1);assert(slices[0].pitch===1,'Micro pitch reverses precisely');
 assert(captureProjectState().studio.pitchPrecision==='micro','Pitch precision persists in project state');
 const tempo=document.querySelector('#sampleBpm');tempo.value=120;tempo.dispatchEvent(new Event('change'));assert(sampleBpm===120&&chopTracks[0].sampleBpm===120,'Visible source tempo updates and persists selected track');
 const bar=document.querySelector('.pages-musical-controls');assert(bar.contains(document.querySelector('#slicePitch'))&&bar.contains(tempo)&&bar.contains(document.querySelector('#studioRoot')),'Pitch tempo and key share the visible strip');assert(document.querySelector('.pages-inspector').hidden,'No inspector needed');
 const keyRow=[...document.querySelectorAll('.pages-music-group')].find(n=>n.querySelector('.pages-music-label').textContent==='PROJECT KEY');BD.setProjectKey(60,'chromatic');keyRow.querySelector('button').click();assert(BD.state().rootNote===71,'Key down wraps C to B');
 const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);assert(ids.length===new Set(ids).size,'No duplicated controls');return {passed:checks.length,checks};
})()
