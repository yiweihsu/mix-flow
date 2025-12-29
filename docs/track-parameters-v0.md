# Track Parameters v0 (mixstate)

Track parameters are semantic controls that describe sound in human terms.
They are normalized (0 to 1 or -1 to 1) and map to multiple DSP intents.

Terminology choice: we use **presence** (not "forward") because it is a
common, musician-friendly word for perceived nearness and clarity.

| Parameter name | Human meaning (1 sentence, non-technical) | Range (min -> max, normalized) | Default value | DSP mapping (what actually changes internally) |
| --- | --- | --- | --- | --- |
| volume | How loud the track feels compared to the rest of the mix. | 0 -> 1 | 0.6 | Overall gain scaling with gentle taper near silence. |
| pan | Where the track sits left to right in the stereo image. | -1 -> 1 | 0 | Stereo balance using equal-power panning. |
| brightness | How light or dark the tone feels overall. | 0 -> 1 | 0.5 | Spectral tilt using high-frequency emphasis and low-frequency softening. |
| punch | How much the track hits and releases with energy. | 0 -> 1 | 0.5 | Transient emphasis and low-mid dynamic lift to add impact. |
| presence | How forward and clear the track feels in the mix. | 0 -> 1 | 0.5 | Upper-mid emphasis with subtle masking control around nearby content. |
| space | How far away the track feels in the shared room. | 0 -> 1 | 0 | Send amount to a shared space bus plus distance-based roll-off. |

Notes:
- No plugin names are exposed in parameters; DSP mappings describe intent only.
- Parameters are designed to be combined; each one can affect multiple DSP levers.
