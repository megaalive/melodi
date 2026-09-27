import { MelodiError } from "../core/model.js";

export const MAX_SEED = 0xffffffff;

export function validateSeed(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new MelodiError("generation-invalid-seed");
  }
  return seed;
}

export function nextSeed(seed) {
  validateSeed(seed);
  return (seed + 1) >>> 0;
}

export function createRandom(seed) {
  let state = validateSeed(seed) >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
