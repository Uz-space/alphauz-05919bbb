/**
 * Granular pitch shifter built from plain Web Audio nodes ("Jungle" technique).
 * Changes pitch without changing playback speed.
 */

const DELAY_TIME = 0.1;
const FADE_TIME = 0.05;
const BUFFER_TIME = 0.1;

function createFadeBuffer(ctx: AudioContext, activeTime: number, fadeTime: number): AudioBuffer {
  const length1 = activeTime * ctx.sampleRate;
  const length2 = (activeTime - 2 * fadeTime) * ctx.sampleRate;
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const p = buffer.getChannelData(0);

  const fadeLength = fadeTime * ctx.sampleRate;
  const fadeIndex1 = fadeLength;
  const fadeIndex2 = length1 - fadeLength;

  for (let i = 0; i < length1; ++i) {
    let value: number;
    if (i < fadeIndex1) value = Math.sqrt(i / fadeLength);
    else if (i >= fadeIndex2) value = Math.sqrt(1 - (i - fadeIndex2) / fadeLength);
    else value = 1;
    p[i] = value;
  }
  for (let i = length1; i < length; ++i) p[i] = 0;

  return buffer;
}

function createDelayTimeBuffer(
  ctx: AudioContext,
  activeTime: number,
  fadeTime: number,
  shiftUp: boolean,
): AudioBuffer {
  const length1 = activeTime * ctx.sampleRate;
  const length2 = (activeTime - 2 * fadeTime) * ctx.sampleRate;
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const p = buffer.getChannelData(0);

  for (let i = 0; i < length1; ++i) {
    p[i] = shiftUp ? (length1 - i) / length : i / length1;
  }
  for (let i = length1; i < length; ++i) p[i] = 0;

  return buffer;
}

export type PitchShifter = {
  input: GainNode;
  output: GainNode;
  /** semitone offset, e.g. -12 .. 12 */
  setPitch: (semitones: number) => void;
  disconnect: () => void;
};

export function createPitchShifter(ctx: AudioContext): PitchShifter {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const modGain1 = ctx.createGain();
  const modGain2 = ctx.createGain();

  const mod1 = ctx.createBufferSource();
  const mod2 = ctx.createBufferSource();
  const mod3 = ctx.createBufferSource();
  const mod4 = ctx.createBufferSource();

  const shiftDownBuffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, false);
  const shiftUpBuffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, true);
  const fadeBuffer = createFadeBuffer(ctx, BUFFER_TIME, FADE_TIME);

  mod1.buffer = shiftDownBuffer;
  mod2.buffer = shiftDownBuffer;
  mod3.buffer = fadeBuffer;
  mod4.buffer = fadeBuffer;
  mod1.loop = true;
  mod2.loop = true;
  mod3.loop = true;
  mod4.loop = true;

  const delay1 = ctx.createDelay();
  const delay2 = ctx.createDelay();
  const fade1 = ctx.createGain();
  const fade2 = ctx.createGain();
  const mix1 = ctx.createGain();
  const mix2 = ctx.createGain();
  mix1.gain.value = 0;
  mix2.gain.value = 0;

  mod1.connect(modGain1);
  mod2.connect(modGain2);
  modGain1.connect(delay1.delayTime);
  modGain2.connect(delay2.delayTime);

  mod3.connect(mix1.gain);
  mod4.connect(mix2.gain);

  input.connect(delay1);
  input.connect(delay2);
  delay1.connect(mix1);
  delay2.connect(mix2);
  mix1.connect(fade1);
  mix2.connect(fade2);
  fade1.connect(output);
  fade2.connect(output);

  const t = ctx.currentTime + 0.05;
  const t2 = t + BUFFER_TIME - FADE_TIME;
  mod1.start(t);
  mod2.start(t2);
  mod3.start(t);
  mod4.start(t2);

  const setPitch = (semitones: number) => {
    const ratio = Math.pow(2, semitones / 12) - 1;
    if (ratio > 0) {
      mod1.buffer = shiftUpBuffer;
      mod2.buffer = shiftUpBuffer;
    } else {
      mod1.buffer = shiftDownBuffer;
      mod2.buffer = shiftDownBuffer;
    }
    const amount = Math.abs(ratio) * DELAY_TIME;
    modGain1.gain.setTargetAtTime(amount, ctx.currentTime, 0.01);
    modGain2.gain.setTargetAtTime(amount, ctx.currentTime, 0.01);
  };

  setPitch(0);

  return {
    input,
    output,
    setPitch,
    disconnect: () => {
      try {
        mod1.stop();
        mod2.stop();
        mod3.stop();
        mod4.stop();
      } catch {
        /* noop */
      }
      input.disconnect();
      output.disconnect();
    },
  };
}
