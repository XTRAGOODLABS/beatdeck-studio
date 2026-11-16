(function(root){
  'use strict';
  const STORAGE='beatdeck:code25:studio:v1';
  const MODES=['absolute','relative-twos','relative-sign','relative-offset'];
  const transportIds=new Set(['TRewind','TForward','TStop','TPlay','TLoop','TRecord']);
  const clamp=v=>Math.max(0,Math.min(1,v));
  const isCodePort=p=>!!p&&/code\s*-?\s*25|m-audio\s*code/i.test(p.name||'');
  const controls=[
    {id:'E1',label:'E1 · Start trim',param:'trimStart'},
    {id:'E2',label:'E2 · End trim',param:'trimEnd'},
    {id:'E3',label:'E3 · Start fade',param:'fadeIn'},
    {id:'E4',label:'E4 · End fade',param:'fadeOut'},
    ...Array.from({length:4},(_,i)=>({id:'F'+(i+1),label:'F'+(i+1)+' · Chops '+(i+1)+' volume',track:i})),
    {id:'F5',label:'F5 · Master',param:'master'},
    {id:'B1',label:'B1 · Drum pads',mode:'play'},
    {id:'B2',label:'B2 · Steps',mode:'steps'},
    {id:'B3',label:'B3 · Chops',mode:'chops'},
    {id:'B4',label:'B4 · Loops',mode:'loops'},
    {id:'B5',label:'B5 · Record song',transport:'recordSong'},
    {id:'ModeCycle',label:'Mode · Next pad mode',cycleMode:true},
    {id:'TRewind',label:'Rewind · Beginning',transport:'rewind'},
    {id:'TForward',label:'Forward · Next scene',scene:1},
    {id:'TStop',label:'Stop',transport:'stop'},
    {id:'TPlay',label:'Play',transport:'play'},
    {id:'TLoop',label:'Loop · Loop pads',mode:'loops'},
    {id:'TRecord',label:'Record · Pattern',transport:'record'},
    {id:'TrackPrevious',label:'Previous sample track',trackStep:-1},
    {id:'TrackNext',label:'Next sample track',trackStep:1},
    {id:'SlicePrevious',label:'Previous chop',sliceStep:-1},
    {id:'SliceNext',label:'Next chop',sliceStep:1},
    {id:'X',label:'X axis · Filter',param:'cutoff'},
    {id:'Y',label:'Y axis · Pan',param:'pan'}
  ];
  function defaults(){return {version:1,source:'factory',portId:null,portName:null,keyChannel:0,pads:Array.from({length:16},(_,i)=>({ch:9,num:36+i})),padsLearned:false,bindings:{}};}
  function validBinding(b){return b&&['cc','note'].includes(b.type)&&Number.isInteger(b.ch)&&b.ch>=0&&b.ch<16&&Number.isInteger(b.num)&&b.num>=0&&b.num<128;}
  function restore(saved){
    const c=defaults();if(!saved||saved.version!==1)return c;
    if(saved.source==='legacy')c.source='legacy';
    if(typeof saved.portId==='string')c.portId=saved.portId;
    if(typeof saved.portName==='string')c.portName=saved.portName;
    if(Number.isInteger(saved.keyChannel)&&saved.keyChannel>=0&&saved.keyChannel<16)c.keyChannel=saved.keyChannel;
    if(Array.isArray(saved.pads)&&saved.pads.length===16&&saved.pads.every(p=>validBinding({...p,type:'note'}))&&new Set(saved.pads.map(p=>p.ch+':'+p.num)).size===16){c.pads=saved.pads.map(p=>({ch:p.ch,num:p.num}));c.padsLearned=!!saved.padsLearned;}
    for(const a of controls){const b=saved.bindings?.[a.id];if(validBinding(b))c.bindings[a.id]={type:b.type,ch:b.ch,num:b.num,mode:MODES.includes(b.mode)?b.mode:'absolute',style:b.style==='toggle'?'toggle':'momentary',portName:typeof b.portName==='string'?b.portName:null};}
    return c;
  }
  function importLegacy(config,legacy){
    if(!legacy||legacy.profile!=='maudio-code25')return false;
    let changed=false;
    if(Number.isInteger(legacy.padCh)&&legacy.padCh>=0&&legacy.padCh<16&&Array.isArray(legacy.pads)&&legacy.pads.length===16&&legacy.pads.every(n=>Number.isInteger(n)&&n>=0&&n<128)&&new Set(legacy.pads).size===16){config.pads=legacy.pads.map(num=>({ch:legacy.padCh,num}));config.padsLearned=true;changed=true;}
    if(Number.isInteger(legacy.keyChannel)&&legacy.keyChannel>=0&&legacy.keyChannel<16){config.keyChannel=legacy.keyChannel;changed=true;}
    const seen=new Set();
    for(const [from,to]of [['play','TPlay'],['rec','TRecord'],['mode','ModeCycle']]){
      const b=legacy.binds?.[from];if(!validBinding(b))continue;
      const signature=b.type+':'+b.ch+':'+b.num;if(seen.has(signature))continue;seen.add(signature);
      config.bindings[to]={type:b.type,ch:b.ch,num:b.num,mode:'absolute',style:b.style==='toggle'?'toggle':'momentary',portName:null};changed=true;
    }
    if(changed)config.source='legacy';return changed;
  }
  function relativeDelta(value,mode){
    if(mode==='relative-twos')return value<64?value:value-128;
    if(mode==='relative-sign')return value===0||value===64?0:value<64?value:-(value-64);
    if(mode==='relative-offset')return value-64;
    return 0;
  }
  function createCode25(BD){
    let saved;try{saved=BD.storeGet(STORAGE);}catch{}
    let config=restore(saved),learning=null,queue=[],lastMessage='No MIDI received yet',lastAt=0,everReceived=false;
    const heldKeys=new Map(),heldPads=new Map(),controlState=new Map(),buttonState=new Map(),mounts=new Set(),renderSignatures=new WeakMap();
    let lastPortId=null,lastTransportId=null,lastPrimary=false,encoderMode='macro';
    if(saved?.version!==1&&typeof BD.legacyMapping==='function'){
      try{if(importLegacy(config,BD.legacyMapping())){BD.storeSet(STORAGE,JSON.parse(JSON.stringify(config)));lastMessage='Restored existing Beatdeck Code25 assignments · waiting for MIDI.';}}catch{BD.report('The previous Code25 mapping could not be restored. Use Learn to assign its controls.');}
    }
    const primary=()=>{const s=BD.state();return s.controllerProfile==='maudio-code25'||s.code25Primary===true;};
    const inputs=()=>{try{return BD.midiInputs().filter(p=>p.state!=='disconnected'&&isCodePort(p));}catch{return [];}};
    function selected(){
      const ports=inputs();
      if(config.portId){const exact=ports.find(p=>p.id===config.portId);if(exact)return exact;const same=ports.filter(p=>p.name===config.portName);return same.length===1?same[0]:null;}
      const usb=ports.filter(p=>!/(?:\bdin\b|midiin\s*2|port\s*2|midi\s*2)/i.test(p.name));
      return usb.length===1?usb[0]:ports.length===1?ports[0]:null;
    }
    function transportPort(){
      const chosen=selected(),ports=inputs();
      if(!chosen||!/usb\s*midi/i.test(chosen.name))return null;
      const usb=ports.filter(p=>/usb\s*midi/i.test(p.name)),hui=ports.filter(p=>/mackie|hui/i.test(p.name));
      return usb.length===1&&hui.length===1?hui[0]:null;
    }
    function persist(){try{BD.storeSet(STORAGE,JSON.parse(JSON.stringify(config)));}catch{BD.report('The Code25 mapping could not be saved.');}}
    function releaseAll(){const keys=[...heldKeys.values()],pads=[...heldPads.values()];heldKeys.clear();heldPads.clear();controlState.clear();buttonState.clear();for(const key of keys)BD.noteOff(key);for(const pad of pads)BD.padOff(pad);if(typeof BD.sustain==='function')BD.sustain(false);if(typeof BD.pitchBend==='function')BD.pitchBend(0);}
    function refresh(){
      const p=selected(),companion=transportPort(),active=primary();
      const changed=(lastPortId&&p?.id!==lastPortId)||(lastPrimary&&!active)||(lastTransportId&&companion?.id!==lastTransportId);
      lastPortId=p?.id||null;lastTransportId=companion?.id||null;lastPrimary=active;if(changed)releaseAll();
      const signature=JSON.stringify([active,p?.id,inputs(),config,learning?.kind,learning?.id,learning?.notes?.length]);
      for(const el of mounts){if(renderSignatures.get(el)!==signature){if(update(el)!==false)renderSignatures.set(el,signature);}else updateLive(el);}
    }
    function status(){
      const p=selected();return {primary:primary(),connected:!!p,port:p?{id:p.id,name:p.name}:null,encoderMode,transportPort:transportPort()?.name||null,ports:inputs(),received:everReceived,lastMessage,lastAt,learning:learning?.kind==='pads'?'Pad '+(learning.notes.length+1):learning?.id||learning?.kind||null,learnedControls:Object.keys(config.bindings).length,padsLearned:config.padsLearned,keyChannel:config.keyChannel+1,config:JSON.parse(JSON.stringify(config))};
    }
    function tell(text){lastMessage=text;lastAt=Date.now();for(const el of mounts)updateLive(el);}
    function cancelLearn(){learning=null;queue=[];refresh();}
    function learn(id){if(!controls.some(x=>x.id===id))return false;learning={kind:'control',id};controlState.delete(id);tell('Move or press '+controls.find(x=>x.id===id).label+' on the selected Code25.');refresh();return true;}
    function learnTransport(){queue=['TForward','TStop','TPlay','TRecord'];learn('TRewind');}
    function learnPads(){learning={kind:'pads',notes:[]};queue=[];tell('Tap pad 1, then pads 2–16 in order.');refresh();}
    function setControlMode(id,mode){if(!MODES.includes(mode)||!config.bindings[id])return;config.bindings[id].mode=mode;controlState.delete(id);persist();refresh();}
    function setPort(id){releaseAll();const p=inputs().find(x=>x.id===id);config.portId=p?.id||null;config.portName=p?.name||null;everReceived=false;lastMessage='Waiting for MIDI on '+(p?.name||'the selected input')+'.';cancelLearn();persist();refresh();}
    function learnedMessage(msg,port,transportOnly=false){
      if(!learning)return false;
      if(transportOnly&&(learning.kind!=='control'||!transportIds.has(learning.id)))return true;
      if(learning.kind==='keyboard'){
        if(msg.type==='note'&&msg.on){config.keyChannel=msg.ch;learning=null;persist();tell('Piano keys learned on channel '+(msg.ch+1)+'.');refresh();}return true;
      }
      if(learning.kind==='pads'){
        if(msg.type!=='note'||!msg.on)return true;
        if(learning.notes.some(n=>n.ch===msg.ch&&n.num===msg.num)){tell('That pad was already learned. Tap pad '+(learning.notes.length+1)+'.');return true;}
        learning.notes.push({ch:msg.ch,num:msg.num});
        if(learning.notes.length===16){config.pads=learning.notes;config.padsLearned=true;learning=null;persist();tell('All 16 pad assignments learned.');}
        else tell('Pad '+learning.notes.length+' learned. Tap pad '+(learning.notes.length+1)+'.');
        refresh();return true;
      }
      const a=controls.find(x=>x.id===learning.id),continuous=!!a.param||a.track!=null;
      if(continuous&&msg.type!=='cc')return true;
      if(!continuous&&!msg.on)return true;
      if(msg.type==='note'&&!msg.on)return true;
      const id=learning.id;
      const collision=controls.find(x=>(!transportOnly||transportIds.has(x.id))&&x.id!==id&&config.bindings[x.id]?.type===msg.type&&config.bindings[x.id]?.ch===msg.ch&&config.bindings[x.id]?.num===msg.num&&(!config.bindings[x.id]?.portName||config.bindings[x.id].portName===port.name));
      if(collision){tell('Already assigned to '+collision.label+'. Clear that assignment first.');return true;}
      config.bindings[id]={type:msg.type,ch:msg.ch,num:msg.num,portName:port.name,mode:'absolute',style:'momentary'};
      buttonState.set(id,msg.on);persist();learning=null;tell(a.label+' learned: '+describe(msg)+'.');
      if(queue.length){const next=queue.shift();learn(next);}else refresh();
      return true;
    }
    function describe(m){return (m.type==='cc'?'CC ':'Note ')+m.num+' · channel '+(m.ch+1)+' · '+m.value;}
    function runButton(a){
      const s=BD.state();
      if(a.mode)BD.setPadMode(a.mode);
      else if(a.cycleMode){const modes=['play','steps','chops','loops'];BD.setPadMode(modes[(Math.max(0,modes.indexOf(s.padMode))+1)%modes.length]);}
      else if(a.transport)BD.transport(a.transport);
      else if(a.scene){const next=Math.max(0,Math.min((s.scenes?.length||1)-1,(s.sceneIndex||0)+a.scene));BD.scene('launch',next);}
      else if(a.trackStep)BD.selectTrack(Math.max(0,Math.min(3,(s.track||0)+a.trackStep)));
      else if(a.sliceStep)BD.selectSlice(Math.max(0,Math.min(15,(s.slice||0)+a.sliceStep)));
    }
    function setEncoderMode(mode){
      if(encoderMode===mode)return;
      encoderMode=mode;for(const id of ['E1','E2','E3','E4'])controlState.delete(id);
    }
    function applyControl(a,b,m){
      if(/^E[1-4]$/.test(a.id))setEncoderMode('macro');
      if(!a.param&&a.track==null){
        const prev=buttonState.get(a.id);buttonState.set(a.id,m.on);
        if((b.style==='toggle'&&prev!==m.on)||(m.on&&!prev))runButton(a);
        return;
      }
      if(m.type!=='cc')return;
      const value=clamp(Number(a.track!=null?BD.getTrackVolume(a.track):BD.getParam(a.param))||0);
      if(b.mode!=='absolute'){
        const step=relativeDelta(m.value,b.mode);if(step){const next=clamp(value+step/127);if(a.track!=null)BD.setTrackVolume(a.track,next);else BD.setParam(a.param,next);}
        return;
      }
      const state=controlState.get(a.id)||{previous:null,latched:false,expected:value};
      if(Math.abs(value-state.expected)>.025)state.latched=false;
      const incoming=m.value/127;
      if(!state.latched&&(Math.abs(incoming-value)<=2/127||(state.previous!=null&&(state.previous-value)*(incoming-value)<=0)))state.latched=true;
      state.previous=incoming;
      if(state.latched){if(a.track!=null)BD.setTrackVolume(a.track,incoming);else BD.setParam(a.param,incoming);state.expected=incoming;}
      else state.expected=value;
      controlState.set(a.id,state);
      if(!state.latched)tell(a.label+' · move to '+Math.round(value*127)+' to pick up.');
    }
    function handle(ev){
      const data=ev?.data;if(!data||!data.length)return false;
      const st=data[0],kind=st&0xf0,ch=st&15,num=data[1],value=data[2]||0,port=ev.target;
      const key=String(port?.id||port?.name||'')+':'+ch+':'+num;
      const isNote=kind===0x80||kind===0x90,off=isNote&&(kind===0x80||value===0);
      if(off&&heldKeys.has(key)){const voice=heldKeys.get(key);heldKeys.delete(key);BD.noteOff(voice);return true;}
      if(off&&heldPads.has(key)){const pad=heldPads.get(key);heldPads.delete(key);BD.padOff(pad);return true;}
      if(!primary()||!isCodePort(port))return false;
      const chosen=selected(),transportOnly=chosen?.id!==port.id;
      if(!chosen||transportOnly&&transportPort()?.id!==port.id)return true;
      lastPortId=chosen.id;lastPrimary=true;
      if(st===0xfa||st===0xfb||st===0xfc){everReceived=true;BD.transport(st===0xfc?'stop':'start');tell(st===0xfc?'Code25 · Stop':'Code25 · Play');return true;}
      if(st===0xf0){
        if(data.length===6&&data[1]===0x7f&&data[3]===6&&data[5]===0xf7){const action={1:'stop',2:'start',3:'start',6:'record',9:'rewind'}[data[4]];if(action){everReceived=true;BD.transport(action);tell('Code25 MMC · '+action);}}
        return true;
      }
      if(transportOnly&&kind===0xb0&&ch===0&&num>=16&&num<=19){
        if(learning)return true;
        const control=controls.find(a=>a.id==='E'+(num-15));
        const delta=relativeDelta(value,'relative-sign');
        everReceived=true;setEncoderMode('micro');
        if(delta&&typeof BD.nudgeSample==='function')BD.nudgeSample(control.param,delta);
        tell('Micro · '+control.label+' · '+(delta>0?'+':'')+delta+' ms');return true;
      }
      if(transportOnly&&kind===0xe0)return true;
      if(kind===0xe0){
        everReceived=true;
        if(ch===config.keyChannel&&!learning){const raw=(num&127)|((value&127)<<7),bend=2*(raw-8192)/(raw>=8192?8191:8192);if(typeof BD.pitchBend==='function')BD.pitchBend(bend);tell('Pitch wheel · '+bend.toFixed(2)+' semitones');}
        return true;
      }
      if(!isNote&&kind!==0xb0)return true;
      const m={type:kind===0xb0?'cc':'note',ch,num,value,on:kind===0xb0?value>0:!off};
      everReceived=true;tell(describe(m));
      if(learning&&!m.on)for(const a of controls){
        const b=config.bindings[a.id];
        if((!transportOnly||transportIds.has(a.id))&&!a.param&&a.track==null&&b?.type===m.type&&b.ch===ch&&b.num===num&&(!b.portName||b.portName===port.name))buttonState.set(a.id,false);
      }
      if(learnedMessage(m,port,transportOnly))return true;
      for(const a of controls){if(transportOnly&&!transportIds.has(a.id))continue;const b=config.bindings[a.id];if(b&&b.type===m.type&&b.ch===ch&&b.num===num&&(!b.portName||b.portName===port.name)){applyControl(a,b,m);return true;}}
      if(transportOnly)return true;
      if(kind===0xb0&&ch===config.keyChannel){
        if(num===64){if(typeof BD.sustain==='function')BD.sustain(value>=64);return true;}
        if(num===1){if(typeof BD.modulation==='function')BD.modulation(value/127);return true;}
      }
      if(isNote){
        const pad=config.pads.findIndex(p=>p.ch===ch&&p.num===num);
        if(pad>=0){if(!off){if(heldPads.has(key))BD.padOff(heldPads.get(key));heldPads.set(key,pad);BD.padOn(pad,value/127);}return true;}
        if(ch===config.keyChannel){
          if(!off){if(heldKeys.has(key))BD.noteOff(heldKeys.get(key));const voiceKey='code25:'+key;heldKeys.set(key,voiceKey);BD.noteOn(num,value/127,voiceKey);}return true;
        }
      }
      return true;
    }
    function element(tag,text,attributes={}){const el=document.createElement(tag);if(text!=null)el.textContent=text;for(const [k,v] of Object.entries(attributes))el.setAttribute(k,v);return el;}
    function button(label,handler){const el=element('button',label,{type:'button',class:'mini'});el.addEventListener('click',handler);return el;}
    function updateLive(el){const s=status(),live=el.querySelector('[data-code25-live]');if(live)live.textContent=s.lastMessage;const head=el.querySelector('[data-code25-status]');if(head)head.textContent=!s.primary?'Code25 is available · select Use Code25 to make it primary':s.connected?'Connected · '+s.port.name+(s.transportPort?' + HUI · '+s.encoderMode.toUpperCase():'')+(s.received?' · receiving MIDI':' · waiting for first MIDI message'):(s.ports.length>1?'Choose one Code25 input below':'Code25 not found · connect USB, then Connect');}
    function update(el){
      const focused=typeof document!=='undefined'?document.activeElement:null;
      if(focused&&el.contains(focused)&&focused.tagName==='SELECT'){updateLive(el);return false;}
      el.replaceChildren();const s=status();el.classList.add('code25-mapping');
      el.append(element('h3','Code25 · main controller'));
      const head=element('p',null,{'data-code25-status':'',role:'status'});el.append(head);
      const top=element('div',null,{class:'btn-row'});
      top.append(button('Use Code25',()=>{BD.useCode25();refresh();}),button('Connect',async()=>{try{await BD.connectMidi();refresh();}catch(e){tell('Could not connect: '+e.message);}}));
      const select=element('select',null,{'aria-label':'Code25 MIDI input'});select.append(element('option','Choose input…',{value:''}));for(const p of s.ports)select.append(element('option',p.name,{value:p.id}));select.value=s.port?.id||'';select.onchange=()=>setPort(select.value);top.append(select);
      el.append(top,element('p','Piano keys: selected chop across pitches. Pitch wheel: ±2 semitones. Sustain pedal: CC64. Mod wheel: CC1. Pads: Drums, Steps, Chops or Loops. Learned assignments take priority. Encoder Mode: red = Macro, green = Micro (1 ms nudges). Keep Fader Mode and Button Mode red. The mode readout updates when a knob moves.'));
      const channel=element('select',null,{'aria-label':'Piano key MIDI channel'});for(let i=0;i<16;i++)channel.append(element('option','Channel '+(i+1),{value:String(i)}));channel.value=String(config.keyChannel);channel.onchange=()=>{releaseAll();config.keyChannel=Number(channel.value);persist();};
      const keyrow=element('div',null,{class:'btn-row'});keyrow.append(element('span','Piano keys'),channel,button('Learn key channel',()=>{learning={kind:'keyboard'};tell('Press one piano key.');refresh();}),button('Learn all 16 pads',learnPads));el.append(keyrow);
      el.append(element('p',config.source==='legacy'?'Restored your existing Beatdeck Code25 assignments. Physical MIDI reception is shown separately above.':config.padsLearned?'Pad assignments learned from the controller.':'Pads use documented factory notes 36–51 on channel 10. Learn them if this preset differs.'));
      const live=element('p',null,{'data-code25-live':'',role:'status',class:'code25-live'});el.append(live);
      const learnrow=element('div',null,{class:'btn-row'});learnrow.append(button('Learn main controls in order',()=>{queue=controls.filter(a=>a.id!=='ModeCycle'&&a.id!=='TLoop').slice(1,19).map(a=>a.id);learn('E1');}),button('Learn transport',learnTransport),button('Cancel learning',cancelLearn));el.append(learnrow);
      const table=element('table',null,{class:'code25-table'}),thead=element('thead'),hr=element('tr');for(const text of ['Control / action','Message','Behavior','Assign'])hr.append(element('th',text));thead.append(hr);table.append(thead);const body=element('tbody');
      for(const a of controls){
        const b=config.bindings[a.id],row=element('tr');row.append(element('td',a.label),element('td',b?(b.type==='cc'?'CC ':'Note ')+b.num+' / ch '+(b.ch+1):'Not learned'));
        const behavior=element('td');
        if(b){const mode=element('select',null,{'aria-label':a.label+' behavior'});if(a.param||a.track!=null){for(const [v,label] of [['absolute','Absolute · pickup'],['relative-twos','Relative · two’s complement'],['relative-sign','Relative · signed bit'],['relative-offset','Relative · centered 64']])mode.append(element('option',label,{value:v}));mode.value=b.mode;mode.onchange=()=>setControlMode(a.id,mode.value);}else{for(const [v,label]of [['momentary','Momentary press'],['toggle','Toggle / latching']])mode.append(element('option',label,{value:v}));mode.value=b.style;mode.onchange=()=>{b.style=mode.value;buttonState.delete(a.id);persist();};}behavior.append(mode);}else behavior.textContent=a.param||a.track!=null?'Pickup after learning':'Press';row.append(behavior);
        const action=element('td');action.append(button(learning?.id===a.id?'Listening…':'Learn',()=>{queue=[];learn(a.id);}));if(b)action.append(button('Clear',()=>{delete config.bindings[a.id];controlState.delete(a.id);buttonState.delete(a.id);persist();refresh();}));row.append(action);body.append(row);
      }
      table.append(body);el.append(table,element('p','Mapping is saved on this Mac. Learning reads incoming MIDI only; it does not overwrite Code25 presets or send pad feedback. Physical controls are verified only when you move them and the received-message status changes.'));
      updateLive(el);
    }
    function render(container){if(!container)return;mounts.add(container);update(container);}
    return {handle,refresh,render,status,learn,learnTransport,learnPads,cancelLearn,setControlMode,setPort,releaseAll};
  }
  if(typeof module==='object'&&module.exports)module.exports={createCode25,relativeDelta};
  if(root?.BD){root.Code25=createCode25(root.BD);if(root.addEventListener)root.addEventListener('bd:state',()=>root.Code25.refresh());}
})(typeof window!=='undefined'?window:globalThis);
