const { app, BrowserWindow, session, shell, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { LinkPeer } = require('./link');
const { execFile } = require('child_process');
const fs = require('fs');
const { createErrorReporter } = require('./error-report.cjs');

// Keep source-checkout testing separate from an installed Beatdeck library.
if (process.env.BEATDECK_DATA_DIR) app.setPath('userData', process.env.BEATDECK_DATA_DIR);
else if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Beatdeck-Dev'));

// The Maschine only switches to MIDI mode when Native Instruments' little background helpers are running.
// The Maschine software normally starts them; Beatdeck starts them itself (hidden) so you don't have to.
const NI_HELPERS = [
  '/Library/Application Support/Native Instruments/Hardware/NIHardwareAgent.app',
  '/Library/Application Support/Native Instruments/Hardware/NIHostIntegrationAgent.app',
  '/Library/Application Support/Native Instruments/NTK/NTKDaemon.app',
];
// Controller Editor is the small NI app that flips the Maschine into MIDI mode without the Maschine software
function controllerEditor() {
  const dir = '/Applications/Native Instruments/Controller Editor';
  try { const app = fs.readdirSync(dir).find(n => /\.app$/i.test(n)); return app ? dir + '/' + app : null; } catch { return null; }
}
const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 8000 }, (err, out, errOut) => res({ ok: !err, out: String(out || ''), err: String(errOut || (err && err.message) || '') })));
const uid = () => (process.getuid ? process.getuid() : 501);
// the NI helpers are normally started by macOS itself (launch agents); ask macOS to start them
function niLaunchAgents() {
  const out = [];
  for (const dir of ['/Library/LaunchAgents', require('os').homedir() + '/Library/LaunchAgents']) {
    try { fs.readdirSync(dir).filter(n => /native-instruments/i.test(n) && n.endsWith('.plist')).forEach(n => out.push({ dir, file: n, label: n.replace(/\.plist$/, '') })); } catch {}
  }
  return out;
}
async function niStatus() {
  const ps = await run('/bin/ps', ['-axo', 'comm']);
  const names = ['NIHardwareAgent', 'NIHostIntegrationAgent', 'NTKDaemon', 'Controller Editor', 'Maschine 2'];
  const running = {}; names.forEach(n => running[n] = ps.out.split('\n').some(l => l.includes(n)));
  return running;
}
// Open the Maschine software out of sight so it can wake the controller; Beatdeck closes it again afterwards
const MASCHINE_APP = '/Applications/Native Instruments/Maschine 2/Maschine 2.app';
async function startMaschineSoftware() {
  if (!fs.existsSync(MASCHINE_APP)) return { ok: false, err: 'Maschine 2 is not in Applications › Native Instruments' };
  const r = await run('/usr/bin/open', ['-g', MASCHINE_APP]);
  return { ok: r.ok, err: r.err.trim() };
}
async function quitMaschineSoftware() {
  const r = await run('/usr/bin/osascript', ['-e', 'tell application "Maschine 2" to quit']);
  return { ok: r.ok, err: r.err.trim() };
}
async function wakeMaschine() {
  if (process.platform !== 'darwin') return { steps: [], running: {} };
  const steps = [];
  for (const a of niLaunchAgents()) {
    const target = `gui/${uid()}/${a.label}`;
    let r = await run('/bin/launchctl', ['kickstart', target]);
    if (!r.ok) { await run('/bin/launchctl', ['bootstrap', `gui/${uid()}`, a.dir + '/' + a.file]); r = await run('/bin/launchctl', ['kickstart', target]); }
    steps.push({ what: a.label, ok: r.ok, err: r.err.trim().slice(0, 200) });
  }
  const apps = NI_HELPERS.filter(p => { try { return fs.existsSync(p); } catch { return false; } });
  for (const p of apps) { const r = await run('/usr/bin/open', ['-g', '-j', p]); steps.push({ what: p.split('/').pop(), ok: r.ok, err: r.err.trim().slice(0, 200) }); }
  await new Promise(r => setTimeout(r, 2500));
  return { steps, running: await niStatus() };
}

let link = null, projectService=null, projectQuitRequested=false;
// problem reports: errors stay in a log on this Mac until the person chooses to report them
const reporter = createErrorReporter({ app, shell });
reporter.watchMainProcess();

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 820, minHeight: 600,
    title: 'Beatdeck', backgroundColor: '#101217',
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') }
  });
  projectService.attachWindow(win);
  reporter.watchWindow(win);
  win.loadFile(path.join(__dirname, 'index.html'));
  // dropped files are handled by the page; never let a drop navigate away
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://') || !url.endsWith('index.html')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  projectService=require('./project-files.cjs').createProjectService({app,dialog,ipcMain,onCloseApproved:win=>{if(projectQuitRequested)app.quit();else win.close();},onCloseCanceled:()=>{projectQuitRequested=false;}});
  // Beatdeck no longer starts Native Instruments' helpers itself: macOS runs them, and extra copies fight over the Maschine
  ipcMain.handle('ni:wake', () => wakeMaschine());
  ipcMain.handle('ni:status', () => niStatus());
  ipcMain.handle('ni:startMaschine', () => startMaschineSoftware());
  ipcMain.handle('ni:quitMaschine', () => quitMaschineSoftware());
  // Ableton Link: shares tempo and beat with djay Pro and other Link apps
  ipcMain.handle('link:enable', (e, on, bpm) => {
    if (on) { if (!link) link = new LinkPeer(bpm); const was = link.enabled; link.enable(); if (!was && link.numPeers() === 0) link.setTempo(bpm); }
    else if (link) link.disable();
    return link ? link.state() : null;
  });
  ipcMain.handle('link:state', () => (link ? link.state() : null));
  ipcMain.handle('link:setTempo', (e, bpm) => { if (link) link.setTempo(bpm); return link ? link.state() : null; });
  const ses = session.defaultSession;
  // allow the Maschine (Web MIDI); nothing else
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'midi' || permission === 'midiSysex'));
  ses.setPermissionCheckHandler((wc, permission) => permission === 'midi' || permission === 'midiSysex');
  // exports go straight to ~/Downloads
  ses.on('will-download', (e, item) => {
    const dir = app.getPath('downloads');
    let name = item.getFilename(), target = path.join(dir, name), n = 1;
    const fs = require('fs');
    while (fs.existsSync(target)) { const ext = path.extname(name); target = path.join(dir, `${path.basename(name, ext)} (${n++})${ext}`); }
    item.setSavePath(target);
    item.once('done', (ev, state) => { if (state === 'completed') shell.showItemInFolder(target); });
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label:'File',submenu:[
      {label:'New Song',accelerator:'CmdOrCtrl+N',click:()=>projectService.command('new')},
      {label:'Open Song…',accelerator:'CmdOrCtrl+O',click:()=>projectService.command('open')},
      {label:'Save Song',accelerator:'CmdOrCtrl+S',click:()=>projectService.command('save')},
      {label:'Save Song As…',accelerator:'CmdOrCtrl+Shift+S',click:()=>projectService.command('saveAs')}
    ]},
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { role: 'windowMenu' },
    { role: 'help', submenu: reporter.menuItems() }
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit',()=>{projectQuitRequested=true;});
app.on('will-quit',()=>{if(link)link.disable();});
