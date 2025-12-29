"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine/AudioEngine";
import type { MacroParameters } from "@/state/mix/types";

type SliderDefinition = {
  key: keyof MacroParameters;
  label: string;
  description: string;
};

const DEMO_VOICE_URL = "/demo-audio/demo-voice.mp3";

const DEFAULT_PARAMS: MacroParameters = {
  drive: 0.01,
  punch: 0.45,
  body: 0.5,
  presence: 0.5,
  air: 0.45,
  space: 0.3,
  width: 0.4,
  motion: 0.25,
  density: 0.5,
  character: 0.5,
};

const SLIDERS: SliderDefinition[] = [
  { key: "drive", label: "Drive", description: "Harmonic energy + saturation." },
  { key: "punch", label: "Punch", description: "Transient emphasis + attack." },
  { key: "body", label: "Body", description: "Low-mid weight + thickness." },
  { key: "presence", label: "Presence", description: "Intelligibility + focus." },
  { key: "air", label: "Air", description: "High-frequency openness." },
  { key: "space", label: "Space", description: "Reverb amount + depth." },
  { key: "width", label: "Width", description: "Stereo spread simulation." },
  { key: "motion", label: "Motion", description: "Subtle modulation + life." },
  { key: "density", label: "Density", description: "Compression + glue feel." },
  { key: "character", label: "Character", description: "Tone tilt + attitude." },
];

const formatTime = (value: number) => {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  const ms = Math.floor((value % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    ms,
  ).padStart(2, "0")}`;
};

const encodeWav = (buffer: AudioBuffer) => {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = buffer.getChannelData(channel)[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const engineRef = useRef<AudioEngine | null>(null);
  const [paramsState, setParamsState] = useState<MacroParameters>(DEFAULT_PARAMS);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const rafRef = useRef<number | null>(null);

  const sliderRows = useMemo(
    () => SLIDERS.map((slider) => ({ ...slider, value: paramsState[slider.key] })),
    [paramsState],
  );

  useEffect(() => {
    const engine = new AudioEngine();
    engine.init();
    engine.update(paramsState);
    engineRef.current = engine;

    let cancelled = false;
    const loadDemo = async () => {
      try {
        const buffer = await engine.fetchAudioBuffer(DEMO_VOICE_URL);
        if (cancelled) {
          return;
        }
        engine.setBuffer(buffer);
        setDuration(buffer.duration);
        setIsReady(true);
      } catch (error) {
        console.error("Failed to load demo voice", error);
      }
    };

    void loadDemo();

    return () => {
      cancelled = true;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const engine = engineRef.current;
      if (engine) {
        setIsPlaying(engine.isPlaying);
        setPlaybackTime(engine.getCurrentTime());
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const updateParam = (key: keyof MacroParameters, value: number) => {
    setParamsState((prev) => {
      const next = { ...prev, [key]: value };
      engineRef.current?.update(next);
      return next;
    });
  };

  const handleTransportToggle = () => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    if (engine.isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
    setIsPlaying(engine.isPlaying);
  };

  const handleExport = async () => {
    const engine = engineRef.current;
    if (!engine || !isReady) {
      return;
    }
    setIsExporting(true);
    try {
      const rendered = await engine.renderOffline(paramsState);
      const blob = encodeWav(rendered);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `voice-playground-${id}.wav`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="playground">
      <section className="console">
        <header className="console-header">
          <div>
            <p className="console-kicker">Single-track voice instrument</p>
            <h1>Vocal Playground</h1>
            <p className="console-subtitle">
              One voice, one chain. Shape it live.
            </p>
          </div>
          <div className="console-meta">
            <div>
              <span className="meta-label">Session</span>
              <span className="meta-value">{id}</span>
            </div>
            <div>
              <span className="meta-label">Playback</span>
              <span className="meta-value playback-time">
                {formatTime(playbackTime)} / {formatTime(duration)}
              </span>
            </div>
            <div>
              <span className="meta-label">Source</span>
              <span className="meta-value">Demo voice loaded</span>
            </div>
          </div>
        </header>

        <div className="transport-bar">
          <button
            className="button"
            type="button"
            onClick={handleTransportToggle}
            disabled={!isReady}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={handleExport}
            disabled={!isReady || isExporting}
          >
            {isExporting ? "Rendering..." : "Export Rendered Audio"}
          </button>
        </div>

        <div className="slider-grid">
          {sliderRows.map((slider) => (
            <div className="macro-slider" key={slider.key}>
              <div className="macro-header">
                <div>
                  <span className="macro-label">{slider.label}</span>
                  <span className="macro-description">{slider.description}</span>
                </div>
                <span className="macro-value">{slider.value.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={slider.value}
                onChange={(event) =>
                  updateParam(slider.key, Number(event.target.value))
                }
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
