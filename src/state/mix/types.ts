export type MacroParameters = {
  /** Normalized (0 -> 1). Controls background noise cleanup. */
  noiseClean: number;
  /** Normalized (0 -> 1). Controls perceived room reduction. */
  roomControl: number;
  /** Normalized (0 -> 1). Controls saturation/harmonic energy. */
  drive: number;
  /** Normalized (0 -> 1). Controls transient emphasis and attack shaping. */
  punch: number;
  /** Normalized (0 -> 1). Controls low-mid weight and thickness. */
  body: number;
  /** Normalized (0 -> 1). Controls intelligibility and mid focus. */
  presence: number;
  /** Normalized (0 -> 1). Controls high-frequency openness. */
  air: number;
  /** Normalized (0 -> 1). Controls reverb amount. */
  space: number;
  /** Normalized (0 -> 1). Controls stereo spread. */
  width: number;
  /** Normalized (0 -> 1). Controls subtle modulation and movement. */
  motion: number;
  /** Normalized (0 -> 1). Controls compression and glue. */
  density: number;
  /** Normalized (0 -> 1). Controls macro tone tilt/attitude. */
  character: number;
};

export type MixState = {
  params: MacroParameters;
  outputVolume: number;
};

export type MixPatchOp = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};
