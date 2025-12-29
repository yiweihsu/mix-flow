# mixstate

mixstate is an MVP for a web-based audio mixing IDE. It treats a mix as a
state machine (parameters, not plugins) and keeps every change as a git-like
commit so humans can review what the AI suggests.

## Concept

- Mixing as state, not plugins.
- AI modifies state via JSON patches.
- Every change becomes a commit in the history.
- Web Audio API handles audio processing (no server-side audio processing).

## MVP Notes

- No authentication.
- No database (in-memory state only).
- LLM calls are stubbed.

### Preview Mode

- Preview mode is visual-only by design.
- Audio playback is intentionally disabled.
- Audio is preserved automatically during render/export.
- This matches professional VFX / motion tools (AE, Nuke, TouchDesigner).

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` and load the demo project.
