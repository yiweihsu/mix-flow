import type { MixState, TrackState } from "@/state/mix/types";

type TrackNodes = {
  oscillator: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterPan: StereoPannerNode | null = null;
  private tracks: TrackNodes[] = [];

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
    this.tracks = tracks.map((_, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = 220 + index * 110;

      const gain = context.createGain();
      const pan = context.createStereoPanner();

      oscillator.connect(gain);
      gain.connect(pan);
      pan.connect(masterGain);

      oscillator.start();

      return { oscillator, gain, pan };
    });
  }

  resume() {
    if (this.context && this.context.state === "suspended") {
      this.context.resume();
    }
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

      nodes.gain.gain.value = track.volume;
      nodes.pan.pan.value = track.pan;
    });
  }

  dispose() {
    this.tracks.forEach((track) => {
      track.oscillator.stop();
      track.oscillator.disconnect();
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
  }
}
