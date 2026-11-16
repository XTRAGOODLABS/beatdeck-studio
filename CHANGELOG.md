# Beatdeck version history

Beatdeck began as a browser drum machine created with Claude, became a standalone Mac app, and developed into the Studio workflow with Codex.

Versions 1.2.0–1.5.0 identify development milestones reconstructed from chats and dated backups. The October standalone versions and the November GitHub tag use overlapping numbering: the first GitHub source release, tagged v1.0.0 on November 16, 2026, contains the v1.5.0 Studio milestone. Existing tags and package versions have not been rewritten.

## v1.5.0 — November 15–16, 2026

Studio workflow, expanded Code25 support and two drum kits.

- Sample, Sequence, Song, Mixer, Perform and Code25 pages; collapsible Projects, Drums, Audio Samples, Tracklib, FX and Instruments browser.
- Separate local Tracklib library with folder selection, refresh, search, audition, loading and collapsed cards.
- Melodic piano roll; waveform-adjacent pitch, source BPM, tempo matching, key and playback controls.
- Stretch mode for independent tempo/pitch; Tape mode links playback speed and pitch. Onscreen pitch Macro/Micro control.
- Middle-C labels selectable as C3 or C4 without changing MIDI notes or sample pitch.
- Code25 keys play the selected chop melodically; 16 pads handle drums/chops. E1/E2 trim sample start/end; E3/E4 adjust fades. Encoder Mode selects Macro/Micro.
- F1–F4 control chop-track levels; F5 master. B1–B5 retain Drums, Steps, Chops, Loops and Song Record. USB controls work alongside HUI transport.
- X/Y mapped to filter/pan. Hardware preset renamed CRATOS and confirmed on the controller. Illustrated map included.
- Pitch/key controls remain onscreen: octave and Transpose buttons produced no usable MIDI in the hardware checks.
- Two independent eight-piece kits: Kit A lower pads 1–8; Kit B upper pads 9–16. App follows that physical layout. Separate kit choices, samples, tone buses and choke groups.
- Older eight-drum projects migrate chop lanes, mixer settings and recorded events. Portable projects support 16 drum, four chop and eight loop assets.
- Fixed Kit B hit feedback and simultaneous USB/HUI transport reception. Added pickup and precision safeguards.
- Preserved existing mappings and separate sample libraries, including previously tested Maschine MK2 and Alesis Vortex Wireless support.
- Private GitHub source publication under XTRAGOODLABS/beatdeck-studio, with source archive and controller maps. No signed/notarized installer.
- Validation: 25 automated tests, audio-processing checks, 46 drum/browser integration checks and successful GitHub checks. Personal songs, samples and controller backups excluded.

## v1.4.0 — November 13, 2026

- Code25 support: 16 performance pads and piano-key sample/chop playing.
- Tested and working Alesis Vortex Wireless mapping, confirmed by the owner. Added between the November 1 and November 13 milestones; exact date uncertain.
- Retained tested and working Maschine MK2 mapping.
- Fixed New Song errors and Save failing after closing the window without quitting.

## v1.3.0 — November 3, 2026

- Sequencer and whole-song view; expanded one chop track to four.
- Song parts with independent lengths and individual song bars.
- New Song, Save, Save As and Recover Song; three-view interface.

## v1.2.0 — November 1, 2026

- Tested and working Maschine MK2 mapping, including pads and performance controls, confirmed by the owner.
- Get Maschine Ready setup button; sample fades and live drops.
- Custom launch screen, header logo and full-screen startup.
- Fixed screen sizing/zoom and Maschine Play-button sticking, including echoed signals and knob noise.
- Reverted automatic Native Instruments helper startup because it interfered with MK2 detection.

## v1.1.0 — October 31, 2026

- Five swappable drum kits and custom-kit saving; patterns A–H and Song mode.
- Human Feel slider; eight live-loop slots, Loops pad mode and metronome.
- Fixed swing timing drift; added safety limiter; removed leftover sign-in code.

## v1.0.1 — October 30, 2026

- Ableton Link tempo synchronization with djay Pro.

## v1.0.0 — October 30, 2026

- First standalone Mac app, developed on the MacBook, with orange icon and no browser required.

## v0.3.0 — Late October 2026

- Hits, Even, Beat and By Hand sample chopping; reverse slice and tempo matching.
- Chops lane/mode; per-step volume, probability and rolls; cut groups and pad lights.
- Samples remembered between visits; WAV export.

## v0.2.0 — Late October 2026

- Maschine MK2 controller panel: Connect, Teach Pads and Assign.
- Play/Steps pad modes and recording.

## v0.1.0 — Mid-October 2026

- Browser-based 16-step grid, eight built-in drums, tempo/swing, per-track volume, mute and sample loading.
- Initial sign-in screen; fixed blocked access. Sign-in removed later.

## Evidence and continuity

Early dates/groupings come from supplied chat history and dated backups, rather than a complete historical Git log. MacBook and Mac mini copies developed separately; November milestones primarily describe the Mac mini. Controller status records the owner's tested-and-working confirmation; it does not imply a fresh hardware retest of every legacy device for this documentation update.

[Controller mappings](Controller-Mappings.md) · [Planned expansion](ROADMAP.md)
