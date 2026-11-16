(async()=>{
 document.querySelector('#launchContinue')?.click();stop();BD.selectTrack(0);wake();
 sampleBuf=ac.createBuffer(1,441000,44100);slices=[cleanSlice({start:1,end:9,fadeIn:0,fadeOut:0})];selSlice=0;stashActiveChopTrack();
 const checks=[];const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const snap=byId('trimSnap'),prior=snap.checked;snap.checked=true;
 try{
  BD.setParam('trimStart',.2);BD.setParam('trimEnd',.8);
  assert(Math.abs(BD.getParam('trimStart')-.2)<.001&&Math.abs(BD.getParam('trimEnd')-.8)<.001,'Macro trim coordinates stay anchored to full source duration');
  const before=slices[0].start;BD.nudgeSample('trimStart',1);
  assert(Math.abs(slices[0].start-before-.001)<=1/sampleBuf.sampleRate,'Micro moves start by 1 ms within one audio frame');
  assert(snap.checked,'Micro preserves the snap setting');
  BD.nudgeSample('fadeIn',1);assert(Math.abs(slices[0].fadeIn-.001)<=1/sampleBuf.sampleRate,'Micro applies the same 1 ms step to fades');
  BD.nudgeSample('trimStart',100000);assert(slices[0].start<slices[0].end,'Micro cannot cross the end boundary');
 }finally{snap.checked=prior;}
 return {passed:checks.length,checks};
})()
