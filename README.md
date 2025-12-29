# Vocal Playground

Vocal Playground is a single-track, real-time sound-design playground for voice.
It loads a demo vocal file on boot and gives you 10 macro controls to shape the
sound like an instrument.

## Concept

- One voice input → one processing chain → output.
- Play, pause, resume without resetting DSP state.
- Macro sliders control multiple DSP parameters under the hood.
- Export renders the processed voice as a single file.

## Golden Presets

Golden Presets represent curated starting points that demonstrate the intended
musical character of Vocal Playground. They are not final mixes; use them as a
foundation and adjust to fit the voice and track.

## MVP Notes

- No accounts.
- No timeline or clips.
- No multi-track features.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` and load the demo project.
