// Build an Apple Silicon app and a drag-to-Applications disk image on macOS.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

async function main() {
  if (process.platform !== 'darwin') throw new Error('Mac packaging requires macOS.');
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const version = pkg.version;
  const output = path.join(root, 'dist');
  await fs.mkdir(output, { recursive: true });
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'beatdeck-package-'));
  // Explicit runtime allowlist: no songs, samples, device IDs, history or build tools.
  const runtime = ['index.html', 'main.js', 'preload.js', 'link.js', 'project-files.cjs',
    'sample-library.cjs', 'audio-stretch.js', 'code25.js', 'note-display.js', 'studio.js',
    'studio.css', 'studio-engine.js', 'studio-notes.js', 'workspace-pages.js',
    'workspace-pages.css', 'vendor'];
  try {
    for (const name of runtime) await fs.cp(path.join(root, name), path.join(stage, name), { recursive: true });
    const appPackage = { ...pkg, scripts: undefined, devDependencies: undefined };
    await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(appPackage, null, 2));
    const { packager } = await import('@electron/packager');
    const [appDirectory] = await packager({
      dir: stage, name: 'Beatdeck', out: output, platform: 'darwin', arch: 'arm64',
      electronVersion: pkg.devDependencies.electron, appVersion: version, buildVersion: version,
      appBundleId: 'com.xtragoodlabs.beatdeck', appCategoryType: 'public.app-category.music',
      icon: path.join(root, 'assets/beatdeck.icns'), asar: true, prune: false, overwrite: true,
      darwinDarkModeSupport: true,
      extendInfo: {
        NSLocalNetworkUsageDescription: 'Beatdeck uses your local network to synchronize tempo with other Ableton Link applications.',
        NSMicrophoneUsageDescription: 'Beatdeck uses audio input for live recording when you enable it.'
      }
    });
    const app = path.join(appDirectory, 'Beatdeck.app');
    // Ad-hoc integrity signature only; this is not Developer ID signing or notarization.
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
    const imageRoot = path.join(stage, 'disk-image');
    await fs.mkdir(imageRoot);
    execFileSync('/usr/bin/ditto', [app, path.join(imageRoot, 'Beatdeck.app')]);
    await fs.symlink('/Applications', path.join(imageRoot, 'Applications'));
    const electronDist = path.join(root, 'node_modules/electron/dist');
    await fs.copyFile(path.join(electronDist, 'LICENSE'), path.join(imageRoot, 'Electron-LICENSE.txt'));
    await fs.copyFile(path.join(electronDist, 'LICENSES.chromium.html'), path.join(imageRoot, 'Chromium-LICENSES.html'));
    await fs.copyFile(path.join(root, 'INSTALL-MAC.md'), path.join(imageRoot, 'Read Me.txt'));
    const dmg = path.join(output, `Beatdeck-${version}-macOS-arm64.dmg`);
    execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'Beatdeck', '-srcfolder', imageRoot, '-ov', '-format', 'UDZO', dmg], { stdio: 'inherit' });
    const digest = createHash('sha256').update(await fs.readFile(dmg)).digest('hex');
    await fs.writeFile(path.join(output, 'SHA256SUMS.txt'), `${digest}  ${path.basename(dmg)}\n`);
    console.log(`Built ${dmg}`);
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
