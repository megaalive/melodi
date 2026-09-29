import { GM_STANDARD_KIT } from "../instruments/percussion.js?v=20260929.11";

export const DEFAULT_PAD_VELOCITY = 100;

export function drumPadInput(pieceId, playback = {}, velocity = DEFAULT_PAD_VELOCITY) {
  const tick = Number.isSafeInteger(playback.currentTick) && playback.currentTick >= 0
    ? playback.currentTick
    : 0;
  return {
    pieceId,
    startTick: tick,
    velocity,
    articulation: "normal"
  };
}

function makeElement(name, className, text = "") {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function createDrumPadsView(root, positionElement, {
  kit = GM_STANDARD_KIT,
  translate = (key) => key,
  onTrigger = () => {}
} = {}) {
  let playback = { status: "stopped", currentTick: 0 };

  root.replaceChildren();
  root.setAttribute("role", "group");

  for (const piece of kit.pieces) {
    const button = makeElement("button", "drum-pad");
    button.type = "button";
    button.dataset.entity = "drum-pad";
    button.dataset.pieceId = piece.id;
    button.dataset.pieceName = piece.name;
    const name = makeElement("span", "drum-pad-name", piece.name);
    const meta = makeElement("span", "drum-pad-meta", `V${DEFAULT_PAD_VELOCITY}`);
    meta.setAttribute("aria-hidden", "true");
    button.append(name, meta);
    root.append(button);
  }

  function refreshLabels() {
    root.setAttribute("aria-label", translate("drumsPadsLabel"));
    for (const button of root.querySelectorAll('[data-entity="drum-pad"]')) {
      button.setAttribute("aria-label", translate("drumsPadLabel", {
        piece: button.dataset.pieceName,
        velocity: DEFAULT_PAD_VELOCITY
      }));
    }
  }

  refreshLabels();

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-entity="drum-pad"]')
      : null;
    if (!button || !root.contains(button)) return;
    onTrigger(button.dataset.pieceId, DEFAULT_PAD_VELOCITY);
  });

  function updatePlayback(nextPlayback = {}) {
    playback = {
      status: nextPlayback.status ?? "stopped",
      currentTick: Number.isSafeInteger(nextPlayback.currentTick) && nextPlayback.currentTick >= 0
        ? nextPlayback.currentTick
        : 0
    };
    if (positionElement) {
      positionElement.textContent = translate("drumsPadsAt", { tick: playback.currentTick });
    }
  }

  return Object.freeze({ updatePlayback, refreshLabels });
}
