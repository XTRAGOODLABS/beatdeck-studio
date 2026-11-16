(() => {
  'use strict';
  let canvas,inspector,selected=null,drag=null,last='';
  const api=()=>window.BD;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function mount(){
    const host=document.getElementById('studioNoteEditor');if(!host||canvas)return;
    host.innerHTML='<div class="studio-notes-head"><strong>Keys · Piano roll</strong><span>Click to add · drag to move · double-click to delete</span></div><canvas id="studioPianoRoll" aria-label="Melodic note editor" tabindex="0"></canvas><div class="studio-note-inspector"><label>Step <input data-note="step" type="number" min="1" max="16" step="1"></label><label>Pitch <input data-note="pitch" type="number" min="-24" max="24" step="1"></label><label>Length <input data-note="duration" type="number" min="0.05" max="128" step="0.25"></label><label>Velocity <input data-note="vel" type="range" min="0" max="1" step="0.01"></label><button type="button" data-note-delete>Delete note</button></div>';
    canvas=host.querySelector('canvas');inspector=host.querySelector('.studio-note-inspector');
    for(const input of inspector.querySelectorAll('input'))input.onchange=()=>{if(selected)api().updateNote(selected,{[input.dataset.note]:Number(input.value)-(input.dataset.note==='step'?1:0)});};
    inspector.querySelector('button').onclick=()=>{if(selected)api().deleteNote(selected);selected=null;render();};
    canvas.onpointerdown=event=>{
      if(event.button!==0)return;const p=position(event),hit=hitTest(p);
      if(hit){selected=hit.id;drag={id:hit.id,x:p.x,y:p.y,step:hit.step,pitch:hit.pitch};}
      else{selected=api().addNote({step:p.step,pitch:p.pitch,duration:1,vel:.8}).id;api().auditionSlice(api().state().slice,.65,'piano-click');setTimeout(()=>api().releaseAudition('piano-click'),120);}
      canvas.setPointerCapture(event.pointerId);render();
    };
    canvas.onpointerup=event=>{if(drag){const p=position(event);api().updateNote(drag.id,{step:clamp(drag.step+Math.round((p.x-drag.x)/cellWidth()),0,15),pitch:clamp(drag.pitch+Math.round((drag.y-p.y)/rowHeight()),-12,12)});drag=null;}render();};
    canvas.onpointercancel=()=>{drag=null;};
    canvas.ondblclick=event=>{const hit=hitTest(position(event));if(hit)api().deleteNote(hit.id);selected=null;render();};
    canvas.onkeydown=event=>{if((event.key==='Delete'||event.key==='Backspace')&&selected){event.preventDefault();api().deleteNote(selected);selected=null;render();}};
    new ResizeObserver(()=>{last='';render();}).observe(canvas);render();
  }
  const cellWidth=()=>Math.max(1,(canvas.clientWidth-32)/16),rowHeight=()=>Math.max(1,canvas.clientHeight/25);
  function position(e){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;return{x,y,step:clamp(Math.floor((x-32)/cellWidth()),0,15),pitch:clamp(12-Math.floor(y/rowHeight()),-12,12)};}
  function hitTest(p){return api().notes().find(n=>p.x>=32+n.step*cellWidth()&&p.x<=32+(n.step+Math.min(16-n.step,n.duration))*cellWidth()&&p.pitch===n.pitch);}
  function render(){
    if(!canvas)return;const state=api().state(),notes=api().notes(),key=JSON.stringify([state.keyboardMode,state.rootNote,window.BeatdeckNoteDisplay.middleC(),state.track,state.slice,state.bar,state.template,notes,selected,canvas.clientWidth,canvas.clientHeight]);
    canvas.parentElement.hidden=state.keyboardMode!=='keys'||state.selectedLane<CHOP;if(key===last)return;last=key;
    const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;const dpr=devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;const g=canvas.getContext('2d');g.scale(dpr,dpr);
    g.fillStyle='#11161e';g.fillRect(0,0,width,height);g.font='9px sans-serif';
    for(let row=0;row<25;row++){const pitch=12-row;g.fillStyle=[1,3,6,8,10].includes((state.rootNote+pitch)%12)?'#151b25':'#1d2633';g.fillRect(32,row*rowHeight(),width-32,rowHeight()-1);if((state.rootNote+pitch)%12===0||pitch===0){g.fillStyle=pitch===0?'#ffcf83':'#a9b8c9';g.fillText(window.BeatdeckNoteDisplay.name(state.rootNote+pitch),1,row*rowHeight()+rowHeight()*.8);}}
    for(let i=0;i<=16;i++){g.strokeStyle=i%4===0?'#4a5668':'#293344';g.beginPath();g.moveTo(32+i*cellWidth(),0);g.lineTo(32+i*cellWidth(),height);g.stroke();}
    for(const n of notes){g.fillStyle=n.id===selected?'#ffcf83':'#e8a855';g.globalAlpha=.4+.6*n.vel;g.fillRect(33+n.step*cellWidth(),(12-n.pitch)*rowHeight()+1,Math.max(3,Math.min(16-n.step,n.duration)*cellWidth()-2),Math.max(3,rowHeight()-2));}g.globalAlpha=1;
    const note=notes.find(n=>n.id===selected);for(const input of inspector.querySelectorAll('input')){input.disabled=!note;if(note&&document.activeElement!==input)input.value=note[input.dataset.note]+(input.dataset.note==='step'?1:0);}inspector.querySelector('button').disabled=!note;
  }
  let automationEditor=null,automationSignature='';
  function mountAutomation(){
    const host=document.getElementById('studioPanel-mixer');if(!host||automationEditor)return;
    automationEditor=document.createElement('details');automationEditor.className='studio-automation-editor';
    automationEditor.innerHTML='<summary>Edit recorded moves</summary><label>Point <select aria-label="Automation point"></select></label><label>Step position <input data-auto="tick" type="number" min="0" max="16384" step="0.25"></label><label>Value <input data-auto="value" type="range" min="0" max="1" step="0.01"></label><button type="button">Delete point</button>';
    const select=automationEditor.querySelector('select');select.onchange=()=>refreshAutomation(true);
    for(const input of automationEditor.querySelectorAll('input'))input.onchange=()=>{const index=Number(select.value),point=api().automationState().points[index];if(point)api().automation('edit',index,{...point,[input.dataset.auto]:Number(input.value)});};
    automationEditor.querySelector('button').onclick=()=>api().automation('delete',Number(select.value));host.append(automationEditor);refreshAutomation(true);
  }
  function refreshAutomation(force=false){
    if(!automationEditor)return;const points=api().automationState().points,signature=JSON.stringify(points);if(signature===automationSignature&&!force)return;automationSignature=signature;
    const select=automationEditor.querySelector('select'),previous=select.value;select.replaceChildren(...points.map((p,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1} · ${p.param} · step ${p.tick} · ${Math.round(p.value*100)}%`;return option;}));
    select.value=points[previous]?previous:points.length?'0':'';const point=points[select.value];
    for(const input of automationEditor.querySelectorAll('input')){input.disabled=!point;if(point&&document.activeElement!==input)input.value=point[input.dataset.auto];}automationEditor.querySelector('button').disabled=!point;
  }
  window.addEventListener('bd:note-display',()=>render());
  window.addEventListener('bd:studio-mounted',()=>{mount();mountAutomation();});window.addEventListener('bd:state',()=>{render();refreshAutomation();});
  if(document.getElementById('studioNoteEditor'))mount();
})();
