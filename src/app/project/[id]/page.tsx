"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine/AudioEngine";
import type { MacroParameters } from "@/state/mix/types";
import { CHARACTER_PRESETS, DEFAULT_CHARACTER_PRESET } from "@/state/mix/presets";

type SliderDefinition = {
  key: keyof MacroParameters;
  label: string;
};

const DEMO_VOICE_URL = "/demo-audio/demo-voice.mp3";

const DEFAULT_PARAMS: MacroParameters = DEFAULT_CHARACTER_PRESET.params;
const DEFAULT_OUTPUT_VOLUME = DEFAULT_CHARACTER_PRESET.masterOutput;

const SLIDERS: SliderDefinition[] = [
  { key: "noiseClean", label: "Noise Clean" },
  { key: "roomControl", label: "Room Control" },
  { key: "drive", label: "Drive" },
  { key: "punch", label: "Punch" },
  { key: "body", label: "Body" },
  { key: "presence", label: "Presence" },
  { key: "air", label: "Air" },
  { key: "space", label: "Space" },
  { key: "width", label: "Width" },
  { key: "motion", label: "Motion" },
  { key: "density", label: "Density" },
  { key: "character", label: "Character" },
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

export default function ProjectPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const engineRef = useRef<AudioEngine | null>(null);
  const [paramsState, setParamsState] = useState<MacroParameters>(DEFAULT_PARAMS);
  const [outputVolume, setOutputVolume] = useState(DEFAULT_OUTPUT_VOLUME);
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_CHARACTER_PRESET.id);
  const [isReady, setIsReady] = useState(false);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("No audio");
  const rafRef = useRef<number | null>(null);

  const sourceStatus = isLoadingSource ? "Loading..." : sourceLabel;

  const sliderRows = useMemo(
    () => SLIDERS.map((slider) => ({ ...slider, value: paramsState[slider.key] })),
    [paramsState],
  );

  useEffect(() => {
    const engine = new AudioEngine();
    engine.init();
    engine.update(paramsState, DEFAULT_OUTPUT_VOLUME);
    engineRef.current = engine;

    return () => {
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
      engineRef.current?.update(next, outputVolume);
      return next;
    });
  };

  const updateOutputVolume = (value: number) => {
    setOutputVolume(value);
    engineRef.current?.update(paramsState, value);
  };

  const applyPreset = (presetId: string) => {
    const preset = CHARACTER_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    const nextParams = { ...preset.params };
    const nextOutput = preset.masterOutput;
    setSelectedPresetId(preset.id);
    setParamsState(nextParams);
    setOutputVolume(nextOutput);
    engineRef.current?.update(nextParams, nextOutput);
  };

  const loadBuffer = (buffer: AudioBuffer, label: string) => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    engine.stop();
    engine.setBuffer(buffer);
    setDuration(buffer.duration);
    setIsReady(true);
    setIsPlaying(false);
    setPlaybackTime(0);
    setSourceLabel(label);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    setIsLoadingSource(true);
    try {
      const data = await file.arrayBuffer();
      const buffer = await engine.decodeAudioData(data);
      loadBuffer(buffer, file.name);
    } catch (error) {
      console.error("Failed to load uploaded audio", error);
    } finally {
      setIsLoadingSource(false);
      event.target.value = "";
    }
  };

  const handleLoadDemo = async () => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    setIsLoadingSource(true);
    try {
      const buffer = await engine.fetchAudioBuffer(DEMO_VOICE_URL);
      loadBuffer(buffer, "Demo voice");
    } catch (error) {
      console.error("Failed to load demo voice", error);
    } finally {
      setIsLoadingSource(false);
    }
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
      const rendered = await engine.renderOffline(paramsState, outputVolume);
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
            <h1>Vocal Playground</h1>
          </div>
          <div className="console-meta">
            <div>
              <span className="meta-label">Session</span>
              <span className="meta-value">{id}</span>
            </div>
            <div>
              <span className="meta-label">Source</span>
              <span className="meta-value">{sourceStatus}</span>
            </div>
          </div>
        </header>

        <div className="top-bar">
          <div className="top-bar-left">
            <label className="button upload-button" htmlFor="audio-upload">
              Upload audio
            </label>
            <input
              id="audio-upload"
              className="upload-input"
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              disabled={isLoadingSource}
            />
            <button
              className="button secondary"
              type="button"
              onClick={handleLoadDemo}
              disabled={isLoadingSource}
            >
              Load demo
            </button>
          </div>
          <div className="top-bar-center">
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
          <div className="top-bar-right">
            <span className="playback-time-box">
              <span className="playback-time">
                {formatTime(playbackTime)} / {formatTime(duration)}
              </span>
            </span>
          </div>
        </div>

        <div className="preset-bar">
          <span className="preset-label">Presets</span>
          <div className="preset-pills">
            {CHARACTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`preset-pill${selectedPresetId === preset.id ? " active" : ""}`}
                type="button"
                onClick={() => applyPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="output-panel">
          <div className="output-header">
            <div>
              <span className="output-label">Output</span>
            </div>
            <span className="output-value">{outputVolume.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={outputVolume}
            onChange={(event) => updateOutputVolume(Number(event.target.value))}
          />
        </div>

        <div className="slider-grid">
          {sliderRows.map((slider) => (
            <div className="macro-slider" key={slider.key}>
              <div className="macro-header">
                <div>
                  <span className="macro-label">{slider.label}</span>
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
