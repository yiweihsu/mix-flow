"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine/AudioEngine";
import {
  appendCommit,
  buildSliderCommitMessage,
  createHistoryState,
  getVisibleCommits,
  redo,
  undo,
} from "@/state/history/historyStore";
import type { Commit } from "@/state/history/types";
import { applyPatch } from "@/state/mix/reducer";
import type { MasterState, MixPatchOp, MixState, TrackState } from "@/state/mix/types";
import { createPreviewState, updatePreviewFrame, type PreviewState } from "@/state/preview/types";

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
const PREVIEW_FPS = 30;
const PREVIEW_TIMELINE_BASE_SECONDS = 30;

const createInitialMixState = (demoAssets?: DemoAsset[]): MixState => {
  const baseTracks = [
    {
      volume: 0.6,
      pan: -0.3,
      punch: 0.4,
      brightness: 0.5,
      presence: 0.5,
      space: 0,
      startOffset: 0,
    },
    {
      volume: 0.55,
      pan: 0.2,
      punch: 0.5,
      brightness: 0.6,
      presence: 0.5,
      space: 0,
      startOffset: 0,
    },
    {
      volume: 0.5,
      pan: -0.1,
      punch: 0.3,
      brightness: 0.4,
      presence: 0.5,
      space: 0,
      startOffset: 0,
    },
    {
      volume: 0.65,
      pan: 0.35,
      punch: 0.6,
      brightness: 0.7,
      presence: 0.5,
      space: 0,
      startOffset: 0,
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
        muted: false,
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
const formatSeconds = (value: number) => `${value.toFixed(1)}s`;
const formatPreviewTime = (value: number) => {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isDemoProject = id === "demo";
  const initialMixState = useMemo(
    () => createInitialMixState(isDemoProject ? DEMO_ASSETS : undefined),
    [isDemoProject],
  );
  const [mixState, setMixState] = useState<MixState>(initialMixState);
  const [trackDurations, setTrackDurations] = useState<number[]>(
    () => initialMixState.tracks.map(() => 0),
  );
  const [historyState, setHistoryState] = useState(createHistoryState());
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<PreviewState>(() => createPreviewState(PREVIEW_FPS));
  const engineRef = useRef<AudioEngine | null>(null);
  const mixStateRef = useRef(mixState);
  const sliderDragStartRef = useRef<Record<string, number>>({});
  const previewStartFrameRef = useRef(0);
  const previewStartTimestampRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasAnnouncedPreviewRef = useRef(false);
  const canUndo = historyState.cursor >= 0;
  const canRedo = historyState.cursor < historyState.commits.length - 1;
  const canPlayPreview = preview.fps > 0;
  const projectDuration = useMemo(() => {
    return mixState.tracks.reduce((maxDuration, track, index) => {
      if (!track.hasAudio) {
        return maxDuration;
      }
      const clipDuration = trackDurations[index] ?? 0;
      if (clipDuration <= 0) {
        return maxDuration;
      }
      const endTime = track.startOffset + clipDuration;
      return Math.max(maxDuration, endTime);
    }, 0);
  }, [mixState.tracks, trackDurations]);

  useEffect(() => {
    const engine = new AudioEngine();
    engine.init(initialMixState.tracks);
    engine.update(initialMixState);
    engineRef.current = engine;
    setPreview((prev) => updatePreviewFrame(prev, 0, false));

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
            setTrackDurations((prev) => {
              const next = [...prev];
              next[index] = buffer.duration;
              return next;
            });
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

  const commit = (
    author: Commit["author"],
    message: string,
    diff: MixPatchOp[],
    meta?: Commit["meta"],
  ) => {
    const newCommit: Commit = {
      id: crypto.randomUUID(),
      author,
      message,
      diff,
      timestamp: Date.now(),
      meta,
    };

    setHistoryState((prev) => appendCommit(prev, newCommit));
  };

  const applyPatchWithCommit = (author: Commit["author"], message: string, diff: MixPatchOp[]) => {
    setMixState((prev) => applyPatch(prev, diff));
    commit(author, message, diff);
  };

  const applyPatchWithoutCommit = (diff: MixPatchOp[]) => {
    setMixState((prev) => applyPatch(prev, diff));
  };

  const beginSliderDrag = (key: string, value: number) => {
    sliderDragStartRef.current[key] = value;
  };

  const endSliderDrag = (
    key: string,
    author: Commit["author"],
    targetLabel: string,
    paramLabel: string,
    path: string,
    to: number,
  ) => {
    const from = sliderDragStartRef.current[key];
    delete sliderDragStartRef.current[key];

    if (from === undefined || from === to) {
      return;
    }

    commit(
      author,
      buildSliderCommitMessage(targetLabel, paramLabel, from, to),
      [
        {
          op: "replace",
          path,
          value: to,
        },
      ],
      {
        intent: "slider-adjust",
        path,
        from,
        to,
        targetLabel,
        paramLabel,
      },
    );
  };

  const endStartOffsetDrag = (key: string, trackIndex: number, path: string, to: number) => {
    const from = sliderDragStartRef.current[key];
    delete sliderDragStartRef.current[key];

    if (from === undefined || from === to) {
      return;
    }

    commit(
      "user",
      `Move track ${trackIndex + 1} start (${formatSeconds(from)} → ${formatSeconds(to)})`,
      [
        {
          op: "replace",
          path,
          value: to,
        },
      ],
      {
        intent: "start-offset",
        path,
        from,
        to,
      },
    );
  };

  const handleTrackChange = (trackIndex: number, key: keyof TrackState, value: number) => {
    const diff: MixPatchOp[] = [
      {
        op: "replace",
        path: `/tracks/${trackIndex}/${key}`,
        value,
      },
    ];

    applyPatchWithoutCommit(diff);
  };

  const handleTrackMuteToggle = (trackIndex: number) => {
    const nextMuted = !mixState.tracks[trackIndex]?.muted;
    const diff: MixPatchOp[] = [
      {
        op: "replace",
        path: `/tracks/${trackIndex}/muted`,
        value: nextMuted,
      },
    ];

    applyPatchWithCommit(
      "user",
      `${nextMuted ? "Mute" : "Unmute"} track ${trackIndex + 1}`,
      diff,
    );
  };

  const handleMasterChange = (key: keyof MasterState, value: number) => {
    const diff: MixPatchOp[] = [
      {
        op: "replace",
        path: `/master/${key}`,
        value,
      },
    ];

    applyPatchWithoutCommit(diff);
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
    setTrackDurations((prev) => {
      const next = [...prev];
      next[trackIndex] = buffer.duration;
      return next;
    });

    const diff: MixPatchOp[] = [
      { op: "replace", path: `/tracks/${trackIndex}/fileName`, value: file.name },
      { op: "replace", path: `/tracks/${trackIndex}/hasAudio`, value: true },
      { op: "replace", path: `/tracks/${trackIndex}/isDemo`, value: false },
    ];

    applyPatchWithCommit("user", `Load audio into Track ${trackIndex + 1}`, diff);
  };

  const handlePreviewPlay = () => {
    if (!canPlayPreview || preview.is_playing) {
      return;
    }
    if (!hasAnnouncedPreviewRef.current) {
      console.log("[vfx] Preview is visual-only.");
      console.log("[vfx] Audio is preserved during render/export.");
      hasAnnouncedPreviewRef.current = true;
    }
    previewStartFrameRef.current = preview.frame_index;
    previewStartTimestampRef.current = performance.now();
    setPreview((prev) => updatePreviewFrame(prev, prev.frame_index, true));
  };

  const handlePreviewPause = () => {
    previewStartFrameRef.current = preview.frame_index;
    previewStartTimestampRef.current = null;
    setPreview((prev) => updatePreviewFrame(prev, prev.frame_index, false));
  };

  const handlePreviewStop = () => {
    previewStartFrameRef.current = 0;
    previewStartTimestampRef.current = null;
    setPreview((prev) => updatePreviewFrame(prev, 0, false));
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
    if (!preview.is_playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const startTimestamp = previewStartTimestampRef.current ?? performance.now();
      if (previewStartTimestampRef.current === null) {
        previewStartTimestampRef.current = startTimestamp;
      }
      const elapsed = (performance.now() - startTimestamp) / 1000;
      const nextFrameIndex = Math.max(
        0,
        Math.floor(previewStartFrameRef.current + elapsed * preview.fps),
      );
      setPreview((prev) => {
        if (!prev.is_playing) {
          return prev;
        }
        if (prev.frame_index === nextFrameIndex) {
          return prev;
        }
        return updatePreviewFrame(prev, nextFrameIndex, true);
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [preview.is_playing, preview.fps]);

  const visualTimelineSeconds = Math.max(
    PREVIEW_TIMELINE_BASE_SECONDS,
    preview.visual_time_seconds,
    projectDuration,
  );
  const playheadPercent =
    visualTimelineSeconds > 0
      ? clamp((preview.visual_time_seconds / visualTimelineSeconds) * 100, 0, 100)
      : 0;
  const timelineMarks = useMemo(() => {
    if (visualTimelineSeconds <= 0) {
      return [0];
    }
    const marks: number[] = [];
    const step = 5;
    for (let mark = 0; mark <= visualTimelineSeconds; mark += step) {
      marks.push(mark);
    }
    if (marks[marks.length - 1] !== visualTimelineSeconds) {
      marks.push(visualTimelineSeconds);
    }
    return marks;
  }, [visualTimelineSeconds]);

  return (
    <main className="app-shell">
      <section className="card">
        <div className="track-header">
          <div>
            <div className="section-title">Project</div>
            <div className="track-name">mixstate / {id}</div>
          </div>
          <div className="transport-controls">
            <button
              className="button"
              type="button"
              onClick={preview.is_playing ? handlePreviewPause : handlePreviewPlay}
              disabled={!canPlayPreview}
            >
              {preview.is_playing ? "Pause (visual)" : "Play (visual)"}
            </button>{" "}
            <button
              className="button secondary"
              type="button"
              onClick={handlePreviewStop}
              disabled={!preview.is_playing && preview.frame_index === 0}
            >
              Stop
            </button>{" "}
            <button className="button secondary" type="button" onClick={handleUndo} disabled={!canUndo}>
              Undo
            </button>{" "}
            <button className="button secondary" type="button" onClick={handleRedo} disabled={!canRedo}>
              Redo
            </button>
            <div className="transport-time">
              <span className="transport-time-label">Visual time</span>
              <span className="transport-time-value">
                {formatPreviewTime(preview.visual_time_seconds)}
              </span>
            </div>
          </div>
        </div>

        <div className="section-title">Preview</div>
        <div className="preview-window">
          <div className="preview-overlay">
            <span>PREVIEW MODE — Visual only</span>
            <span>Audio will be preserved on export</span>
          </div>
        </div>

        <div className="timeline">
          <div className="timeline-label">Visual timeline (preview)</div>
          <div className="timeline-ruler">
            {timelineMarks.map((mark) => (
              <div className="timeline-mark" key={`timeline-${mark}`}>
                {mark}s
              </div>
            ))}
          </div>
          <div className="timeline-tracks">
            {mixState.tracks.map((track, index) => {
              const clipDuration = trackDurations[index] ?? 0;
              const clipLeft =
                visualTimelineSeconds > 0
                  ? (track.startOffset / visualTimelineSeconds) * 100
                  : 0;
              const clipWidth =
                visualTimelineSeconds > 0
                  ? (clipDuration / visualTimelineSeconds) * 100
                  : 0;
              const showClip = track.hasAudio && clipDuration > 0 && visualTimelineSeconds > 0;

              return (
                <div className="timeline-track" key={`timeline-track-${index}`}>
                  <div className="timeline-track-label">Track {index + 1}</div>
                  <div className="timeline-track-lane">
                    {showClip ? (
                      <div
                        className="timeline-clip"
                        style={{ left: `${clipLeft}%`, width: `${clipWidth}%` }}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="timeline-playhead" style={{ left: `${playheadPercent}%` }} />
        </div>

        <div className="section-title">Tracks</div>
        {mixState.tracks.map((track, index) => (
          <div className="track" key={`track-${index}`}>
            <div className="track-header">
              <div className="track-title">
                <span className="track-name">Track {index + 1}</span>
                <button
                  className="button secondary mute-button"
                  type="button"
                  onClick={() => handleTrackMuteToggle(index)}
                  disabled={!track.hasAudio}
                >
                  {track.muted ? "Unmute" : "Mute"}
                </button>
              </div>
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
              <div className="file-meta">
                {track.isDemo && <span className="demo-badge">Demo audio loaded</span>}
                <span className="file-name">{track.fileName ?? "No file loaded"}</span>
              </div>
            </div>

            <div className="slider-row">
              <label htmlFor={`track-${index}-start`}>Start</label>
              <input
                id={`track-${index}-start`}
                type="range"
                min={0}
                max={30}
                step={0.1}
                value={track.startOffset}
                disabled={!track.hasAudio}
                onPointerDown={() => beginSliderDrag(`track-${index}-start`, track.startOffset)}
                onMouseDown={() => beginSliderDrag(`track-${index}-start`, track.startOffset)}
                onChange={(event) =>
                  handleTrackChange(
                    index,
                    "startOffset",
                    Number(event.target.value),
                  )
                }
                onPointerUp={(event) =>
                  endStartOffsetDrag(
                    `track-${index}-start`,
                    index,
                    `/tracks/${index}/startOffset`,
                    Number(event.currentTarget.value),
                  )
                }
                onMouseUp={(event) =>
                  endStartOffsetDrag(
                    `track-${index}-start`,
                    index,
                    `/tracks/${index}/startOffset`,
                    Number(event.currentTarget.value),
                  )
                }
              />
              <span className="value-pill">{formatSeconds(track.startOffset)}</span>
            </div>

            {([
              ["volume", 0, 1, 0.01],
              ["pan", -1, 1, 0.01],
              ["punch", 0, 1, 0.01],
              ["brightness", 0, 1, 0.01],
              ["presence", 0, 1, 0.01],
              ["space", 0, 1, 0.01],
            ] as const).map(([key, min, max, step]) => (
              <div key={`${index}-${key}`}>
                <div className="slider-row">
                  <label htmlFor={`track-${index}-${key}`}>
                    {key === "presence" ? "PRESENCE" : key === "space" ? "SPACE" : key}
                  </label>
                  <input
                    id={`track-${index}-${key}`}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={track[key]}
                    disabled={!track.hasAudio}
                    onPointerDown={() => beginSliderDrag(`track-${index}-${key}`, track[key])}
                    onMouseDown={() => beginSliderDrag(`track-${index}-${key}`, track[key])}
                    onChange={(event) =>
                      handleTrackChange(
                        index,
                        key,
                        Number(event.target.value),
                      )
                    }
                    onPointerUp={(event) =>
                      endSliderDrag(
                        `track-${index}-${key}`,
                        "user",
                        `track ${index + 1}`,
                        key,
                        `/tracks/${index}/${key}`,
                        Number(event.currentTarget.value),
                      )
                    }
                    onMouseUp={(event) =>
                      endSliderDrag(
                        `track-${index}-${key}`,
                        "user",
                        `track ${index + 1}`,
                        key,
                        `/tracks/${index}/${key}`,
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                  <span className="value-pill">{formatValue(track[key])}</span>
                </div>
                {key === "space" ? (
                  <div style={{ margin: "4px 0 10px", fontSize: "0.75rem", color: "var(--muted)" }}>
                    Controls distance / reverb send
                  </div>
                ) : null}
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
                onPointerDown={() => beginSliderDrag(`master-${key}`, mixState.master[key])}
                onMouseDown={() => beginSliderDrag(`master-${key}`, mixState.master[key])}
                onChange={(event) => handleMasterChange(key, Number(event.target.value))}
                onPointerUp={(event) =>
                  endSliderDrag(
                    `master-${key}`,
                    "user",
                    "master",
                    key,
                    `/master/${key}`,
                    Number(event.currentTarget.value),
                  )
                }
                onMouseUp={(event) =>
                  endSliderDrag(
                    `master-${key}`,
                    "user",
                    "master",
                    key,
                    `/master/${key}`,
                    Number(event.currentTarget.value),
                  )
                }
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
              <div className={`commit-item ${entry.author}`} key={entry.id}>
                <span className="commit-author">{entry.author === "user" ? "USER" : "AI"}</span>
                <span className="commit-message">{entry.message}</span>
                <span className="commit-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}
