import type { MacroParameters } from "@/state/mix/types";

type VocalCleanupParameters = {
  noiseClean?: number;
  roomControl?: number;
};

type EngineParameters = MacroParameters & VocalCleanupParameters;

type ProcessingChain = {
  inputGain: GainNode;
  noiseHighPass: BiquadFilterNode;
  noiseExpander: DynamicsCompressorNode;
  roomEq: BiquadFilterNode;
  drive: WaveShaperNode;
  body: BiquadFilterNode;
  presence: BiquadFilterNode;
  air: BiquadFilterNode;
  characterLow: BiquadFilterNode;
  characterHigh: BiquadFilterNode;
  punchCompressor: DynamicsCompressorNode;
  densityCompressor: DynamicsCompressorNode;
  widthLeftGain: GainNode;
  widthRightGain: GainNode;
  widthLeftDelay: DelayNode;
  widthRightDelay: DelayNode;
  widthMerger: ChannelMergerNode;
  motionPanner: StereoPannerNode;
  motionLfo: OscillatorNode;
  motionDepth: GainNode;
  reverbSend: GainNode;
  reverbFilter: BiquadFilterNode;
  reverb: ConvolverNode;
  reverbReturn: GainNode;
  outputGain: GainNode;
  masterGain: GainNode;
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private chain: ProcessingChain | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private playing = false;
  private startTime = 0;
  private pauseOffset = 0;
  private outputVolume = 0.8;

  private createImpulseResponse(context: BaseAudioContext) {
    const duration = 1.6;
    const decay = 2.4;
    const sampleRate = context.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }

    return impulse;
  }

  private createDriveCurve(amount: number) {
    const samples = 1024;
    const curve = new Float32Array(samples);
    const k = 1 + amount * 24;
    for (let i = 0; i < samples; i += 1) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  private mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
    const clamped = Math.min(inMax, Math.max(inMin, value));
    const normalized = (clamped - inMin) / (inMax - inMin);
    return outMin + normalized * (outMax - outMin);
  }

  private applySmoothing(param: AudioParam, value: number, timeConstant = 0.04) {
    const context = this.context;
    if (!context) {
      param.value = value;
      return;
    }
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, timeConstant);
  }

  private buildChain(context: BaseAudioContext) {
    const inputGain = context.createGain();
    const noiseHighPass = context.createBiquadFilter();
    noiseHighPass.type = "highpass";
    noiseHighPass.frequency.value = 100;

    const noiseExpander = context.createDynamicsCompressor();
    noiseExpander.attack.value = 0.005;
    noiseExpander.release.value = 0.18;
    noiseExpander.knee.value = 12;

    const roomEq = context.createBiquadFilter();
    roomEq.type = "peaking";
    roomEq.frequency.value = 300;
    roomEq.Q.value = 1.1;

    const drive = context.createWaveShaper();
    drive.oversample = "4x";

    const body = context.createBiquadFilter();
    body.type = "lowshelf";
    body.frequency.value = 180;

    const presence = context.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2400;
    presence.Q.value = 1.1;

    const air = context.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 7200;

    const characterLow = context.createBiquadFilter();
    characterLow.type = "lowshelf";
    characterLow.frequency.value = 220;

    const characterHigh = context.createBiquadFilter();
    characterHigh.type = "highshelf";
    characterHigh.frequency.value = 5800;

    const punchCompressor = context.createDynamicsCompressor();
    const densityCompressor = context.createDynamicsCompressor();

    const widthLeftGain = context.createGain();
    const widthRightGain = context.createGain();
    const widthLeftDelay = context.createDelay(0.03);
    const widthRightDelay = context.createDelay(0.03);
    const widthMerger = context.createChannelMerger(2);

    const motionPanner = context.createStereoPanner();
    const motionLfo = context.createOscillator();
    motionLfo.type = "sine";
    const motionDepth = context.createGain();
    motionDepth.gain.value = 0;
    motionLfo.connect(motionDepth);
    motionDepth.connect(motionPanner.pan);
    motionLfo.start();

    const reverbSend = context.createGain();
    const reverbFilter = context.createBiquadFilter();
    reverbFilter.type = "lowpass";
    reverbFilter.frequency.value = 6500;
    const reverb = context.createConvolver();
    reverb.buffer = this.createImpulseResponse(context);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 0.7;

    const outputGain = context.createGain();
    outputGain.gain.value = 0.85;
    const masterGain = context.createGain();
    masterGain.gain.value = this.outputVolume;

    inputGain.connect(noiseHighPass);
    noiseHighPass.connect(noiseExpander);
    noiseExpander.connect(roomEq);
    roomEq.connect(drive);
    drive.connect(body);
    body.connect(presence);
    presence.connect(air);
    air.connect(characterLow);
    characterLow.connect(characterHigh);
    characterHigh.connect(punchCompressor);
    punchCompressor.connect(densityCompressor);

    densityCompressor.connect(widthLeftGain);
    densityCompressor.connect(widthRightGain);
    widthLeftGain.connect(widthLeftDelay);
    widthRightGain.connect(widthRightDelay);
    widthLeftDelay.connect(widthMerger, 0, 0);
    widthRightDelay.connect(widthMerger, 0, 1);
    widthMerger.connect(motionPanner);
    motionPanner.connect(outputGain);

    densityCompressor.connect(reverbSend);
    reverbSend.connect(reverbFilter);
    reverbFilter.connect(reverb);
    reverb.connect(reverbReturn);
    reverbReturn.connect(outputGain);

    outputGain.connect(masterGain);
    masterGain.connect(context.destination);

    return {
      inputGain,
      noiseHighPass,
      noiseExpander,
      roomEq,
      drive,
      body,
      presence,
      air,
      characterLow,
      characterHigh,
      punchCompressor,
      densityCompressor,
      widthLeftGain,
      widthRightGain,
      widthLeftDelay,
      widthRightDelay,
      widthMerger,
      motionPanner,
      motionLfo,
      motionDepth,
      reverbSend,
      reverbFilter,
      reverb,
      reverbReturn,
      outputGain,
      masterGain,
    } satisfies ProcessingChain;
  }

  init() {
    if (this.context) {
      return;
    }

    const context = new AudioContext();
    this.context = context;
    this.chain = this.buildChain(context);
  }

  get isPlaying() {
    return this.playing;
  }

  getDuration() {
    return this.buffer?.duration ?? 0;
  }

  getCurrentTime() {
    if (!this.context) {
      return 0;
    }
    if (!this.playing) {
      return this.pauseOffset;
    }
    return this.pauseOffset + (this.context.currentTime - this.startTime);
  }

  async fetchAudioBuffer(url: string) {
    if (!this.context) {
      throw new Error("Audio engine not initialized.");
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load audio: ${response.statusText}`);
    }

    const data = await response.arrayBuffer();
    return this.context.decodeAudioData(data);
  }

  async decodeAudioData(data: ArrayBuffer) {
    if (!this.context) {
      throw new Error("Audio engine not initialized.");
    }

    return this.context.decodeAudioData(data);
  }

  setBuffer(buffer: AudioBuffer | null) {
    this.buffer = buffer;
    this.pauseOffset = 0;
  }

  play() {
    if (!this.context || !this.chain || !this.buffer || this.playing) {
      return;
    }

    if (this.context.state === "suspended") {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.chain.inputGain);
    let offset = Math.min(this.pauseOffset, this.buffer.duration);
    if (offset >= this.buffer.duration) {
      offset = 0;
      this.pauseOffset = 0;
    }
    const startAt = this.context.currentTime + 0.02;
    this.startTime = startAt;
    source.onended = () => {
      if (!this.playing) {
        return;
      }
      this.playing = false;
      this.pauseOffset = 0;
      this.source = null;
    };
    source.start(startAt, offset);
    this.source = source;
    this.playing = true;
  }

  pause() {
    if (!this.context || !this.playing) {
      return;
    }

    const elapsed = this.context.currentTime - this.startTime;
    this.pauseOffset = Math.min(this.getDuration(), this.pauseOffset + elapsed);
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // Ignore sources that already stopped.
      }
      this.source.disconnect();
      this.source = null;
    }
    this.playing = false;
  }

  stop() {
    this.pauseOffset = 0;
    if (!this.context || !this.playing) {
      return;
    }
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // Ignore sources that already stopped.
      }
      this.source.disconnect();
      this.source = null;
    }
    this.playing = false;
  }

  update(params: EngineParameters, outputVolume: number = this.outputVolume) {
    if (!this.context || !this.chain) {
      return;
    }

    const noiseClean = params.noiseClean ?? 0;
    const roomControl = params.roomControl ?? 0;

    this.outputVolume = outputVolume;
    const timeConstant = 0.05;

    this.applySmoothing(
      this.chain.noiseHighPass.frequency,
      this.mapRange(noiseClean, 0, 1, 80, 150),
      timeConstant,
    );
    this.applySmoothing(
      this.chain.noiseExpander.threshold,
      this.mapRange(noiseClean, 0, 1, -55, -35),
      timeConstant,
    );
    this.applySmoothing(
      this.chain.noiseExpander.ratio,
      this.mapRange(noiseClean, 0, 1, 1.5, 3),
      timeConstant,
    );
    this.applySmoothing(
      this.chain.roomEq.gain,
      this.mapRange(roomControl, 0, 1, 0, -6),
      timeConstant,
    );

    this.chain.drive.curve = this.createDriveCurve(params.drive);

    this.chain.punchCompressor.threshold.value = this.mapRange(params.punch, 0, 1, -22, -10);
    this.chain.punchCompressor.ratio.value = this.mapRange(params.punch, 0, 1, 2, 6);
    this.chain.punchCompressor.attack.value = this.mapRange(params.punch, 0, 1, 0.004, 0.02);
    this.chain.punchCompressor.release.value = this.mapRange(params.punch, 0, 1, 0.12, 0.2);

    this.chain.densityCompressor.threshold.value = this.mapRange(params.density, 0, 1, -18, -6);
    this.chain.densityCompressor.ratio.value = this.mapRange(params.density, 0, 1, 1.6, 4.5);
    this.chain.densityCompressor.attack.value = this.mapRange(params.density, 0, 1, 0.01, 0.06);
    this.chain.densityCompressor.release.value = this.mapRange(params.density, 0, 1, 0.2, 0.4);

    this.applySmoothing(
      this.chain.body.gain,
      this.mapRange(params.body, 0, 1, -4, 6),
      timeConstant,
    );
    this.applySmoothing(
      this.chain.presence.gain,
      this.mapRange(params.presence, 0, 1, -3, 4),
      timeConstant,
    );
    this.applySmoothing(
      this.chain.air.gain,
      this.mapRange(params.air, 0, 1, -6, 6),
      timeConstant,
    );

    const tilt = this.mapRange(params.character, 0, 1, -1, 1);
    this.applySmoothing(this.chain.characterLow.gain, -tilt * 5, timeConstant);
    this.applySmoothing(this.chain.characterHigh.gain, tilt * 5, timeConstant);

    const baseReverbSend = Math.pow(Math.min(1, Math.max(0, params.space)), 2) * 0.65;
    const roomDamp = this.mapRange(roomControl, 0, 1, 1, 0.8);
    this.applySmoothing(this.chain.reverbSend.gain, baseReverbSend * roomDamp, timeConstant);

    this.applySmoothing(
      this.chain.widthLeftDelay.delayTime,
      this.mapRange(params.width, 0, 1, 0, 0.006),
      timeConstant,
    );
    this.applySmoothing(
      this.chain.widthRightDelay.delayTime,
      this.mapRange(params.width, 0, 1, 0, 0.02),
      timeConstant,
    );

    this.applySmoothing(
      this.chain.motionDepth.gain,
      this.mapRange(params.motion, 0, 1, 0, 0.3),
      timeConstant,
    );
    this.chain.motionLfo.frequency.value = this.mapRange(params.motion, 0, 1, 0.05, 0.35);

    this.applySmoothing(this.chain.masterGain.gain, outputVolume, timeConstant);
  }

  async renderOffline(params: EngineParameters, outputVolume: number = this.outputVolume) {
    if (!this.buffer) {
      throw new Error("No audio buffer loaded.");
    }

    const length = this.buffer.length;
    const offline = new OfflineAudioContext(
      this.buffer.numberOfChannels,
      length,
      this.buffer.sampleRate,
    );
    const chain = this.buildChain(offline);

    const source = offline.createBufferSource();
    source.buffer = this.buffer;
    source.connect(chain.inputGain);

    const noiseClean = params.noiseClean ?? 0;
    const roomControl = params.roomControl ?? 0;

    chain.noiseHighPass.frequency.value = this.mapRange(noiseClean, 0, 1, 80, 150);
    chain.noiseExpander.threshold.value = this.mapRange(noiseClean, 0, 1, -55, -35);
    chain.noiseExpander.ratio.value = this.mapRange(noiseClean, 0, 1, 1.5, 3);
    chain.roomEq.gain.value = this.mapRange(roomControl, 0, 1, 0, -6);

    chain.drive.curve = this.createDriveCurve(params.drive);

    chain.punchCompressor.threshold.value = this.mapRange(params.punch, 0, 1, -22, -10);
    chain.punchCompressor.ratio.value = this.mapRange(params.punch, 0, 1, 2, 6);
    chain.punchCompressor.attack.value = this.mapRange(params.punch, 0, 1, 0.004, 0.02);
    chain.punchCompressor.release.value = this.mapRange(params.punch, 0, 1, 0.12, 0.2);

    chain.densityCompressor.threshold.value = this.mapRange(params.density, 0, 1, -18, -6);
    chain.densityCompressor.ratio.value = this.mapRange(params.density, 0, 1, 1.6, 4.5);
    chain.densityCompressor.attack.value = this.mapRange(params.density, 0, 1, 0.01, 0.06);
    chain.densityCompressor.release.value = this.mapRange(params.density, 0, 1, 0.2, 0.4);

    chain.body.gain.value = this.mapRange(params.body, 0, 1, -4, 6);
    chain.presence.gain.value = this.mapRange(params.presence, 0, 1, -3, 4);
    chain.air.gain.value = this.mapRange(params.air, 0, 1, -6, 6);

    const tilt = this.mapRange(params.character, 0, 1, -1, 1);
    chain.characterLow.gain.value = -tilt * 5;
    chain.characterHigh.gain.value = tilt * 5;

    const baseReverbSend = Math.pow(Math.min(1, Math.max(0, params.space)), 2) * 0.65;
    const roomDamp = this.mapRange(roomControl, 0, 1, 1, 0.8);
    chain.reverbSend.gain.value = baseReverbSend * roomDamp;

    chain.widthLeftDelay.delayTime.value = this.mapRange(params.width, 0, 1, 0, 0.006);
    chain.widthRightDelay.delayTime.value = this.mapRange(params.width, 0, 1, 0, 0.02);

    chain.motionDepth.gain.value = this.mapRange(params.motion, 0, 1, 0, 0.3);
    chain.motionLfo.frequency.value = this.mapRange(params.motion, 0, 1, 0.05, 0.35);
    chain.masterGain.gain.value = outputVolume;

    source.start(0);
    return offline.startRendering();
  }

  dispose() {
    this.stop();
    if (this.chain) {
      this.chain.motionLfo.stop();
      this.chain.inputGain.disconnect();
      this.chain.noiseHighPass.disconnect();
      this.chain.noiseExpander.disconnect();
      this.chain.roomEq.disconnect();
      this.chain.drive.disconnect();
      this.chain.body.disconnect();
      this.chain.presence.disconnect();
      this.chain.air.disconnect();
      this.chain.characterLow.disconnect();
      this.chain.characterHigh.disconnect();
      this.chain.punchCompressor.disconnect();
      this.chain.densityCompressor.disconnect();
      this.chain.widthLeftGain.disconnect();
      this.chain.widthRightGain.disconnect();
      this.chain.widthLeftDelay.disconnect();
      this.chain.widthRightDelay.disconnect();
      this.chain.widthMerger.disconnect();
      this.chain.motionPanner.disconnect();
      this.chain.motionDepth.disconnect();
      this.chain.reverbSend.disconnect();
      this.chain.reverbFilter.disconnect();
      this.chain.reverb.disconnect();
      this.chain.reverbReturn.disconnect();
      this.chain.outputGain.disconnect();
      this.chain.masterGain.disconnect();
    }

    if (this.context) {
      this.context.close();
    }

    this.context = null;
    this.chain = null;
    this.buffer = null;
    this.source = null;
    this.playing = false;
    this.pauseOffset = 0;
  }
}
