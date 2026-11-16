const test=require('node:test');
const assert=require('node:assert/strict');
const {createCode25}=require('../code25.js');
function setup(saved,legacy){
  const calls=[],values={trimStart:.5,master:.5};
  const state={controllerProfile:'maudio-code25',keyboardMode:'keys',track:0,slice:0,sceneIndex:0,scenes:[{},{}]};
  let inputs=[{id:'usb',name:'Code 25',state:'connected'},{id:'other',name:'Other keyboard',state:'connected'}];
  const storage=new Map(saved?[['beatdeck:code25:studio:v1',saved]]:[]);
  const BD={state:()=>state,midiInputs:()=>inputs,legacyMapping:()=>legacy,storeGet:k=>storage.get(k),storeSet:(k,v)=>storage.set(k,JSON.parse(JSON.stringify(v))),report:()=>{},
    noteOn:(...v)=>calls.push(['noteOn',...v]),noteOff:(...v)=>calls.push(['noteOff',...v]),padOn:(...v)=>calls.push(['padOn',...v]),padOff:(...v)=>calls.push(['padOff',...v]),
    getParam:k=>values[k]??.5,setParam:(k,v)=>{values[k]=v;calls.push(['param',k,v]);},getTrackVolume:()=>.5,setTrackVolume:(...v)=>calls.push(['track',...v]),
    setPadMode:v=>calls.push(['mode',v]),transport:v=>calls.push(['transport',v]),scene:(...v)=>calls.push(['scene',...v]),selectTrack:v=>calls.push(['selectTrack',v]),selectSlice:v=>calls.push(['selectSlice',v]),
    nudgeSample:(...v)=>calls.push(['nudge',...v]),pitchBend:v=>calls.push(['bend',v]),sustain:v=>calls.push(['sustain',v]),modulation:v=>calls.push(['modulation',v])};
  const code=createCode25(BD);
  const send=(data,id='usb')=>code.handle({data,target:inputs.find(x=>x.id===id)||{id,name:id}});
  return {code,send,calls,state,values,storage,setInputs:v=>{inputs=v;}};
}
test('keys and pads with overlapping note numbers stay on their own channels',()=>{
  const s=setup();s.send([0x90,48,100]);s.send([0x99,48,90]);
  assert.equal(s.calls.filter(x=>x[0]==='noteOn').length,1);
  assert.deepEqual(s.calls.find(x=>x[0]==='padOn').slice(1),[12,90/127]);
  s.send([0x90,48,0]);assert.equal(s.calls.filter(x=>x[0]==='noteOff').length,1);
});
test('note release retains original key after selection/profile changes',()=>{
  const s=setup();s.send([0x90,60,127]);s.state.track=3;s.state.controllerProfile='other';
  s.send([0x80,60,0]);assert.equal(s.calls[0][3],s.calls.at(-1)[1]);
});
test('unrelated inputs and ambiguous Code25 ports cannot play or learn',()=>{
  const s=setup();assert.equal(s.send([0x90,60,100],'other'),false);
  s.setInputs([{id:'a',name:'Code 25 A',state:'connected'},{id:'b',name:'Code 25 B',state:'connected'}]);
  assert.equal(s.send([0x90,60,100],'a'),true);assert.equal(s.calls.length,0);
});
test('absolute controls pick up the current value before moving it',()=>{
  const s=setup();s.code.learn('E1');s.send([0xB0,22,0]);s.send([0xB0,22,0]);s.send([0xB0,22,30]);
  assert.equal(s.calls.filter(x=>x[0]==='param').length,0);
  s.send([0xB0,22,70]);assert.equal(s.calls.filter(x=>x[0]==='param').length,1);
  assert.ok(Math.abs(s.values.trimStart-70/127)<.001);
});
test('relative encoders support increment and decrement',()=>{
  const s=setup();s.code.learn('E1');s.send([0xB0,22,64]);s.code.setControlMode('E1','relative-twos');
  s.send([0xB0,22,1]);assert.ok(s.values.trimStart>.5);
  s.send([0xB0,22,127]);assert.ok(Math.abs(s.values.trimStart-.5)<.001);
});
test('learned transport fires once per press and does not play notes',()=>{
  const s=setup();s.code.learn('TPlay');s.send([0x90,70,100]);s.send([0x80,70,0]);
  assert.equal(s.calls.length,0);s.send([0x90,70,100]);s.send([0x90,70,100]);s.send([0x90,70,0]);
  assert.deepEqual(s.calls,[['transport','play']]);
});
test('pad learning stores all channels and rejects duplicate signatures',()=>{
  const s=setup();s.code.learnPads();s.send([0x99,60,100]);s.send([0x99,60,100]);
  assert.equal(s.code.status().learning,'Pad 2');
  for(let i=1;i<16;i++)s.send([0x99,60+i,100]);
  assert.equal(s.code.status().learning,null);s.send([0x99,63,100]);
  assert.deepEqual(s.calls.at(-1),['padOn',3,100/127]);
  const config=s.storage.get('beatdeck:code25:studio:v1');assert.equal(config.pads[3].num,63);
});
test('disconnection releases held notes and pads',()=>{
  const s=setup();s.send([0x90,60,100]);s.send([0x99,36,100]);s.setInputs([]);s.code.refresh();
  assert.equal(s.calls.filter(x=>x[0]==='noteOff').length,1);
  assert.equal(s.calls.filter(x=>x[0]==='padOff').length,1);
});
test('realtime and MMC transport are receive-only and gated to the selected port',()=>{
  const s=setup();s.send([0xFA]);s.send([0xFC]);s.send([0xF0,0x7f,0x7f,6,2,0xf7]);
  assert.deepEqual(s.calls,[['transport','start'],['transport','stop'],['transport','start']]);
});
test('pitch wheel uses 14-bit centered values only on the piano-key channel',()=>{
  const s=setup();s.send([0xe0,0,0]);s.send([0xe0,0,64]);s.send([0xe0,127,127]);s.send([0xe9,0,0]);
  assert.deepEqual(s.calls,[['bend',-2],['bend',0],['bend',2]]);
});
test('sustain and modulation respect the piano-key channel and learned assignments',()=>{
  const s=setup();s.send([0xb0,64,127]);s.send([0xb0,64,0]);s.send([0xb0,1,64]);s.send([0xb9,64,127]);
  assert.deepEqual(s.calls,[['sustain',true],['sustain',false],['modulation',64/127]]);
  s.code.learn('E1');s.send([0xb0,1,64]);s.send([0xb0,1,64]);s.send([0xb0,1,70]);
  assert.equal(s.calls.filter(x=>x[0]==='modulation').length,1);
  assert.equal(s.calls.at(-1)[0],'param');
});
test('disconnect resets expressive controls and repeated realtime start never toggles',()=>{
  const s=setup();s.send([0xe0,0,0]);s.send([0xb0,64,127]);s.send([0xfa]);s.send([0xfa]);
  assert.deepEqual(s.calls.filter(x=>x[0]==='transport'),[['transport','start'],['transport','start']]);
  s.setInputs([]);s.code.refresh();
  assert.ok(s.calls.some(x=>x[0]==='sustain'&&x[1]===false));
  assert.deepEqual(s.calls.at(-1),['bend',0]);
});
test('existing Code25 assignments migrate without replacing its prior mapping',()=>{
  const legacy={profile:'maudio-code25',pads:Array.from({length:16},(_,i)=>72+i),padCh:9,keysCalibrated:false,keyBase:48,binds:{play:{type:'note',ch:0,num:94,style:'gate'},rec:{type:'note',ch:0,num:95,style:'gate'},mode:{type:'note',ch:0,num:93,style:'gate'}}};
  const original=JSON.stringify(legacy),s=setup(undefined,legacy);
  s.send([0x99,72,100]);s.send([0x90,94,100]);s.send([0x90,95,100]);s.state.padMode='chops';s.send([0x90,93,100]);
  assert.deepEqual(s.calls,[['padOn',0,100/127],['transport','play'],['transport','record'],['mode','loops']]);
  assert.equal(JSON.stringify(legacy),original);
  assert.equal(s.code.status().config.source,'legacy');
  assert.equal(s.storage.get('beatdeck:code25:studio:v1').bindings.TPlay.num,94);
});
test('saved Studio mapping takes precedence over legacy assignments',()=>{
  const saved={version:1,keyChannel:2,pads:Array.from({length:16},(_,i)=>({ch:9,num:36+i})),bindings:{TPlay:{type:'note',ch:0,num:80,style:'momentary',mode:'absolute'}}};
  const s=setup(saved,{profile:'maudio-code25',pads:Array.from({length:16},(_,i)=>72+i),padCh:9,binds:{play:{type:'note',ch:0,num:94}}});
  assert.equal(s.code.status().config.keyChannel,2);s.send([0x90,80,100]);s.send([0x99,36,100]);
  assert.deepEqual(s.calls,[['transport','play'],['padOn',0,100/127]]);
});
test('invalid or unrelated legacy mappings are not imported',()=>{
  const s=setup(undefined,{profile:'maschine',pads:Array(16).fill(72),padCh:9,binds:{play:{type:'note',ch:0,num:94}}});
  assert.equal(s.code.status().config.pads[0].num,36);assert.equal(s.code.status().config.bindings.TPlay,undefined);
});
test('the paired HUI port learns transport without stealing USB keys or other bindings',()=>{
  const s=setup(undefined,{profile:'maudio-code25',binds:{mode:{type:'note',ch:0,num:93}}});
  s.setInputs([{id:'usb',name:'Code 25 USB MIDI',state:'connected'},{id:'hui',name:'Code 25 Mackie/HUI',state:'connected'}]);
  s.code.setPort('usb');s.calls.length=0;
  s.code.learn('TStop');s.send([0x90,93,127],'hui');s.send([0x90,93,0],'hui');
  assert.equal(s.code.status().config.bindings.TStop?.portName,'Code 25 Mackie/HUI');
  s.send([0x90,93,127],'hui');s.send([0x90,93,0],'hui');
  assert.deepEqual(s.calls,[['transport','stop']]);
  s.send([0x90,60,100],'hui');s.send([0xb0,1,99],'hui');s.send([0xe0,0,100],'hui');
  assert.equal(s.calls.length,1);
  s.send([0x90,60,100],'usb');assert.equal(s.calls.at(-1)[0],'noteOn');
});
test('ambiguous HUI companions are ignored and HUI cannot learn a sample control',()=>{
  const s=setup();s.setInputs([{id:'usb',name:'Code 25 USB MIDI',state:'connected'},{id:'hui',name:'Code 25 Mackie/HUI',state:'connected'}]);s.code.setPort('usb');s.code.learn('E1');
  s.send([0xb0,77,100],'hui');assert.equal(s.code.status().config.bindings.E1,undefined);
  s.setInputs([{id:'usb',name:'Code 25 USB MIDI',state:'connected'},{id:'a',name:'Code 25 Mackie/HUI',state:'connected'},{id:'b',name:'Code 25 Mackie/HUI',state:'connected'}]);s.code.learn('TStop');s.send([0x90,93,100],'a');
  assert.equal(s.code.status().config.bindings.TStop,undefined);
});
test('transport-only setup learns five buttons and finishes without a Loop button',()=>{
  const s=setup();s.setInputs([{id:'usb',name:'Code 25 USB MIDI',state:'connected'},{id:'hui',name:'Code 25 Mackie/HUI',state:'connected'}]);s.code.setPort('usb');s.calls.length=0;s.code.learnTransport();
  for(const [id,num] of [['TRewind',91],['TForward',92],['TStop',93],['TPlay',94],['TRecord',95]]){
    assert.equal(s.code.status().learning,id);s.send([0x90,num,127],'hui');s.send([0x80,num,0],'hui');
  }
  assert.equal(s.code.status().learning,null);assert.equal(s.code.status().config.bindings.TLoop,undefined);assert.deepEqual(s.calls,[]);
  s.send([0x90,94,127],'hui');s.send([0x80,94,0],'hui');assert.deepEqual(s.calls,[['transport','play']]);
});
test('HUI transport cannot learn or dispatch sample-track navigation',()=>{
  const s=setup({version:1,bindings:{TrackNext:{type:'note',ch:0,num:96,portName:'Code 25 Mackie/HUI'}}});
  s.setInputs([{id:'usb',name:'Code 25 USB MIDI',state:'connected'},{id:'hui',name:'Code 25 Mackie/HUI',state:'connected'}]);s.code.setPort('usb');s.calls.length=0;
  s.code.learn('TrackPrevious');s.send([0x90,97,127],'hui');assert.equal(s.code.status().config.bindings.TrackPrevious,undefined);
  s.code.cancelLearn();s.send([0x90,96,127],'hui');assert.deepEqual(s.calls,[]);
});

test('green HUI encoders apply signed micro nudges to the same four trim/fade actions',()=>{
  const s=setup();s.setInputs([{id:'usb',name:'Code 25 USB MIDI',state:'connected'},{id:'hui',name:'Code 25 Mackie/HUI',state:'connected'}]);s.code.setPort('usb');s.calls.length=0;
  s.send([0xb0,16,1],'hui');s.send([0xb0,16,65],'hui');s.send([0xb0,17,2],'hui');s.send([0xb0,18,1],'hui');s.send([0xb0,19,66],'hui');
  assert.deepEqual(s.calls,[['nudge','trimStart',1],['nudge','trimStart',-1],['nudge','trimEnd',2],['nudge','fadeIn',1],['nudge','fadeOut',-2]]);
  assert.equal(s.code.status().encoderMode,'micro');
});
test('micro messages cannot modify samples while learning or on another channel',()=>{
  const s=setup();s.setInputs([{id:'usb',name:'Code 25 USB MIDI',state:'connected'},{id:'hui',name:'Code 25 Mackie/HUI',state:'connected'}]);s.code.setPort('usb');s.calls.length=0;
  s.code.learn('TStop');s.send([0xb0,16,1],'hui');s.code.cancelLearn();s.send([0xb1,16,1],'hui');s.send([0xb0,20,1],'hui');assert.deepEqual(s.calls,[]);
});
test('returning to red macro resets pickup instead of jumping to an old absolute value',()=>{
 const s=setup();s.setInputs([{id:'usb',name:'Code 25 USB MIDI',state:'connected'},{id:'hui',name:'Code 25 Mackie/HUI',state:'connected'}]);s.code.setPort('usb');s.code.learn('E1');s.send([0xb0,76,64]);s.send([0xb0,76,64]);
 s.send([0xb0,16,1],'hui');s.values.trimStart=.1;s.calls.length=0;s.send([0xb0,76,65]);assert.equal(s.code.status().encoderMode,'macro');assert.deepEqual(s.calls,[]);
});
