# CSS usage audit

Generated: 2026-10-03T02:49:06.293Z. Measurement: Chromium CDP CSS.startRuleUsageTracking / CSS.stopRuleUsageTracking.

Scenarios: 60 UI matrix cells plus 6 dynamic states. Active CSS: 224.693 bytes; covered bytes: 138.618 (61.69%). Rules: 1248/1836 used; 588 uncovered; 0 safe static candidates.

## Stylesheets

| URL | Bytes | Used bytes | Rules used | Rules total | Matrix states with rules used | Dynamic states with rules used |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (inline stylesheet) | 177 | 0 | 0 | 2 | 0 | 0 |
| (inline stylesheet) | 217 | 0 | 0 | 1 | 0 | 0 |
| http://127.0.0.1:4174/melodi/styles/app.css?v=20261003.74 | 119 | 0 | 0 | 0 | 0 | 0 |
| http://127.0.0.1:4174/melodi/styles/base.css?v=20261003.74 | 95947 | 52987 | 425 | 742 | 20 | 6 |
| http://127.0.0.1:4174/melodi/styles/responsive.css?v=20261003.74 | 76199 | 58198 | 571 | 697 | 20 | 6 |
| http://127.0.0.1:4174/melodi/styles/studio.css?v=20261003.74 | 52034 | 27433 | 252 | 394 | 20 | 6 |

## Rule review

The JSON report lists all 588 uncovered style rules with selectors, UTF-8 byte offsets, source lengths, and class tokens. 0 rules have class tokens with no static references after runtime exceptions are applied.

## Runtime class exceptions

- `/^abcjs-/`: ABCJS creates notation classes at runtime.
- `/^roll-note-generated$/`: Piano Roll creates this note class from generated-note state.
- `/^studio-overview-(?:note|chord|drum)$/`: Studio Overview interpolates the track kind into this class.
