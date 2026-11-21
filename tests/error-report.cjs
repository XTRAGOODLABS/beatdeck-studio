const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createErrorReporter } = require('../error-report.cjs');

function fakeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdeck-errors-'));
  return { getPath: () => dir, getVersion: () => '1.0.1', on: () => {} };
}

test('errors are logged without the user name and fill the report form', () => {
  const app = fakeApp();
  const opened = [];
  const r = createErrorReporter({ app, shell: { openExternal: u => opened.push(u), showItemInFolder: () => {} } });
  r.record('window', `TypeError: x is undefined at ${os.homedir()}/Music/song.wav and /Users/someone/file`);
  const log = fs.readFileSync(r.file, 'utf8');
  assert.ok(!log.includes(os.homedir()), 'home folder hidden');
  assert.ok(!log.includes('/Users/someone'), 'other user names hidden');
  assert.ok(log.includes('~/Music/song.wav'));

  const url = new URL(r.reportUrl());
  assert.strictEqual(url.origin + url.pathname, 'https://github.com/XTRAGOODLABS/beatdeck-studio/issues/new');
  assert.strictEqual(url.searchParams.get('template'), 'bug_report.yml');
  assert.strictEqual(url.searchParams.get('version'), '1.0.1');
  assert.match(url.searchParams.get('error'), /TypeError: x is undefined/);
  assert.match(url.searchParams.get('mac'), /macOS/);

  r.menuItems()[0].click();
  assert.strictEqual(opened.length, 1);
});

test('the log stays small and reports stay short', () => {
  const app = fakeApp();
  const r = createErrorReporter({ app, shell: {} });
  for (let i = 0; i < 260; i++) r.record('main', 'problem number ' + i + ' ' + 'x'.repeat(80));
  assert.strictEqual(fs.readFileSync(r.file, 'utf8').trim().split('\n').length, 200);
  assert.ok(r.reportUrl().length < 4000);
});

test('a report with no errors says so', () => {
  const r = createErrorReporter({ app: fakeApp(), shell: {} });
  assert.strictEqual(new URL(r.reportUrl()).searchParams.get('error'), 'No errors were logged.');
});
