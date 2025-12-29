export type TrackState = {
  volume: number;
  pan: number;
  punch: number;
  brightness: number;
  fileName?: string;
  hasAudio: boolean;
};

export type MasterState = {
  volume: number;
  pan: number;
  punch: number;
  brightness: number;
};

export type MixState = {
  tracks: TrackState[];
  master: MasterState;
};

export type MixPatchOp = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};
