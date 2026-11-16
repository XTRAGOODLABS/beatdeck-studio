const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('beatdeckLink', {
  enable: (on, bpm) => ipcRenderer.invoke('link:enable', !!on, Number(bpm) || 120),
  state: () => ipcRenderer.invoke('link:state'),
  setTempo: (bpm) => ipcRenderer.invoke('link:setTempo', Number(bpm)),
});
contextBridge.exposeInMainWorld('beatdeckSys', {
  wakeMaschine: () => ipcRenderer.invoke('ni:wake'),
  niStatus: () => ipcRenderer.invoke('ni:status'),
  startMaschine: () => ipcRenderer.invoke('ni:startMaschine'),
  quitMaschine: () => ipcRenderer.invoke('ni:quitMaschine'),
});

contextBridge.exposeInMainWorld('beatdeckProjects', {
  libraryInfo:()=>ipcRenderer.invoke('projects:libraryInfo'),
  addFolder:kind=>ipcRenderer.invoke('projects:addFolder',kind),
  removeFolder:(kind,id)=>ipcRenderer.invoke('projects:removeFolder',kind,id),
  scanFolder:(kind,id)=>ipcRenderer.invoke('projects:scanFolder',kind,id),
  readLibrarySample:id=>ipcRenderer.invoke('projects:readLibrarySample',id),
  info:()=>ipcRenderer.invoke('projects:info'),
  resume:id=>ipcRenderer.invoke('projects:resume',id),
  save:(payload,saveAs)=>ipcRenderer.invoke('projects:save',payload,!!saveAs),
  open:id=>ipcRenderer.invoke('projects:open',id||null),
  opened:token=>ipcRenderer.invoke('projects:opened',token),
  recover:()=>ipcRenderer.invoke('projects:recover'),
  autosave:payload=>ipcRenderer.invoke('projects:autosave',payload),
  discardRecovery:()=>ipcRenderer.invoke('projects:discardRecovery'),
  confirm:name=>ipcRenderer.invoke('projects:confirm',name),
  title:(name,dirty)=>ipcRenderer.invoke('projects:title',name,!!dirty),
  close:allow=>ipcRenderer.invoke('projects:close',!!allow),
  onCommand:callback=>{const listener=(_event,command)=>callback(command);ipcRenderer.on('projects:command',listener);return ()=>ipcRenderer.removeListener('projects:command',listener);},
});
