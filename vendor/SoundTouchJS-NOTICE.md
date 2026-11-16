# SoundTouchJS 0.2.3

Source: https://github.com/cutterbl/SoundTouchJS
Published package: https://registry.npmjs.org/soundtouchjs/-/soundtouchjs-0.2.3.tgz
License: GNU Lesser General Public License, version 2.1 or later.

The file soundtouch-0.2.3.mjs is an unmodified copy of package/dist/soundtouch.js,
renamed with .mjs so it remains independently replaceable and can be imported in
a browser or Node without package configuration. All copyright notices remain.
The complete license is provided in SoundTouchJS-LICENSE.txt. Beatdeck's wrapper
is audio-stretch.js and does not modify the library. The original package source
map is not used by playback and is not bundled.

The classic-script file soundtouch-0.2.3.js is mechanically derived from that
unmodified module for local file:// pages, where native module imports are
blocked by browser CORS rules. Conversion: wrap the file in an IIFE; replace
its single final export statement with an object assigned to
window.BeatdeckSoundTouch (or globalThis under Node), also exposing module.exports
for the tests; remove the stale source-map directive. The processing classes
and algorithm are unchanged. The original copyright and license header is
preserved in the derived file.

Derived classic-script SHA-256: 1ab999076056de97b91189523f2b112a8fe079ff159909344d0729103c25b6c7

Vendored file SHA-256: 25306581797160b97991b2095cc5b734c376f4609ef17889af87b77568311223

The package tarball SHA-1 recorded in npm metadata is
ba2d900f04243d3c88fdd643ea476fc7aaf2a41b.

Processing uses the WSOLA time-stretch algorithm and linear rate interpolation.
It is not intended to reproduce Serato Pitch 'n Time. Extreme transformations,
short transients, and dense mixes require listening checks. Pitch processing
changes timbre and does not preserve vocal formants.
