# CSS usage audit

Generated: 2026-10-03T01:10:29.135Z. Measurement: Chromium CDP CSS.startRuleUsageTracking / CSS.stopRuleUsageTracking.

Scenarios: 60 UI matrix cells plus 6 dynamic states. Active CSS: 222.216 bytes; covered bytes: 135.818 (61.12%). Rules: 1228/1819 used; 591 uncovered; 0 safe static candidates.

## Stylesheets

| URL | Bytes | Used bytes | Rules used | Rules total | Matrix states with rules used | Dynamic states with rules used |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (inline stylesheet) | 177 | 0 | 0 | 2 | 0 | 0 |
| (inline stylesheet) | 217 | 0 | 0 | 1 | 0 | 0 |
| http://127.0.0.1:4174/melodi/styles/app.css?v=20261003.73 | 119 | 0 | 0 | 0 | 0 | 0 |
| http://127.0.0.1:4174/melodi/styles/base.css?v=20261003.73 | 95949 | 52989 | 425 | 742 | 20 | 6 |
| http://127.0.0.1:4174/melodi/styles/responsive.css?v=20261003.73 | 73736 | 55414 | 551 | 680 | 20 | 6 |
| http://127.0.0.1:4174/melodi/styles/studio.css?v=20261003.73 | 52018 | 27415 | 252 | 394 | 20 | 6 |

## Rule review

The JSON report lists all 591 uncovered style rules with selectors, UTF-8 byte offsets, source lengths, and class tokens. 0 rules have class tokens with no static references after runtime exceptions are applied.

## Runtime class exceptions

- `/^abcjs-/`: ABCJS creates notation classes at runtime.
- `/^roll-note-generated$/`: Piano Roll creates this note class from generated-note state.
- `/^studio-overview-(?:note|chord|drum)$/`: Studio Overview interpolates the track kind into this class.
