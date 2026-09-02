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

  const downGain1 = ctx.createGain();
  const downGain2 = ctx.createGain();
  const upGain1 = ctx.createGain();
  const upGain2 = ctx.createGain();

  const downMod1 = ctx.createBufferSource();
  const downMod2 = ctx.createBufferSource();
  const upMod1 = ctx.createBufferSource();
  const upMod2 = ctx.createBufferSource();
  const fadeMod1 = ctx.createBufferSource();
  const fadeMod2 = ctx.createBufferSource();

  const shiftDownBuffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, false);
  const shiftUpBuffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, true);
  const fadeBuffer = createFadeBuffer(ctx, BUFFER_TIME, FADE_TIME);

  downMod1.buffer = shiftDownBuffer;
  downMod2.buffer = shiftDownBuffer;
  upMod1.buffer = shiftUpBuffer;
  upMod2.buffer = shiftUpBuffer;
  fadeMod1.buffer = fadeBuffer;
  fadeMod2.buffer = fadeBuffer;
  downMod1.loop = true;
  downMod2.loop = true;
  upMod1.loop = true;
  upMod2.loop = true;
  fadeMod1.loop = true;
  fadeMod2.loop = true;

  const delay1 = ctx.createDelay();
  const delay2 = ctx.createDelay();
  const fade1 = ctx.createGain();
  const fade2 = ctx.createGain();
  const mix1 = ctx.createGain();
  const mix2 = ctx.createGain();
  mix1.gain.value = 0;
  mix2.gain.value = 0;

  downGain1.gain.value = 0;
  downGain2.gain.value = 0;
  upGain1.gain.value = 0;
  upGain2.gain.value = 0;
  downMod1.connect(downGain1);
  downMod2.connect(downGain2);
  upMod1.connect(upGain1);
  upMod2.connect(upGain2);
  downGain1.connect(delay1.delayTime);
  downGain2.connect(delay2.delayTime);
  upGain1.connect(delay1.delayTime);
  upGain2.connect(delay2.delayTime);

  fadeMod1.connect(mix1.gain);
  fadeMod2.connect(mix2.gain);

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1;
  wet.gain.value = 0;
  input.connect(dry);
  dry.connect(output);

  input.connect(delay1);
  input.connect(delay2);
  delay1.connect(mix1);
  delay2.connect(mix2);
  mix1.connect(fade1);
  mix2.connect(fade2);
  fade1.connect(wet);
  fade2.connect(wet);
  wet.connect(output);

  const t = ctx.currentTime + 0.05;
  const t2 = t + BUFFER_TIME - FADE_TIME;
  downMod1.start(t);
  downMod2.start(t2);
  upMod1.start(t);
  upMod2.start(t2);
  fadeMod1.start(t);
  fadeMod2.start(t2);

  const setPitch = (semitones: number) => {
    const now = ctx.currentTime;
    const bypass = Math.abs(semitones) < 0.01;
    dry.gain.setTargetAtTime(bypass ? 1 : 0, now, 0.02);
    wet.gain.setTargetAtTime(bypass ? 0 : 1, now, 0.02);
    const ratio = Math.pow(2, semitones / 12) - 1;
    const amount = Math.min(DELAY_TIME, Math.abs(ratio) * DELAY_TIME);
    const downAmount = ratio < 0 ? amount : 0;
    const upAmount = ratio > 0 ? amount : 0;
    downGain1.gain.setTargetAtTime(downAmount, now, 0.01);
    downGain2.gain.setTargetAtTime(downAmount, now, 0.01);
    upGain1.gain.setTargetAtTime(upAmount, now, 0.01);
    upGain2.gain.setTargetAtTime(upAmount, now, 0.01);
  };

  setPitch(0);

  return {
    input,
    output,
    setPitch,
    disconnect: () => {
      try {
        downMod1.stop();
        downMod2.stop();
        upMod1.stop();
        upMod2.stop();
        fadeMod1.stop();
        fadeMod2.stop();
      } catch {
        /* noop */
      }
      input.disconnect();
      output.disconnect();
    },
  };
}
