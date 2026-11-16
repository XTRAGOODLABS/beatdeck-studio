# Code25 mapping

Reference layout captured from one calibrated Code25 preset. Use Learn for your controller; CC numbers, pad notes and ports depend on its preset. Personal device configuration is not included.

In Beatdeck, open Code25 and press Connect after launch if the controller is not connected. Select **Code 25 USB MIDI**. The status should also show **HUI transport**. Keep knobs/faders/buttons in red MIDI mode and use the same hardware preset/bank that was calibrated.

| Control | Action | Message | Port |
|---|---|---|---|
| E1 | Sample start trim | CC 76, channel 1 | USB MIDI |
| E2 | Sample end trim | CC 73, channel 1 | USB MIDI |
| E3 | Start fade (0–20% of chop) | CC 77, channel 1 | USB MIDI |
| E4 | End fade (0–20% of chop) | CC 78, channel 1 | USB MIDI |
| F1 | Chops 1 level | CC 7, channel 1 | USB MIDI |
| F2 | Chops 2 level | CC 70, channel 1 | USB MIDI |
| F3 | Chops 3 level | CC 75, channel 1 | USB MIDI |
| F4 | Chops 4 level | CC 74, channel 1 | USB MIDI |
| F5 | Master level | CC 71, channel 1 | USB MIDI |
| B1 | Drum pads | CC 91, channel 1 | USB MIDI |
| B2 | Step pads | CC 92, channel 1 | USB MIDI |
| B3 | Chop pads | CC 93, channel 1 | USB MIDI |
| B4 | Loop pads | CC 94, channel 1 | USB MIDI |
| B5 | Record song | CC 10, channel 1 | USB MIDI |
| TRewind | Beginning | Note 91, channel 1 | HUI |
| TForward | Next scene | Note 92, channel 1 | HUI |
| TStop | Stop | Note 93, channel 1 | HUI |
| TPlay | Play / stop | Note 94, channel 1 | HUI |
| TRecord | Record pattern | Note 95, channel 1 | HUI |
| X axis | Selected chop filter | CC 1, channel 1 | USB MIDI |
| Y axis | Selected chop pan | CC 16, channel 1 | USB MIDI |

Piano keys: channel 1, selected chop across pitches in Keys mode. Choose Poly for chords.

Pads, numbered from bottom-left across each row, then upward:

| Pad | Note | Channel |
|---|---|---|
| 1 | 72 | 10 |
| 2 | 73 | 10 |
| 3 | 74 | 10 |
| 4 | 75 | 10 |
| 5 | 76 | 10 |
| 6 | 77 | 10 |
| 7 | 78 | 10 |
| 8 | 79 | 10 |
| 9 | 80 | 10 |
| 10 | 81 | 10 |
| 11 | 82 | 10 |
| 12 | 83 | 10 |
| 13 | 84 | 10 |
| 14 | 85 | 10 |
| 15 | 86 | 10 |
| 16 | 87 | 10 |

The Code25 has no dedicated Loop transport button. B4 selects loop pads. Absolute knobs and faders use pickup: move through the current on-screen value before changing it.

The reference messages above were captured from physical hardware. Unit tests verify routing and parameter/transport dispatch; each new controller preset requires calibration.

## Macro / Micro knob control

Use **Encoder Mode**, below the four knobs. Red uses the saved USB MIDI encoder assignments for Macro. Green uses the paired HUI CC16/17/18/19, channel1, as signed relative Micro movements. The software mode readout updates on the first knob turn after switching. Fader Mode and Button Mode stay red.

E1: start trim; E2: end trim; E3: start fade; E4: end fade. Macro trim spans the source audio and is bounded by the other trim endpoint. Macro fades span0–20% of the selected chop. Micro moves either trim point or fade by1ms per relative increment (rounded to the audio sample grid). Faster hardware turns can send multiple increments. Fine edits bypass zero-crossing snap for precision and preserve its setting.

Green-mode messages and clockwise/counterclockwise signs were captured directly from the physical Code25.22 controller tests and5 focused browser checks pass. Switching back to red resets pickup to avoid stale absolute-position jumps.

## Pitch, tempo and key strip

Sample pitch, source BPM, tempo matching, project key/scale and playback mode are visible below the waveform. Pitch −/+ uses one-semitone Macro steps or0.01-semitone Micro steps. The precision button and the chosen precision are saved with the project. The visible tempo field updates the existing sample-BPM setting and saves it on the selected track.

Performance buttons B1–B5 remain unchanged, as requested. Pitch, key and pitch precision use the visible onscreen controls.

Physical Pad Octave, Key Octave and Transpose button presses produced no MIDI during a read-only capture on this Code25. A subsequent piano-key press was received, confirming the monitor was working. These local hardware controls are not represented as directly mapped software buttons.

## X/Y reference setup

For this reference preset, X sends CC1 and controls filter; Y sends CC16 and controls pan, on USB MIDI channel 1. Both use absolute pickup. If Y currently sends pitch bend, assign its own CC16 on the controller so the pitch wheel stays independent. The modulation wheel and X both send CC1 and both control filter. Learn and store your own controller preset; private device configuration is excluded from this package.

## Two drum kits

B1 selects Drum mode. Pads 1–8 play Kit A; pads 9–16 play Kit B. Each bank has its own eight-piece kit selector and samples. Pad numbers run from bottom-left across each row, then upwards. Steps, Chops and Loops retain their existing behaviors. [Controller map](docs/Code25-current-mappings.png).
