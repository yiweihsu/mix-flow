import type { Commit } from "./types";

export type HistoryState = {
  commits: Commit[];
  cursor: number;
};

const SLIDER_SQUASH_WINDOW_MS = 500;

const formatValue = (value: number) => value.toFixed(2);

export const buildSliderCommitMessage = (
  targetLabel: string,
  paramLabel: string,
  from: number,
  to: number,
) => {
  return `Adjust ${targetLabel} ${paramLabel} (${formatValue(from)} -> ${formatValue(to)})`;
};

export const createHistoryState = (): HistoryState => ({
  commits: [],
  cursor: -1,
});

export const appendCommit = (state: HistoryState, commit: Commit): HistoryState => {
  const truncated = state.commits.slice(0, state.cursor + 1);
  const lastCommit = truncated[truncated.length - 1];
  const shouldSquash =
    lastCommit?.meta?.intent === "slider-adjust" &&
    commit.meta?.intent === "slider-adjust" &&
    lastCommit.meta.path === commit.meta.path &&
    commit.timestamp - lastCommit.timestamp <= SLIDER_SQUASH_WINDOW_MS;

  if (shouldSquash) {
    const from = lastCommit.meta.from;
    const to = commit.meta.to;
    const mergedMeta = {
      ...commit.meta,
      from,
      to,
    };
    const mergedCommit: Commit = {
      ...commit,
      message: buildSliderCommitMessage(mergedMeta.targetLabel, mergedMeta.paramLabel, from, to),
      meta: mergedMeta,
    };
    const nextCommits = [...truncated.slice(0, -1), mergedCommit];

    return {
      commits: nextCommits,
      cursor: nextCommits.length - 1,
    };
  }

  const nextCommits = [...truncated, commit];

  return {
    commits: nextCommits,
    cursor: nextCommits.length - 1,
  };
};

export const undo = (state: HistoryState): HistoryState => {
  if (state.cursor < 0) {
    return state;
  }

  return {
    ...state,
    cursor: Math.max(-1, state.cursor - 1),
  };
};

export const redo = (state: HistoryState): HistoryState => {
  if (state.cursor >= state.commits.length - 1) {
    return state;
  }

  return {
    ...state,
    cursor: state.cursor + 1,
  };
};

export const getVisibleCommits = (state: HistoryState): Commit[] => {
  if (state.cursor < 0) {
    return [];
  }

  return state.commits.slice(0, state.cursor + 1);
};
