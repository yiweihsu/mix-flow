export type PreviewState = {
  frame_index: number;
  is_playing: boolean;
  is_preview_mode: true;
  fps: number;
  visual_time_seconds: number;
};

export const createPreviewState = (fps: number): PreviewState => ({
  frame_index: 0,
  is_playing: false,
  is_preview_mode: true,
  fps,
  visual_time_seconds: 0,
});

export const updatePreviewFrame = (
  state: PreviewState,
  frameIndex: number,
  isPlaying: boolean = state.is_playing,
): PreviewState => ({
  ...state,
  frame_index: frameIndex,
  is_playing: isPlaying,
  visual_time_seconds: frameIndex / state.fps,
});
