import { PPQ } from "./model.js";

export const DEFAULT_SNAP = "1/8";
export const SNAP_TICKS = Object.freeze({ "1/4": PPQ, "1/8": PPQ / 2, "1/16": PPQ / 4 });
