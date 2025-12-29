export type TrackState = {
  volume: number;
  pan: number;
  punch: number;
  brightness: number;
};

export type MixState = {
  tracks: TrackState[];
  master: TrackState;
};

export type MixPatchOp = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};
