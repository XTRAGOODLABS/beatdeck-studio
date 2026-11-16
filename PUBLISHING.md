# Release process

The public source repository is XTRAGOODLABS/beatdeck-studio. GitHub v1.0.0 is the initial source release; v1.0.1 adds an Apple Silicon Mac application download.

Run npm ci, npm run check and npm test before tagging. On macOS, run npm run package:mac to create the app, DMG and SHA256SUMS.txt in dist. The packaging script stages only its named runtime files. The DMG includes Electron/Chromium notices and installation instructions.

Before upload, verify the application signature, bundle version and architecture; inspect packaged files for private data; mount the DMG, copy the app out and launch using a temporary BEATDECK_DATA_DIR. Never test against an open personal song. Evaluate browser integration scripts only in an isolated test project.

Create an immutable release tag for the checked commit. Upload the DMG and checksum file to a draft release, verify asset digests, then publish. Update README download links and release notes with the architecture, minimum macOS version and signing/notarization status. The current download is ad-hoc signed only; no Apple Developer ID identity or notarization credentials are configured.

Keep audio, songs, Tracklib media, personal MIDI device IDs, controller backups, rollback files and installed application data out of Git and release archives. Source runs use a separate Beatdeck-Dev data folder. BEATDECK_DATA_DIR also allows isolated packaged-app testing.

Retain SoundTouchJS and runtime notices. Project code remains UNLICENSED until the owner selects distribution terms. No automatic updater is supplied.
