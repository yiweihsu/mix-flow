import type { Commit } from "./types";

export type HistoryState = {
  commits: Commit[];
  cursor: number;
};

export const createHistoryState = (): HistoryState => ({
  commits: [],
  cursor: -1,
});

export const appendCommit = (state: HistoryState, commit: Commit): HistoryState => {
  const truncated = state.commits.slice(0, state.cursor + 1);
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
