function nonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function playbackFollowMode(follow) {
  if (!follow) return "none";
  return "center";
}

const nonTextEntryInputTypes = new Set(["button", "checkbox", "radio", "range", "reset", "submit"]);

export function isTextEntryActiveElement(element) {
  if (!element || element.closest?.(".transport-form")) return false;
  const tagName = String(element.tagName ?? "").toUpperCase();
  if (tagName === "TEXTAREA") return true;
  return tagName === "INPUT" && !nonTextEntryInputTypes.has(String(element.type ?? "text").toLowerCase());
}

export function centeredScrollLeft({ playheadX, viewportWidth, gutterWidth, contentWidth } = {}) {
  const viewport = nonNegative(viewportWidth);
  if (viewport === 0) return 0;
  const gutter = Math.min(viewport, nonNegative(gutterWidth));
  const content = nonNegative(contentWidth);
  const x = Number.isFinite(playheadX) ? playheadX : 0;
  const timelineCenter = gutter + (viewport - gutter) / 2;
  return clamp(x - timelineCenter, 0, Math.max(0, content - viewport));
}

export function nearestScrollLeft({
  playheadX,
  playheadWidth = 0,
  viewportWidth,
  gutterWidth,
  contentWidth,
  scrollLeft = 0
} = {}) {
  const viewport = nonNegative(viewportWidth);
  if (viewport === 0) return 0;
  const gutter = Math.min(viewport, nonNegative(gutterWidth));
  const content = nonNegative(contentWidth);
  const maximum = Math.max(0, content - viewport);
  const current = clamp(nonNegative(scrollLeft), 0, maximum);
  const x = Number.isFinite(playheadX) ? playheadX : 0;
  const width = nonNegative(playheadWidth);
  let desired = current;
  if (x < current + gutter) desired = x - gutter;
  else if (x + width > current + viewport) desired = x + width - viewport;
  return clamp(desired, 0, maximum);
}
