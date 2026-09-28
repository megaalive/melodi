import { PPQ } from "./model.js";

export const DEFAULT_SNAP = "1/8";
export const DEFAULT_EDITOR_TOOL = "select";
export const EDITOR_TOOLS = Object.freeze(["select", "draw"]);
export const SNAP_TICKS = Object.freeze({ "1/4": PPQ, "1/8": PPQ / 2, "1/16": PPQ / 4 });

/*
 * Zoom horizontal piano roll. 1x / 100% adalah tampilan Fit/default.
 * Zoom di bawah 1x bukan mengecilkan SVG lalu menyisakan ruang mati: geometry
 * menambah bar yang terlihat supaya viewport tetap terisi dan konteks waktu
 * benar-benar bertambah. Zoom tetap berupa multiplier agar stabil saat ukuran
 * panel berubah.
 */
export const DEFAULT_ROLL_ZOOM = 1;
export const MIN_ROLL_ZOOM = 0.5;
export const MAX_ROLL_ZOOM = 4;
export const ROLL_ZOOM_STEP = 0.25;
