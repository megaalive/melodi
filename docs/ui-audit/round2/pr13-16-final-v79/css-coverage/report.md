# CSS usage audit

Generated: 2026-10-03T15:51:19.332Z. Measurement: Chromium CDP CSS.startRuleUsageTracking / CSS.stopRuleUsageTracking.

Scenarios: 238 UI matrix cells plus 6 dynamic states. Active CSS: 229.433 bytes; covered bytes: 166.710 (72.66%). Rules: 1461/1933 used; 472 uncovered; 0 safe static candidates.

## Stylesheets

| URL | Bytes | Used bytes | Rules used | Rules total | Matrix states with rules used | Dynamic states with rules used |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (inline stylesheet) | 177 | 0 | 0 | 2 | 0 | 0 |
| (inline stylesheet) | 217 | 0 | 0 | 1 | 0 | 0 |
| http://127.0.0.1:4174/melodi/styles/app.css?v=20261003.79 | 116 | 0 | 0 | 0 | 0 | 0 |
| http://127.0.0.1:4174/melodi/styles/base.css?v=20261003.79 | 91128 | 58710 | 480 | 742 | 34 | 6 |
| http://127.0.0.1:4174/melodi/styles/responsive.css?v=20261003.79 | 94363 | 78186 | 704 | 820 | 34 | 6 |
| http://127.0.0.1:4174/melodi/styles/studio.css?v=20261003.79 | 43432 | 29814 | 277 | 368 | 34 | 6 |

## Rule review

The JSON report lists all 472 uncovered style rules with selectors, UTF-8 byte offsets, source lengths, and class tokens. 0 rules have class tokens with no static references after runtime exceptions are applied.

## Runtime class exceptions

- `/^abcjs-/`: ABCJS creates notation classes at runtime.
- `/^roll-note-generated$/`: Piano Roll creates this note class from generated-note state.
- `/^studio-overview-(?:note|chord|drum)$/`: Studio Overview interpolates the track kind into this class.
