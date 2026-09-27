import { PPQ } from "./model.js";

export const DEFAULT_SNAP = "1/8";
export const SNAP_TICKS = Object.freeze({ "1/4": PPQ, "1/8": PPQ / 2, "1/16": PPQ / 4 });

/*
 * Zoom horizontal piano roll. 1x berarti grid pas di panel, jadi itu default
 * dan zoom tidak mengubah apa pun sampai user memintanya.
 *
 * Tidak ada zoom ke bawah dari 1x karena grid sudah pas di panel atau sudah
 * menyentuh batas keterbacaan 80px per nada; mengecilkan hanya menambah ruang
 * mati tanpa menambah informasi. Zoom memakai kelipatan, bukan nilai absolut,
 * supaya tetap berlaku ketika jendela diubah ukurannya.
 */
export const MIN_ROLL_ZOOM = 1;
export const MAX_ROLL_ZOOM = 4;
export const ROLL_ZOOM_STEP = 0.25;
