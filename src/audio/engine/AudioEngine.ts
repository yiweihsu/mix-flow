import type { MixState, TrackState } from "@/state/mix/types";

type TrackNodes = {
  gain: GainNode;
  pan: StereoPannerNode;
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  enabled: boolean;
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterPan: StereoPannerNode | null = null;
  private tracks: TrackNodes[] = [];
  private playing = false;
  private activeSources = 0;

  init(tracks: TrackState[]) {
    if (this.context) {
      return;
    }

    const context = new AudioContext();
    const masterGain = context.createGain();
    const masterPan = context.createStereoPanner();

    masterGain.connect(masterPan);
    masterPan.connect(context.destination);

    this.context = context;
    this.masterGain = masterGain;
    this.masterPan = masterPan;
    this.tracks = tracks.map((track) => {
      const gain = context.createGain();
      const pan = context.createStereoPanner();

      gain.connect(pan);
      pan.connect(masterGain);

      return {
        gain,
        pan,
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
      source.connect(track.gain);
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
    if (!this.context || !this.masterGain || !this.masterPan) {
      return;
    }

    this.masterGain.gain.value = mixState.master.volume;
    this.masterPan.pan.value = mixState.master.pan;

    mixState.tracks.forEach((track, index) => {
      const nodes = this.tracks[index];
      if (!nodes) {
        return;
      }

      // volume -> track gain
      nodes.gain.gain.value = track.volume;
      // pan -> stereo panner
      nodes.pan.pan.value = track.pan;
      // brightness -> spectral tilt (not implemented yet)
      // punch -> transient emphasis (not implemented yet)
      // presence -> upper-mid focus / forwardness (not implemented yet)
      // space -> shared space send (not implemented yet)
      nodes.enabled = track.hasAudio;
    });
  }

  dispose() {
    this.stop();
    this.tracks.forEach((track) => {
      track.gain.disconnect();
      track.pan.disconnect();
    });

    this.tracks = [];

    if (this.masterGain) {
      this.masterGain.disconnect();
    }

    if (this.masterPan) {
      this.masterPan.disconnect();
    }

    if (this.context) {
      this.context.close();
    }

    this.context = null;
    this.masterGain = null;
    this.masterPan = null;
    this.playing = false;
    this.activeSources = 0;
  }
}
