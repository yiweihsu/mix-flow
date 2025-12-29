import type { MacroParameters } from "./types";

type GoldenPreset = {
  name: string;
  description: string;
  params: MacroParameters;
  masterOutput: number;
};

export const GOLDEN_PRESETS: GoldenPreset[] = [
  {
    name: "Intimate Pop Vocal",
    description: "Close, warm, and controlled with forward clarity.",
    params: {
      drive: 0.08,
      punch: 0.35,
      body: 0.6,
      presence: 0.62,
      air: 0.5,
      space: 0.12,
      width: 0.22,
      motion: 0.15,
      density: 0.55,
      character: 0.55,
    },
    masterOutput: 0.82,
  },
  {
    name: "Thick Rap Lead",
    description: "Dense, loud, and upfront with strong body and glue.",
    params: {
      drive: 0.18,
      punch: 0.5,
      body: 0.76,
      presence: 0.46,
      air: 0.3,
      space: 0.08,
      width: 0.18,
      motion: 0.1,
      density: 0.78,
      character: 0.45,
    },
    masterOutput: 0.78,
  },
  {
    name: "Dreamy Indie",
    description: "Soft transients with wide space and airy lift.",
    params: {
      drive: 0.06,
      punch: 0.25,
      body: 0.46,
      presence: 0.48,
      air: 0.72,
      space: 0.55,
      width: 0.66,
      motion: 0.35,
      density: 0.42,
      character: 0.6,
    },
    masterOutput: 0.8,
  },
  {
    name: "Radio Ready",
    description: "Balanced, modern, and clean with safe output headroom.",
    params: {
      drive: 0.1,
      punch: 0.5,
      body: 0.56,
      presence: 0.56,
      air: 0.54,
      space: 0.24,
      width: 0.35,
      motion: 0.2,
      density: 0.55,
      character: 0.5,
    },
    masterOutput: 0.76,
  },
  {
    name: "Whisper Close-Mic",
    description: "Very intimate and dry with high presence and air.",
    params: {
      drive: 0.02,
      punch: 0.15,
      body: 0.35,
      presence: 0.7,
      air: 0.78,
      space: 0.04,
      width: 0.05,
      motion: 0.05,
      density: 0.3,
      character: 0.62,
    },
    masterOutput: 0.8,
  },
  {
    name: "Lo-Fi Character",
    description: "Obvious tone shaping with reduced air and lively motion.",
    params: {
      drive: 0.22,
      punch: 0.35,
      body: 0.6,
      presence: 0.4,
      air: 0.22,
      space: 0.2,
      width: 0.3,
      motion: 0.5,
      density: 0.5,
      character: 0.3,
    },
    masterOutput: 0.78,
  },
];

export const DEFAULT_PRESET = GOLDEN_PRESETS[0];
