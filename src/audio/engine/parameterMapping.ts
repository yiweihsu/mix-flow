import type { TrackParameters } from "@/state/mix/types";

type ParameterMapping = {
  affects: string[];
  description: string;
};

// Conceptual mapping only. These describe intent, not concrete DSP nodes.
export const trackParameterMapping: Record<keyof TrackParameters, ParameterMapping> = {
  volume: {
    affects: ["trackGain", "loudnessTaper"],
    description: "Scales track level with a smooth taper near silence.",
  },
  pan: {
    affects: ["stereoBalance", "equalPowerPan"],
    description: "Positions audio in the stereo field using equal-power panning.",
  },
  brightness: {
    affects: ["spectralTilt", "highShelfGain", "lowShelfTrim"],
    description: "Shifts tonal balance toward brighter or darker energy.",
  },
  punch: {
    affects: ["transientEmphasis", "lowMidImpact", "dynamicLift"],
    description: "Increases perceived impact by enhancing transients and weight.",
  },
  presence: {
    affects: ["upperMidFocus", "clarityEmphasis", "maskingControl"],
    description: "Brings the track forward with added clarity and focus.",
  },
  space: {
    affects: ["spaceSendLevel", "distanceRollOff", "earlyReflectionBalance"],
    description: "Sends more of the track to the shared space and pushes it back.",
  },
};
