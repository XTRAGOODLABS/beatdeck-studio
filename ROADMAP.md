# Planned expansion

These are future directions, not shipped features or promised release dates. The current release uses Electron and JavaScript. The JUCE rebuild has not been implemented in this repository.

## Next major milestone: native JUCE rebuild

Rebuild Beatdeck as a native C++/JUCE application, retaining the fast sampling workflow and the existing musical features. Begin with macOS and a small vertical slice: load audio, trim/fade a chop, play it from MIDI, sequence it and save/reopen the project. Expand only after that path is reliable.

### Preserve the working instrument

- Retain two eight-piece drum kits, four chop tracks, live loops, scenes/song arrangement and the uncluttered page/browser layout.
- Preserve the current Code25 Performance controls, Macro/Micro behavior, pad order, X/Y assignments and expressive keyboard controls.
- Carry forward tested Maschine MK2 and Alesis Vortex Wireless support; archive exact portable profiles and test each physical device again in the native build.
- Add a controller-profile import/export path without requiring personal device IDs in shared presets.
- Build an importer for existing .beatdeck songs and a migration preview. Keep original projects untouched and the current app available during the transition.
- Keep Tracklib separate from general samples/drums and keep source audio in its original folders.

### Native audio and MIDI foundation

- Sample-accurate sequencing, reliable MIDI timestamp handling and an audio callback that avoids allocation, file access and UI work.
- Explicit audio device/buffer settings, latency reporting and CPU/dropout diagnostics.
- Preserve MIDI Learn, pickup, independent key/pad channels and USB/HUI port routing.
- Compare timing, voice/choke behavior, rendering and save/reopen results against the existing app before replacing it.

## Native effects and instruments

- Start with VST3 effects hosting and Audio Units on macOS, using JUCE's hosting facilities as a foundation.
- Add per-track insert chains, a master chain, bypass/reordering, plugin editor windows and project-state recall.
- Scan plugins outside the audio callback; add timeout handling, failed-plugin quarantine and missing-plugin recovery.
- Add host transport/tempo information and account for plugin latency in playback/rendering.
- Explore instrument plugins after effects hosting is stable, including MIDI routing and predictable pad/key focus.
- Evaluate separate-process plugin isolation; JUCE hosting alone is not a guarantee that a crashing plugin cannot crash the host.
- Validate specific plugins and architectures. Broad plugin compatibility is a goal, not a current claim.

## Sampling and musical workflow

- Clearer trim/fade handles, waveform zoom, undo/redo and named chop presets.
- Better stretch quality, auditioned before adoption; explore formant-aware processing and key/BPM analysis.
- More expressive piano-roll editing, quantization, velocity/probability/roll tools and visible automation lanes.
- Faster scene variations, arrangement edits, loop capture and stem export.
- Searchable library metadata, favorites, tags and kit management, while preserving Tracklib separation.

## Controller feedback and performance

- Visible control/value overlays and a persistent controller map inside the app.
- Exportable profiles, clear port/device status and guided calibration.
- Investigate supported LED/display feedback per device. Dynamic Code25 parameter names are not a promised feature; CRATOS is the confirmed static preset name.
- Preserve existing mappings as defaults; offer additional assignments as optional profiles.

## Distribution and later platforms

- Native macOS packaging, signing/notarization, recovery and versioned release notes.
- Evaluate Windows after native macOS parity. Treat iPad/touch work as a separate platform effort with its own audio, MIDI and plugin constraints.
- Review JUCE and dependency distribution terms before selecting the shipping license; no licensing decision is made by this roadmap.

## Suggested build order

1. Native sampler + MIDI + save/reopen vertical slice.
2. Drums, chops, sequencing, scenes/song and old-project import parity.
3. Physical Code25, Maschine MK2 and Vortex acceptance checks.
4. VST3/AU effects prototype, state recall and recovery, then production hosting.
5. Instrument hosting, richer automation, library improvements and packaged releases.

## Technical references

- [JUCE Audio Plugin Host and VST/AU hosting](https://juce.com/tutorials/tutorial_audio_bus_layouts/)
- [JUCE VST3 hosting configuration](https://docs.juce.com/develop/juce__audio__processors__headless_8h.html)
- [JUCE downloads and licensing information](https://juce.com/get-juce/)

[Version history](CHANGELOG.md) · [Controller mappings](Controller-Mappings.md)
