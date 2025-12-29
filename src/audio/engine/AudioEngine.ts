import type { MixState, TrackState } from "@/state/mix/types";

type TrackNodes = {
  brightness: BiquadFilterNode;
  presence: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  gain: GainNode;
  pan: StereoPannerNode;
  reverbSend: GainNode;
  reverbFilter: BiquadFilterNode;
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  enabled: boolean;
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterPan: StereoPannerNode | null = null;
  private reverb: ConvolverNode | null = null;
  private tracks: TrackNodes[] = [];
  private playing = false;
  private activeSources = 0;

  private createImpulseResponse(context: AudioContext) {
    const duration = 1.2;
    const decay = 2.2;
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

  private mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
    const clamped = Math.min(inMax, Math.max(inMin, value));
    const normalized = (clamped - inMin) / (inMax - inMin);
    return outMin + normalized * (outMax - outMin);
  }

  init(tracks: TrackState[]) {
    if (this.context) {
      return;
    }

    const context = new AudioContext();
    const masterGain = context.createGain();
    const masterCompressor = context.createDynamicsCompressor();
    const masterPan = context.createStereoPanner();
    const reverb = context.createConvolver();
    reverb.buffer = this.createImpulseResponse(context);

    masterCompressor.threshold.value = -18;
    masterCompressor.ratio.value = 2;
    masterCompressor.attack.value = 0.03;
    masterCompressor.release.value = 0.25;
    masterCompressor.knee.value = 12;

    // Gentle bus glue: cohesion over loudness.
    masterGain.connect(masterCompressor);
    masterCompressor.connect(masterPan);
    masterPan.connect(context.destination);
    reverb.connect(masterGain);

    this.context = context;
    this.masterGain = masterGain;
    this.masterCompressor = masterCompressor;
    this.masterPan = masterPan;
    this.reverb = reverb;
    this.tracks = tracks.map((track) => {
      const brightness = context.createBiquadFilter();
      brightness.type = "highshelf";
      brightness.frequency.value = 4000;

      const presence = context.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 2500;
      presence.Q.value = 1.2;

      const compressor = context.createDynamicsCompressor();
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;

      const gain = context.createGain();
      const pan = context.createStereoPanner();
      const reverbSend = context.createGain();
      reverbSend.gain.value = 0;
      const reverbFilter = context.createBiquadFilter();
      reverbFilter.type = "lowpass";
      reverbFilter.frequency.value = 6000;

      brightness.connect(presence);
      presence.connect(compressor);
      compressor.connect(gain);
      gain.connect(pan);
      // Reverb send is pre-pan so space reads as a true shared environment.
      gain.connect(reverbSend);
      pan.connect(masterGain);
      reverbSend.connect(reverbFilter);
      reverbFilter.connect(reverb);

      return {
        brightness,
        presence,
        compressor,
        gain,
        pan,
        reverbSend,
        reverbFilter,
        source: null,
        buffer: null,
        enabled: track.hasAudio,
      };
    });
  }

  get isPlaying() {
    return this.playing;
  }

  decodeAudioData(data: ArrayBuffer) {
    if (!this.context) {
      throw new Error("Audio engine not initialized.");
    }

    return this.context.decodeAudioData(data);
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

  setTrackBuffer(index: number, buffer: AudioBuffer | null) {
    const track = this.tracks[index];
    if (!track) {
      return;
    }

    track.buffer = buffer;
  }

  play() {
    if (!this.context || this.playing) {
      return;
    }

    if (this.context.state === "suspended") {
      void this.context.resume();
    }

    const startTime = this.context.currentTime + 0.01;
    this.activeSources = 0;
    this.tracks.forEach((track) => {
      if (!track.buffer || !track.enabled) {
        track.source = null;
        return;
      }

      const source = this.context?.createBufferSource();
      if (!source) {
        return;
      }

      source.buffer = track.buffer;
      source.onended = () => {
        this.activeSources = Math.max(0, this.activeSources - 1);
        if (this.activeSources === 0 && this.playing) {
          this.playing = false;
          if (this.context?.state === "running") {
            void this.context.suspend();
          }
        }
      };
      source.connect(track.brightness);
      track.source = source;
      source.start(startTime);
      this.activeSources += 1;
    });

    if (this.activeSources > 0) {
      this.playing = true;
    }
  }

  stop() {
    if (!this.context || !this.playing) {
      return;
    }

    this.tracks.forEach((track) => {
      if (!track.source) {
        return;
      }

      track.source.onended = null;
      try {
        track.source.stop();
      } catch {
        // Ignore sources that already stopped.
      }
      track.source.disconnect();
      track.source = null;
    });

    if (this.context.state === "running") {
      void this.context.suspend();
    }

    this.playing = false;
    this.activeSources = 0;
  }

  update(mixState: MixState) {
    if (!this.context || !this.masterGain || !this.masterCompressor || !this.masterPan) {
      return;
    }

    this.masterGain.gain.value = mixState.master.volume;
    this.masterPan.pan.value = mixState.master.pan;

    mixState.tracks.forEach((track, index) => {
      const nodes = this.tracks[index];
      if (!nodes) {
        return;
      }

      // brightness -> high-shelf EQ gain (-12 dB to +12 dB)
      nodes.brightness.gain.value = this.mapRange(track.brightness, 0, 1, -12, 12);
      // presence -> peaking EQ gain (-6 dB to +6 dB)
      nodes.presence.gain.value = this.mapRange(track.presence, 0, 1, -6, 6);
      // punch -> compressor threshold (-30 dB to -10 dB) + ratio (2 to 6)
      nodes.compressor.threshold.value = this.mapRange(track.punch, 0, 1, -30, -10);
      nodes.compressor.ratio.value = this.mapRange(track.punch, 0, 1, 2, 6);
      // volume -> track gain (exponential curve)
      nodes.gain.gain.value = Math.pow(track.volume, 2);
      if (track.muted) {
        nodes.gain.gain.value = 0;
      }
      // pan -> stereo panner (-1 to 1)
      nodes.pan.pan.value = track.pan;
      // space -> reverb send amount (0 to 1), mapped aggressively for MVP clarity.
      const clampedSpace = Math.min(1, Math.max(0, track.space));
      nodes.reverbSend.gain.value = track.hasAudio ? clampedSpace ** 2 * 0.8 : 0;
      nodes.enabled = track.hasAudio;
    });
  }

  dispose() {
    this.stop();
    this.tracks.forEach((track) => {
      track.brightness.disconnect();
      track.presence.disconnect();
      track.compressor.disconnect();
      track.gain.disconnect();
      track.pan.disconnect();
      track.reverbSend.disconnect();
      track.reverbFilter.disconnect();
    });

    this.tracks = [];

    if (this.masterGain) {
      this.masterGain.disconnect();
    }

    if (this.masterCompressor) {
      this.masterCompressor.disconnect();
    }

    if (this.masterPan) {
      this.masterPan.disconnect();
    }

    if (this.reverb) {
      this.reverb.disconnect();
    }

    if (this.context) {
      this.context.close();
    }

    this.context = null;
    this.masterGain = null;
    this.masterCompressor = null;
    this.masterPan = null;
    this.reverb = null;
    this.playing = false;
    this.activeSources = 0;
  }
}
