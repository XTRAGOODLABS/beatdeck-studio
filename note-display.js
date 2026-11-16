(() => {
  'use strict';
  const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const key='beatdeck:noteDisplay:middleC';
  const middleC=()=>window.BD?.storeGet(key)===3?3:4;
  const name=note=>names[((Math.round(note)%12)+12)%12]+(Math.floor(Math.round(note)/12)-5+middleC());
  function setMiddleC(value){window.BD.storeSet(key,Number(value)===3?3:4);window.dispatchEvent(new Event('bd:note-display'));}
  window.BeatdeckNoteDisplay={name,middleC,setMiddleC};
})();
