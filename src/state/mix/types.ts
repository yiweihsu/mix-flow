export type TrackParameters = {
  /** Normalized (0 -> 1). Default 0.6. Controls perceived loudness. */
  volume: number;
  /** Normalized (-1 -> 1). Default 0. Centers at 0, left/right at extremes. */
  pan: number;
  /** Normalized (0 -> 1). Default 0.5. Controls overall light/dark tone. */
  brightness: number;
  /** Normalized (0 -> 1). Default 0.5. Controls impact and transient weight. */
  punch: number;
  /** Normalized (0 -> 1). Default 0.5. Controls forwardness and clarity. */
  presence: number;
  /** Normalized (0 -> 1). Default 0. Controls distance in shared space. */
  space: number;
};

export type TrackState = TrackParameters & {
  fileName?: string;
  hasAudio: boolean;
  isDemo: boolean;
  muted: boolean;
};

export type MasterState = Pick<TrackParameters, "volume" | "pan" | "punch" | "brightness">;

export type MixState = {
  tracks: TrackState[];
  master: MasterState;
};

export type MixPatchOp = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};
