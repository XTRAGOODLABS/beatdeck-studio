(function (root) {
  'use strict';
  const scriptURL = typeof document !== 'undefined' && document.currentScript
    ? document.currentScript.src
    : typeof __filename !== 'undefined' ? require('node:url').pathToFileURL(__filename).href : null;
  const sourceCache = new WeakMap();
  const lru = new Set();
  const MAX_CACHE_BYTES = 96 * 1024 * 1024;
  const CHUNK = 4096;
  let cachedBytes = 0, libraryPromise;
  const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

  function library() {
    if (root.BeatdeckSoundTouch) return Promise.resolve(root.BeatdeckSoundTouch);
    if (!libraryPromise) {
      if (typeof document === 'undefined' && typeof require === 'function') {
        libraryPromise = Promise.resolve().then(() => require('./vendor/soundtouch-0.2.3.js'));
      } else if (!scriptURL) {
        return Promise.reject(new Error('Cannot locate the bundled stretch library.'));
      } else {
        libraryPromise = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = new URL('./vendor/soundtouch-0.2.3.js', scriptURL).href;
          script.onload = () => root.BeatdeckSoundTouch
            ? resolve(root.BeatdeckSoundTouch)
            : reject(new Error('The bundled stretch library could not be initialized.'));
          script.onerror = () => { script.remove(); reject(new Error('The bundled stretch library could not be loaded.')); };
          (document.head || document.documentElement).append(script);
        });
      }
      libraryPromise = libraryPromise.catch(error => { libraryPromise = null; throw error; });
    }
    return libraryPromise;
  }

  function touch(entry) {
    if (lru.has(entry)) { lru.delete(entry); lru.add(entry); }
  }
  function retain(entry, result) {
    entry.bytes = result.length * result.numberOfChannels * 4;
    if (entry.bytes > MAX_CACHE_BYTES) { entry.map.delete(entry.key); return; }
    lru.add(entry); cachedBytes += entry.bytes;
    while (cachedBytes > MAX_CACHE_BYTES) {
      const oldest = lru.values().next().value;
      lru.delete(oldest); cachedBytes -= oldest.bytes; oldest.map.delete(oldest.key);
    }
  }

  async function render(buffer, tempo, pitch) {
    const { SoundTouch } = await library();
    await yieldToUI();
    const channels = buffer.numberOfChannels;
    const outputLength = Math.max(1, Math.round(buffer.length / tempo));
    const output = new root.AudioBuffer({ numberOfChannels: channels, length: outputLength, sampleRate: buffer.sampleRate });
    const left = buffer.getChannelData(0), right = buffer.getChannelData(channels === 1 ? 0 : 1);
    const outLeft = output.getChannelData(0), outRight = channels === 2 ? output.getChannelData(1) : null;
    const pipe = new SoundTouch();
    pipe.stretch.setParameters(buffer.sampleRate, 0, 0, 8);
    pipe.tempo = tempo;
    pipe.pitchSemitones = pitch;
    const input = new Float32Array(CHUNK * 2), rendered = new Float32Array(CHUNK * 2);
    let sourcePosition = 0, destinationPosition = 0, sliceStart = performance.now();
    // The pipe needs lookahead after the final source frame. Feed silence to flush
    // the algorithm, but retain exactly the requested musical duration.
    const maxInput = buffer.length + Math.ceil(buffer.sampleRate * 2 * Math.max(1, tempo, 2 ** (pitch / 12))) + CHUNK * 8;
    while (destinationPosition < outputLength) {
      if (pipe.outputBuffer.frameCount === 0) {
        if (sourcePosition >= maxInput) throw new Error('The stretch processor could not finish this sample.');
        input.fill(0);
        const frames = Math.min(CHUNK, Math.max(0, buffer.length - sourcePosition));
        for (let i = 0; i < frames; i++) {
          input[i * 2] = left[sourcePosition + i]; input[i * 2 + 1] = right[sourcePosition + i];
        }
        pipe.inputBuffer.putSamples(input, 0, CHUNK);
        sourcePosition += CHUNK;
        pipe.process();
      }
      const count = Math.min(CHUNK, pipe.outputBuffer.frameCount, outputLength - destinationPosition);
      if (count) {
        pipe.outputBuffer.extract(rendered, 0, count);
        pipe.outputBuffer.receive(count);
        for (let i = 0; i < count; i++) {
          outLeft[destinationPosition + i] = rendered[i * 2];
          if (outRight) outRight[destinationPosition + i] = rendered[i * 2 + 1];
        }
        destinationPosition += count;
      }
      if (performance.now() - sliceStart >= 8) { await yieldToUI(); sliceStart = performance.now(); }
    }
    return output;
  }

  function prepare(buffer, options = {}) {
    const tempo = options.tempo == null ? 1 : Number(options.tempo);
    const pitch = options.pitch == null ? 0 : Number(options.pitch);
    if (!buffer || !Number.isInteger(buffer.length) || buffer.length < 1 || typeof buffer.getChannelData !== 'function') {
      return Promise.reject(new TypeError('Choose a decoded audio sample before stretching.'));
    }
    if (![1, 2].includes(buffer.numberOfChannels) || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8000 || buffer.sampleRate > 192000) {
      return Promise.reject(new RangeError('Stretch supports mono or stereo audio at 8–192 kHz.'));
    }
    if (!Number.isFinite(tempo) || tempo < 0.25 || tempo > 4 || !Number.isFinite(pitch) || pitch < -24 || pitch > 24) {
      return Promise.reject(new RangeError('Use tempo between 25% and 400%, and pitch within two octaves.'));
    }
    if (tempo === 1 && pitch === 0) return Promise.resolve(buffer);
    const outputFrames = Math.round(buffer.length / tempo);
    if (outputFrames * buffer.numberOfChannels * 4 > 256 * 1024 * 1024) {
      return Promise.reject(new RangeError('This stretch would exceed the 256 MB prepared-audio limit. Choose a shorter sample.'));
    }
    if (typeof root.AudioBuffer !== 'function') return Promise.reject(new Error('Offline audio preparation is unavailable in this browser.'));
    let map = sourceCache.get(buffer);
    if (!map) { map = new Map(); sourceCache.set(buffer, map); }
    const key = `${tempo}:${pitch}`;
    if (map.has(key)) { const entry = map.get(key); touch(entry); return entry.promise; }
    const entry = { key, map, bytes: 0, promise: null };
    entry.promise = render(buffer, tempo, pitch).then(result => { retain(entry, result); return result; }, error => { map.delete(key); throw error; });
    map.set(key, entry);
    return entry.promise;
  }

  function clearCache() {
    for (const entry of lru) entry.map.delete(entry.key);
    lru.clear(); cachedBytes = 0;
  }
  const api = { prepare, clearCache, ready: library, version: 'SoundTouchJS 0.2.3', algorithm: 'WSOLA', limits: Object.freeze({ minTempo: 0.25, maxTempo: 4, minPitch: -24, maxPitch: 24 }) };
  root.BeatdeckStretch = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
