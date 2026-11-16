# Install Beatdeck on Mac

Download **Beatdeck-1.0.1-macOS-arm64.dmg** from:
https://github.com/XTRAGOODLABS/beatdeck-studio/releases/tag/v1.0.1

## Requirements

Apple Silicon Mac (M-series), macOS 13 Ventura or newer. This download does not run natively on Intel Macs. No Node.js, npm, developer tools or separate Electron installation is required.

## Install

1. Open the downloaded DMG.
2. Drag Beatdeck.app onto the Applications shortcut.
3. Eject the Beatdeck disk image and open Beatdeck from Applications.
4. Enable sound in Beatdeck. Connect your MIDI controller and run the relevant setup/Learn controls.

If replacing an older Beatdeck, save your song and quit the old app first. Keep a .beatdeck project backup. This download contains no personal controller calibration, songs or third-party audio; first-time installations need controller setup. Tracklib remains a separate local folder library.

## First launch and macOS security

This initial community download is **not Developer ID signed or notarized by Apple**. It carries an ad-hoc integrity signature. macOS can block the first launch.

If macOS blocks it and you trust this release, open System Settings > Privacy & Security, find the Beatdeck notice, and choose Open Anyway. Confirm the prompt. Managed Macs may prohibit this. Do not disable Gatekeeper globally.

Apple's instructions: https://support.apple.com/en-us/102445

## Verify the download

SHA256SUMS.txt is provided alongside the DMG. The app does not automatically update; download later releases from the same repository.

## Build from source instead

Use npm ci, then npm start. Maintainers can run npm run package:mac on macOS to reproduce the Apple Silicon package. Source profiles use Beatdeck-Dev data; BEATDECK_DATA_DIR can select an isolated test profile for either a source run or a packaged app.
