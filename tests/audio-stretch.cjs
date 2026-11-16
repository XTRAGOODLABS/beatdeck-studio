const assert = require('node:assert/strict');
class AudioBuffer {
  constructor({ length, numberOfChannels, sampleRate }) {
    this.length = length; this.numberOfChannels = numberOfChannels; this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel) { return this.channels[channel]; }
}
global.AudioBuffer = AudioBuffer;
const stretch = require('../audio-stretch.js');
function tone(sampleRate, seconds = 1.4, stereo = false) {
  const buffer = new AudioBuffer({ length: Math.round(sampleRate * seconds), numberOfChannels: stereo ? 2 : 1, sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const frequency = c ? 660 : 440, samples = buffer.getChannelData(c);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.5;
  }
  return buffer;
}
function frequency(buffer, channel = 0) {
  const samples = buffer.getChannelData(channel), start = Math.round(samples.length * 0.2), end = Math.round(samples.length * 0.8);
  const crossings = [];
  for (let i = start + 1; i < end; i++) if (samples[i - 1] <= 0 && samples[i] > 0) crossings.push(i - 1 - samples[i - 1] / (samples[i] - samples[i - 1]));
  assert(crossings.length > 10, 'render should contain an audible periodic signal');
  return (crossings.length - 1) * buffer.sampleRate / (crossings.at(-1) - crossings[0]);
}
async function main() {
  for (const sampleRate of [44100, 48000]) {
    const input = tone(sampleRate, 1.4, true), original = input.getChannelData(0).slice();
    assert.equal(await stretch.prepare(input, { tempo: 1, pitch: 0 }), input, 'neutral processing must preserve the original sample exactly');
    for (const [tempo, pitch] of [[1.5, 0], [0.75, 12], [1, -12]]) {
      const pending = stretch.prepare(input, { tempo, pitch });
      assert.equal(stretch.prepare(input, { tempo, pitch }), pending, 'simultaneous requests should share preparation');
      const output = await pending;
      assert.equal(output.sampleRate, sampleRate);
      assert.equal(output.numberOfChannels, 2);
      assert.equal(output.length, Math.round(input.length / tempo));
      const left = frequency(output), right = frequency(output, 1), factor = 2 ** (pitch / 12);
      assert(Math.abs(left - 440 * factor) / (440 * factor) < 0.025, `left pitch ${left} should match ${440 * factor}`);
      assert(Math.abs(right - 660 * factor) / (660 * factor) < 0.025, `right pitch ${right} should match ${660 * factor}`);
      for (const samples of output.channels) assert(samples.every(Number.isFinite), 'render must not produce NaN or infinity');
      assert.equal(await stretch.prepare(input, { tempo, pitch }), output, 'completed results should be cached');
      console.log(`PASS ${sampleRate} Hz: tempo ${tempo}, pitch ${pitch}, duration ${output.duration.toFixed(3)} s, tones ${left.toFixed(1)}/${right.toFixed(1)} Hz`);
    }
    assert.deepEqual(input.getChannelData(0), original, 'preparation must leave input PCM unchanged');
  }
  const mono = await stretch.prepare(tone(48000, 1), { tempo: 0.8, pitch: 0 });
  assert.equal(mono.numberOfChannels, 1);
  assert(Math.abs(frequency(mono) - 440) < 10);
  let timerRan = false;
  const preparation = stretch.prepare(tone(48000, 4, true), { tempo: 0.75, pitch: 3 });
  setTimeout(() => { timerRan = true; }, 0);
  await preparation;
  assert(timerRan, 'nontrivial preparation should yield to the event loop');
  await assert.rejects(stretch.prepare(tone(44100), { tempo: NaN }), /tempo/);
  await assert.rejects(stretch.prepare(tone(44100), { pitch: 25 }), /pitch/);
  stretch.clearCache();
  console.log('PASS mono, immutable source PCM, concurrent/cache behavior, invalid settings, UI yielding');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
