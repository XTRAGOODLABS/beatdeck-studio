# Release process

The private source repository is XTRAGOODLABS/beatdeck-studio. Version 1.0.0 is a source release, without a signed or notarized installer.

Run `npm ci`, `npm run check` and `npm test` before tagging a release. Evaluate the browser integration scripts only in an isolated test project. GitHub Actions runs syntax and automated tests on pushes and pull requests.

Keep audio, songs, Tracklib media, personal MIDI device IDs, controller backups, rollback files and installed application data out of Git and release archives. Exported source runs use a separate Beatdeck-Dev data folder.

Retain the SoundTouchJS license and notices. Project code remains UNLICENSED until the owner selects distribution terms.
