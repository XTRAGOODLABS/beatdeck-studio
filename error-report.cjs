// Problem reports for Beatdeck.
// Errors are kept in a small log file on this Mac. Nothing is sent anywhere:
// "Report a Problem…" only opens the GitHub form with the details filled in,
// and the person decides whether to submit it.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ISSUE_URL = 'https://github.com/XTRAGOODLABS/beatdeck-studio/issues/new';
const MAX_LINES = 200;      // lines kept in the log file
const REPORT_LINES = 25;    // most recent lines put into a report
const REPORT_CHARS = 1800;  // keeps the link short enough for browsers

function createErrorReporter({ app, shell }) {
  const dir = path.join(app.getPath('userData'), 'logs');
  const file = path.join(dir, 'beatdeck-errors.log');
  const home = os.homedir();

  // hide the person's user name in folder paths before anything is shown or shared
  const scrub = text => String(text || '').split(home).join('~').replace(/\/Users\/[^/\s]+/g, '/Users/~');

  function readLines() {
    try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { return []; }
  }

  function record(source, message) {
    const line = `${new Date().toISOString()} [${source}] ${scrub(message).replace(/\s+/g, ' ').trim()}`.slice(0, 600);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const lines = readLines();
      lines.push(line);
      fs.writeFileSync(file, lines.slice(-MAX_LINES).join('\n') + '\n');
    } catch { /* logging must never break the app */ }
  }

  function macDescription() {
    const model = (os.cpus()[0] && os.cpus()[0].model) || process.arch;
    const version = typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : os.release();
    return `${model}, macOS ${version}`;
  }

  function reportUrl() {
    let recent = readLines().slice(-REPORT_LINES).join('\n');
    if (recent.length > REPORT_CHARS) recent = '…' + recent.slice(-REPORT_CHARS);
    const params = new URLSearchParams({
      template: 'bug_report.yml',
      version: app.getVersion(),
      mac: macDescription(),
      error: recent || 'No errors were logged.',
    });
    return `${ISSUE_URL}?${params.toString()}`;
  }

  function watchMainProcess() {
    // observe crashes without changing how the app behaves
    process.on('uncaughtExceptionMonitor', err => record('main', (err && err.stack) || err));
    process.on('unhandledRejection', err => record('main', (err && err.stack) || err));
    app.on('render-process-gone', (e, wc, details) => record('window', `window stopped: ${details && details.reason}`));
    app.on('child-process-gone', (e, details) => record('helper', `${details && details.type} stopped: ${details && details.reason}`));
  }

  function watchWindow(win) {
    win.webContents.on('console-message', (...args) => {
      // Electron passes either one details object or (event, level, message, line, source)
      const d = args.length === 1 ? args[0] : { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };
      const isError = d.level === 'error' || d.level === 3;
      if (!isError) return;
      const where = d.sourceId ? ` (${path.basename(String(d.sourceId))}:${d.lineNumber})` : '';
      record('window', `${d.message}${where}`);
    });
  }

  function menuItems() {
    return [
      { label: 'Report a Problem…', click: () => shell.openExternal(reportUrl()) },
      { label: 'Suggest an Idea…', click: () => shell.openExternal(`${ISSUE_URL}?template=idea.yml`) },
      { type: 'separator' },
      { label: 'Show Error Log', click: () => { try { fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(file)) fs.writeFileSync(file, ''); } catch {} shell.showItemInFolder(file); } },
    ];
  }

  return { record, reportUrl, watchMainProcess, watchWindow, menuItems, file, scrub };
}

module.exports = { createErrorReporter };
