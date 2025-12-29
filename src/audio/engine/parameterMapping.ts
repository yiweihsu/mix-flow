import type { MacroParameters } from "@/state/mix/types";

type ParameterMapping = {
  affects: string[];
  description: string;
};

// Conceptual mapping only. These describe intent, not concrete DSP nodes.
export const trackParameterMapping: Record<keyof MacroParameters, ParameterMapping> = {
  noiseClean: {
    affects: ["noiseFloor", "rumbleControl", "cleanupGate"],
    description: "Cleans up background noise without over-drying the vocal.",
  },
  roomControl: {
    affects: ["roomTone", "dryness", "proximityFeel"],
    description: "Makes the vocal feel closer and less roomy.",
  },
  drive: {
    affects: ["saturationCurve", "harmonicDensity", "softClipAmount"],
    description: "Adds harmonic energy and excitement with controlled saturation.",
  },
  punch: {
    affects: ["transientShaper", "attackWindow", "impactFocus"],
    description: "Accentuates attack and front-edge punch without hard clipping.",
  },
  body: {
    affects: ["lowMidShelf", "thickness", "weightContour"],
    description: "Builds low-mid weight and vocal thickness.",
  },
  presence: {
    affects: ["midFocus", "intelligibility", "maskControl"],
    description: "Pushes clarity and brings the voice forward.",
  },
  air: {
    affects: ["highShelf", "openness", "sparkleContour"],
    description: "Opens up the top end for breath and air.",
  },
  space: {
    affects: ["reverbSend", "distance", "depthField"],
    description: "Adds a shared space around the voice.",
  },
  width: {
    affects: ["stereoSpread", "microDelay", "sideEnergy"],
    description: "Simulates stereo width even from mono input.",
  },
  motion: {
    affects: ["modDepth", "movementRate", "subtleDrift"],
    description: "Adds gentle modulation to keep the tone alive.",
  },
  density: {
    affects: ["glueCompression", "sustainLift", "dynamicContour"],
    description: "Increases cohesion and perceived loudness.",
  },
  character: {
    affects: ["toneTilt", "attitude", "edgeBalance"],
    description: "Tilts the overall tone from dark to bright/aggressive.",
  },
};
