#!/usr/bin/env node
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel


import fs from "node:fs";
import path from "node:path";

const SAMPLE_RATE = 44_100;
const BPM = 80;
const BEAT_SECONDS = 60 / BPM;
const BAR_SECONDS = BEAT_SECONDS * 4;
const BARS = 24;
const LOOP_SECONDS = BAR_SECONDS * BARS;
const LOOP_SAMPLES = Math.round(LOOP_SECONDS * SAMPLE_RATE);
const WARMUP_CYCLES = 3;
const WORK_SAMPLES = LOOP_SAMPLES * WARMUP_CYCLES;
const TAU = Math.PI * 2;

const outputPath = path.resolve(
  process.argv[2] ?? "/tmp/the-fashion-maze-loop.wav",
);

const left = new Float32Array(WORK_SAMPLES);
const right = new Float32Array(WORK_SAMPLES);

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (value) => value * value * (3 - 2 * value);

function stereoGains(pan) {
  const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function envelope(time, duration, attack, release) {
  const fadeIn = smoothstep(clamp(time / attack, 0, 1));
  const fadeOut = smoothstep(clamp((duration - time) / release, 0, 1));
  return fadeIn * fadeOut;
}

function addVoice({ start, duration, midi, amplitude, pan = 0, kind }) {
  const startSample = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const endSample = Math.min(
    WORK_SAMPLES,
    Math.ceil((start + duration) * SAMPLE_RATE),
  );
  const frequency = midiToHz(midi);
  const [gainLeft, gainRight] = stereoGains(pan);

  for (let sample = startSample; sample < endSample; sample += 1) {
    const time = (sample - startSample) / SAMPLE_RATE;
    const phase = TAU * frequency * time;
    let value = 0;
    let gain = 0;

    if (kind === "pad") {
      gain = envelope(time, duration, 1.45, 2.1);
      const drift = Math.sin(TAU * 0.075 * time) * 0.012;
      value =
        Math.sin(phase + drift) * 0.58 +
        Math.sin(phase * 0.501 - 0.3) * 0.12 +
        Math.sin(phase * 1.997 + 0.55) * 0.19 +
        Math.sin(phase * 3.003 + 1.1) * 0.055;
    } else if (kind === "rhodes") {
      const decay = Math.exp(-time * 0.82);
      gain = envelope(time, duration, 0.018, 0.65) * decay;
      value =
        Math.sin(phase) * 0.72 +
        Math.sin(phase * 2.006 + 0.35) * 0.2 +
        Math.sin(phase * 3.998 + 0.8) * 0.08;
    } else if (kind === "glass") {
      const decay = Math.exp(-time * 1.15);
      gain = envelope(time, duration, 0.008, 0.9) * decay;
      value =
        Math.sin(phase) * 0.6 +
        Math.sin(phase * 2.73 + 0.4) * 0.2 +
        Math.sin(phase * 4.17 + 1.2) * 0.12;
    } else {
      const decay = 0.78 + Math.exp(-time * 1.8) * 0.22;
      gain = envelope(time, duration, 0.08, 0.7) * decay;
      value = Math.sin(phase) * 0.88 + Math.sin(phase * 2 + 0.2) * 0.09;
    }

    const voiced = value * gain * amplitude;
    left[sample] += voiced * gainLeft;
    right[sample] += voiced * gainRight;
  }
}

function addBrush(start, duration, amplitude, pan, seed) {
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(
    WORK_SAMPLES,
    Math.ceil((start + duration) * SAMPLE_RATE),
  );
  const [gainLeft, gainRight] = stereoGains(pan);
  let random = seed >>> 0;
  let slow = 0;

  for (let sample = startSample; sample < endSample; sample += 1) {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    const noise = ((random >>> 0) / 0xffffffff) * 2 - 1;
    slow += (noise - slow) * 0.035;
    const airy = noise - slow;
    const time = (sample - startSample) / SAMPLE_RATE;
    const gain = envelope(time, duration, 0.22, 0.42);
    const value = airy * gain * amplitude;
    left[sample] += value * gainLeft;
    right[sample] += value * gainRight;
  }
}

const chords = [
  { name: "Dm9", bass: 38, notes: [50, 53, 57, 60, 64] },
  { name: "Bbmaj9", bass: 34, notes: [46, 50, 53, 57, 60] },
  { name: "Fmaj9/A", bass: 45, notes: [48, 53, 57, 60, 67] },
  { name: "Cadd9/G", bass: 43, notes: [48, 52, 55, 62, 64] },
  { name: "Gm9", bass: 43, notes: [43, 46, 50, 53, 57] },
  { name: "Bbmaj9/D", bass: 38, notes: [46, 50, 53, 57, 60] },
  { name: "A7sus4", bass: 45, notes: [45, 50, 52, 55, 59] },
  { name: "A7b9", bass: 45, notes: [45, 49, 52, 55, 58] },
];

const arpeggioPatterns = [
  [2, 4, 1, 3],
  [3, 1, 4, 2],
  [1, 3, 0, 4],
];

for (let cycle = 0; cycle < WARMUP_CYCLES; cycle += 1) {
  const cycleStart = cycle * LOOP_SECONDS;

  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = chords[bar % chords.length];
    const section = Math.floor(bar / 8);
    const barStart = cycleStart + bar * BAR_SECONDS;

    chord.notes.forEach((midi, noteIndex) => {
      addVoice({
        start: barStart - 0.08,
        duration: BAR_SECONDS + 1.85,
        midi,
        amplitude: 0.026 + noteIndex * 0.0015,
        pan: (noteIndex - 2) * 0.18,
        kind: "pad",
      });
    });

    addVoice({
      start: barStart,
      duration: BAR_SECONDS * 0.88,
      midi: chord.bass,
      amplitude: 0.085,
      pan: section === 1 ? -0.04 : 0.04,
      kind: "bass",
    });

    const pattern = arpeggioPatterns[section];
    const offsets = section === 0 ? [0.5, 1.5, 2.5] : [0.25, 1.25, 2.25, 2.75];
    offsets.forEach((offset, eventIndex) => {
      const noteIndex = pattern[eventIndex % pattern.length];
      const octave = section === 2 && eventIndex === offsets.length - 1 ? 24 : 12;
      addVoice({
        start: barStart + offset * BEAT_SECONDS,
        duration: 2.55,
        midi: chord.notes[noteIndex] + octave,
        amplitude: section === 0 ? 0.037 : 0.044,
        pan: eventIndex % 2 === 0 ? -0.28 : 0.3,
        kind: "rhodes",
      });
    });

    if (bar % 2 === 0) {
      addVoice({
        start: barStart + (section === 2 ? 1.5 : 2.25) * BEAT_SECONDS,
        duration: 3.8,
        midi: chord.notes[4] + 24,
        amplitude: section === 2 ? 0.027 : 0.021,
        pan: bar % 4 === 0 ? 0.5 : -0.48,
        kind: "glass",
      });
    }

    addBrush(
      barStart + 1.6 * BEAT_SECONDS,
      0.72,
      0.0055,
      bar % 2 === 0 ? -0.4 : 0.4,
      0x6d2b79f5 ^ (bar * 0x9e3779b9),
    );
  }
}

// A quiet, repeatable air layer removes digital emptiness without becoming a beat.
for (let cycle = 0; cycle < WARMUP_CYCLES; cycle += 1) {
  const cycleOffset = cycle * LOOP_SAMPLES;
  let random = 0x1234abcd;
  let low = 0;
  let lower = 0;

  for (let localSample = 0; localSample < LOOP_SAMPLES; localSample += 1) {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    const noise = ((random >>> 0) / 0xffffffff) * 2 - 1;
    low += (noise - low) * 0.018;
    lower += (low - lower) * 0.0017;
    const texture = (low - lower) * 0.0042;
    const breath = 0.62 + Math.sin((TAU * localSample) / (SAMPLE_RATE * 12)) * 0.2;
    const sample = cycleOffset + localSample;
    left[sample] += texture * breath;
    right[sample] += texture * (1.04 - breath * 0.15);
  }
}

// A compact feedback-delay network adds a soft room around the synthetic voices.
const delayA = Math.round(SAMPLE_RATE * 0.293);
const delayB = Math.round(SAMPLE_RATE * 0.421);
const delayC = Math.round(SAMPLE_RATE * 0.617);
for (let sample = delayC; sample < WORK_SAMPLES; sample += 1) {
  const wetLeft =
    left[sample - delayA] * 0.12 +
    right[sample - delayB] * 0.095 +
    left[sample - delayC] * 0.06;
  const wetRight =
    right[sample - delayA] * 0.12 +
    left[sample - delayB] * 0.095 +
    right[sample - delayC] * 0.06;
  left[sample] += wetLeft;
  right[sample] += wetRight;
}

// Keep the final, warmed-up cycle. The score itself is exactly periodic.
const sourceOffset = LOOP_SAMPLES * (WARMUP_CYCLES - 1);
const outputLeft = new Float32Array(LOOP_SAMPLES);
const outputRight = new Float32Array(LOOP_SAMPLES);
let peak = 0;
for (let sample = 0; sample < LOOP_SAMPLES; sample += 1) {
  const l = Math.tanh(left[sourceOffset + sample] * 1.32);
  const r = Math.tanh(right[sourceOffset + sample] * 1.32);
  outputLeft[sample] = l;
  outputRight[sample] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}

const targetPeak = 0.58;
const normalizer = peak > 0 ? targetPeak / peak : 1;
for (let sample = 0; sample < LOOP_SAMPLES; sample += 1) {
  outputLeft[sample] *= normalizer;
  outputRight[sample] *= normalizer;
}

// Match the final sample to the first through a transparent 80 ms correction.
const seamSamples = Math.round(SAMPLE_RATE * 0.08);
for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
  const channel = channelIndex === 0 ? outputLeft : outputRight;
  const delta = channel[0] - channel[LOOP_SAMPLES - 1];
  for (let index = 0; index < seamSamples; index += 1) {
    const t = smoothstep(index / (seamSamples - 1));
    channel[LOOP_SAMPLES - seamSamples + index] += delta * t;
  }
}

const bytesPerSample = 2;
const channels = 2;
const dataSize = LOOP_SAMPLES * channels * bytesPerSample;
const wav = Buffer.allocUnsafe(44 + dataSize);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(channels, 22);
wav.writeUInt32LE(SAMPLE_RATE, 24);
wav.writeUInt32LE(SAMPLE_RATE * channels * bytesPerSample, 28);
wav.writeUInt16LE(channels * bytesPerSample, 32);
wav.writeUInt16LE(bytesPerSample * 8, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataSize, 40);

let byteOffset = 44;
for (let sample = 0; sample < LOOP_SAMPLES; sample += 1) {
  wav.writeInt16LE(Math.round(clamp(outputLeft[sample], -1, 1) * 32767), byteOffset);
  wav.writeInt16LE(
    Math.round(clamp(outputRight[sample], -1, 1) * 32767),
    byteOffset + 2,
  );
  byteOffset += 4;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, wav);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      title: "Velvet Threshold",
      bpm: BPM,
      bars: BARS,
      durationSeconds: LOOP_SECONDS,
      sampleRate: SAMPLE_RATE,
      peakBeforeNormalization: Number(peak.toFixed(6)),
      chordCycle: chords.map((chord) => chord.name),
    },
    null,
    2,
  ),
);
