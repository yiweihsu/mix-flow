"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine/AudioEngine";
import { appendCommit, createHistoryState, getVisibleCommits, redo, undo } from "@/state/history/historyStore";
import type { Commit } from "@/state/history/types";
import { applyPatch } from "@/state/mix/reducer";
import type { MasterState, MixPatchOp, MixState, TrackState } from "@/state/mix/types";

type DemoAsset = {
  fileName: string;
  url: string;
};

// Demo audio - for testing only.
const DEMO_ASSETS: DemoAsset[] = [
  { fileName: "demo-drums.mp3", url: "/demo-audio/demo-drums.mp3" },
  { fileName: "demo-bass.mp3", url: "/demo-audio/demo-bass.mp3" },
  { fileName: "demo-bed.mp3", url: "/demo-audio/demo-bed.mp3" },
  { fileName: "demo-voice.mp3", url: "/demo-audio/demo-voice.mp3" },
];

const createInitialMixState = (demoAssets?: DemoAsset[]): MixState => {
  const baseTracks = [
    {
      volume: 0.6,
      pan: -0.3,
      punch: 0.4,
      brightness: 0.5,
      presence: 0.5,
      space: 0,
    },
    {
      volume: 0.55,
      pan: 0.2,
      punch: 0.5,
      brightness: 0.6,
      presence: 0.5,
      space: 0,
    },
    {
      volume: 0.5,
      pan: -0.1,
      punch: 0.3,
      brightness: 0.4,
      presence: 0.5,
      space: 0,
    },
    {
      volume: 0.65,
      pan: 0.35,
      punch: 0.6,
      brightness: 0.7,
      presence: 0.5,
      space: 0,
    },
  ];

  return {
    tracks: baseTracks.map((track, index) => {
      const demoAsset = demoAssets?.[index];
      return {
        ...track,
        fileName: demoAsset?.fileName,
        hasAudio: Boolean(demoAsset),
        isDemo: Boolean(demoAsset),
      };
    }),
    master: { volume: 0.8, pan: 0, punch: 0.5, brightness: 0.5 },
  };
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const buildAiPatch = (text: string, mixState: MixState): MixPatchOp[] => {
  const normalized = text.toLowerCase();
  const targetIndex =
    mixState.tracks.length === 0
      ? 0
      : Math.abs([...normalized].reduce((acc, char) => acc + char.charCodeAt(0), 0)) %
        mixState.tracks.length;

  const patch: MixPatchOp[] = [];
  const volumeDelta = /quiet|lower|soft/.test(normalized)
    ? -0.08
    : /loud|boost|push/.test(normalized)
      ? 0.08
      : 0.04;

  const targetPath = /master/.test(normalized) ? "master" : `tracks/${targetIndex}`;

  patch.push({
    op: "replace",
    path: `/${targetPath}/volume`,
    value: clamp(
      (targetPath === "master"
        ? mixState.master.volume
        : mixState.tracks[targetIndex]?.volume ?? 0.5) + volumeDelta,
      0,
      1,
    ),
  });

  if (/left/.test(normalized)) {
    patch.push({
      op: "replace",
      path: `/${targetPath}/pan`,
      value: clamp(-0.7, -1, 1),
    });
  } else if (/right/.test(normalized)) {
    patch.push({
      op: "replace",
      path: `/${targetPath}/pan`,
      value: clamp(0.7, -1, 1),
    });
  }

  if (/bright/.test(normalized)) {
    patch.push({
      op: "replace",
      path: `/${targetPath}/brightness`,
      value: clamp(
        (targetPath === "master"
          ? mixState.master.brightness
          : mixState.tracks[targetIndex]?.brightness ?? 0.5) + 0.1,
        0,
        1,
      ),
    });
  }

  if (/punch/.test(normalized)) {
    patch.push({
      op: "replace",
      path: `/${targetPath}/punch`,
      value: clamp(
        (targetPath === "master"
          ? mixState.master.punch
          : mixState.tracks[targetIndex]?.punch ?? 0.5) + 0.1,
        0,
        1,
      ),
    });
  }

  return patch;
};

const formatValue = (value: number) => value.toFixed(2);

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isDemoProject = id === "demo";
  const initialMixState = useMemo(
    () => createInitialMixState(isDemoProject ? DEMO_ASSETS : undefined),
    [isDemoProject],
  );
  const [mixState, setMixState] = useState<MixState>(initialMixState);
  const [historyState, setHistoryState] = useState(createHistoryState());
  const [prompt, setPrompt] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const mixStateRef = useRef(mixState);
  const canUndo = historyState.cursor >= 0;
  const canRedo = historyState.cursor < historyState.commits.length - 1;
  const hasPlayableAudio = mixState.tracks.some((track) => track.hasAudio);

  useEffect(() => {
    const engine = new AudioEngine();
    engine.init(initialMixState.tracks);
    engine.update(initialMixState);
    engineRef.current = engine;
    setIsPlaying(false);

    return () => engine.dispose();
  }, [initialMixState]);

  useEffect(() => {
    mixStateRef.current = mixState;
  }, [mixState]);

  useEffect(() => {
    if (!isDemoProject) {
      return;
    }

    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    let cancelled = false;

    const loadDemoAudio = async () => {
      await Promise.all(
        DEMO_ASSETS.map(async (asset, index) => {
          try {
            const buffer = await engine.fetchAudioBuffer(asset.url);
            if (cancelled || !mixStateRef.current.tracks[index]?.isDemo) {
              return;
            }
            engine.setTrackBuffer(index, buffer);
          } catch (error) {
            console.error(`Failed to load demo audio (${asset.fileName})`, error);
          }
        }),
      );
    };

    void loadDemoAudio();

    return () => {
      cancelled = true;
    };
  }, [isDemoProject]);

  useEffect(() => {
    engineRef.current?.update(mixState);
  }, [mixState]);

  const commits = getVisibleCommits(historyState);

  const commit = (author: Commit["author"], message: string, diff: MixPatchOp[]) => {
    const newCommit: Commit = {
      id: crypto.randomUUID(),
      author,
      message,
      diff,
      timestamp: Date.now(),
    };

    setHistoryState((prev) => appendCommit(prev, newCommit));
  };

  const applyPatchWithCommit = (author: Commit["author"], message: string, diff: MixPatchOp[]) => {
    setMixState((prev) => applyPatch(prev, diff));
    commit(author, message, diff);
  };

  const handleTrackChange = (
    trackIndex: number,
    key: keyof TrackState,
    value: number,
    author: Commit["author"],
  ) => {
    const diff: MixPatchOp[] = [
      {
        op: "replace",
        path: `/tracks/${trackIndex}/${key}`,
        value,
      },
    ];

    applyPatchWithCommit(author, `Set track ${trackIndex + 1} ${key}`, diff);
  };

  const handleMasterChange = (key: keyof MasterState, value: number) => {
    const diff: MixPatchOp[] = [
      {
        op: "replace",
        path: `/master/${key}`,
        value,
      },
    ];

    applyPatchWithCommit("user", `Set master ${key}`, diff);
  };

  const handleAiSubmit = () => {
    if (!prompt.trim()) {
      return;
    }

    const diff = buildAiPatch(prompt, mixState);
    applyPatchWithCommit("ai", `AI: ${prompt.trim()}`, diff);
    setPrompt("");
  };

  const handleAudioUpload = async (trackIndex: number, file: File | null) => {
    if (!file) {
      return;
    }

    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = await engine.decodeAudioData(arrayBuffer);
    engine.setTrackBuffer(trackIndex, buffer);

    const diff: MixPatchOp[] = [
      { op: "replace", path: `/tracks/${trackIndex}/fileName`, value: file.name },
      { op: "replace", path: `/tracks/${trackIndex}/hasAudio`, value: true },
      { op: "replace", path: `/tracks/${trackIndex}/isDemo`, value: false },
    ];

    applyPatchWithCommit("user", `Load audio into Track ${trackIndex + 1}`, diff);
  };

  const handlePlay = () => {
    engineRef.current?.play();
    setIsPlaying(engineRef.current?.isPlaying ?? false);
  };

  const handleStop = () => {
    engineRef.current?.stop();
    setIsPlaying(false);
  };

  const handleUndo = () => {
    const nextHistory = undo(historyState);
    setHistoryState(nextHistory);
    setMixState(
      getVisibleCommits(nextHistory).reduce(
        (state, entry) => applyPatch(state, entry.diff),
        initialMixState,
      ),
    );
  };

  const handleRedo = () => {
    const nextHistory = redo(historyState);
    setHistoryState(nextHistory);
    setMixState(
      getVisibleCommits(nextHistory).reduce(
        (state, entry) => applyPatch(state, entry.diff),
        initialMixState,
      ),
    );
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextPlaying = engineRef.current?.isPlaying ?? false;
      setIsPlaying((prev) => (prev === nextPlaying ? prev : nextPlaying));
    }, 200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="app-shell">
      <section className="card">
        <div className="track-header">
          <div>
            <div className="section-title">Project</div>
            <div className="track-name">mixstate / {id}</div>
          </div>
          <div className="transport-controls">
            <button className="button" type="button" onClick={handlePlay} disabled={!hasPlayableAudio || isPlaying}>
              Play
            </button>{" "}
            <button className="button secondary" type="button" onClick={handleStop} disabled={!isPlaying}>
              Stop
            </button>{" "}
            <button className="button secondary" type="button" onClick={handleUndo} disabled={!canUndo}>
              Undo
            </button>{" "}
            <button className="button secondary" type="button" onClick={handleRedo} disabled={!canRedo}>
              Redo
            </button>
          </div>
        </div>

        <div className="section-title">Tracks</div>
        {mixState.tracks.map((track, index) => (
          <div className="track" key={`track-${index}`}>
            <div className="track-header">
              <span className="track-name">Track {index + 1}</span>
              <span className="value-pill">vol {formatValue(track.volume)}</span>
            </div>
            <div className="track-upload">
              <label htmlFor={`track-${index}-upload`}>Upload audio</label>
              <input
                id={`track-${index}-upload`}
                type="file"
                accept="audio/*"
                onChange={(event) =>
                  handleAudioUpload(index, event.target.files?.[0] ?? null)
                }
              />
              <span className="file-name">{track.fileName ?? "No file loaded"}</span>
            </div>

            {([
              ["volume", 0, 1, 0.01],
              ["pan", -1, 1, 0.01],
              ["punch", 0, 1, 0.01],
              ["brightness", 0, 1, 0.01],
              ["presence", 0, 1, 0.01],
            ] as const).map(([key, min, max, step]) => (
              <div className="slider-row" key={`${index}-${key}`}>
                <label htmlFor={`track-${index}-${key}`}>
                  {key === "presence" ? "PRESENCE" : key}
                </label>
                <input
                  id={`track-${index}-${key}`}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={track[key]}
                  disabled={!track.hasAudio}
                  onChange={(event) =>
                    handleTrackChange(
                      index,
                      key,
                      Number(event.target.value),
                      "user",
                    )
                  }
                />
                <span className="value-pill">{formatValue(track[key])}</span>
              </div>
            ))}
          </div>
        ))}

        <div className="section-title">Master</div>
        <div className="track">
          {([
            ["volume", 0, 1, 0.01],
            ["pan", -1, 1, 0.01],
            ["punch", 0, 1, 0.01],
            ["brightness", 0, 1, 0.01],
          ] as const).map(([key, min, max, step]) => (
            <div className="slider-row" key={`master-${key}`}>
              <label htmlFor={`master-${key}`}>{key}</label>
              <input
                id={`master-${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={mixState.master[key]}
                onChange={(event) => handleMasterChange(key, Number(event.target.value))}
              />
              <span className="value-pill">{formatValue(mixState.master[key])}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card ai-panel">
        <div className="section-title">AI chat</div>
        <textarea
          placeholder="Try: 'make track 2 brighter and a bit louder'"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button className="button" type="button" onClick={handleAiSubmit}>
          Apply AI patch
        </button>

        <div className="section-title" style={{ marginTop: "20px" }}>
          Commit history
        </div>
        <div className="commit-list">
          {commits.length === 0 && (
            <div className="commit-item">No commits yet. Move a slider!</div>
          )}
          {commits
            .slice()
            .reverse()
            .map((entry) => (
              <div className="commit-item" key={entry.id}>
                <div className="commit-meta">
                  <span>{entry.author}</span>
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div>{entry.message}</div>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}
