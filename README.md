# mixstate

mixstate is an MVP for a web-based audio mixing IDE. It treats a mix as a
state machine (parameters, not plugins) and keeps every change as a git-like
commit so humans can review what the AI suggests.

## Concept

- Mixing as state, not plugins.
- AI modifies state via JSON patches.
- Every change becomes a commit in the history.
- Web Audio API provides real-time preview (no server-side audio processing).

## MVP Notes

- No authentication.
- No database (in-memory state only).
- LLM calls are stubbed.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` and load the demo project.
