# Koreksi visual setelah feedback pengguna

Baseline main `01171d9ed8caf03718a0f9a8bba4a51615f057a3`, build .38.
Pengguna menunjukkan Melodi awal pada desktop lebar dan jendela desktop sempit.
Layout sebelumnya terlalu memampatkan kontrol dan menggunakan label 9–11px.
Lulus tes fungsi dan ukuran canvas tidak cukup untuk menyatakan kualitas visual baik.

Koreksi terfokus:
- Kontrol utama 13px, heading16px, transport36px. Label status11px tanpa uppercase.
- Header width100% menghapus batas1600px yang menyebabkan header bergeser terhadap canvas.
- Overview position nowrap, gutter96px desktop/58px sempit; birama/beat tidak pecah baris.
- Garis beat/bar/row dilembutkan sehingga not lebih dominan.
- Enam tab membagi ruang pada layout sempit; zoom label tetap accessible tetapi visually hidden.
- Transport readout boleh menyusut sehingga Playback tetap muat pada350px.
- Canvas pendek memakai margin pitch2/minimum12 semitone, bukan margin4/minimum18.
  Note/candidate tetap ikut menentukan range; tidak ada perubahan Song atau audio.

Build release `20261001.42`; .39/.40/.41 hanya iterasi lokal untuk membuang cache preview.
File perilaku: CSS, `src/ui/piano-roll.js`, dua regression render tests. File JS lain
dan index mendapat token cache release; tidak ada perubahan command/action/schema.

Verifikasi:477 tests PASS; npm run check PASS; git diff --check PASS.
Hooks432→432 hilang0; availableActions84→84, source daftar sama.
Regression render canvas300px mengurangi baris kosong sambil mempertahankan kedua
note dan pitch canonical; canvas600px mengembalikan19 baris. ResizeObserver juga memperbarui framing saat tinggi canvas berubah, tanpa reload. Browser contoh Melodi awal19→14 baris saat1280×800→350×620; Song tetap.

UAT memakai contoh Melodi awal pada origin lokal, tidak draft publik. Resize dilakukan
langsung1889×620→1280×800→800×620→760×620→350×620→390×844→360×740.
Semua document horizontal overflow false. Header mengisi lebar tersedia; toolbar
tetap di dalam pane. Pada350 keenam tab muat, Playback right327px<350px; gridx15,w305.
Pada1280 gridy182.19,h570;350 gridy198,h310;390 y198,h534.
Kompromi: font yang lebih terbaca menambah sekitar3px pada awal grid desktop.
Tidak mengklaim seluruh masalah visual selesai, atau seluruh acceptance lama PASS.

Clipping persis screenshot desktop sempit pengguna belum berhasil direproduksi:
runtime350px di sini memakai chrome fixed bawah, sedangkan screenshot pengguna
memperlihatkan chrome desktop atas. Pengguna mengonfirmasi jendela desktop diperkecil.
Penyebab beda lingkungan/cache/viewport belum terbukti; tidak disimpulkan sebagai
kesalahan pengguna. Pengujian resize di atas membuktikan lingkungan lokal saja.

Bukti: direktori `C:/Users/Thinkstation/.codex/visualizations/2026/10/01/01a0f4e7-f521-74f2-8725-4b1e5d585cfa`,
`recovery-{width}-{height}.jpg` dan `recovery-measurements.json`.
Screenshot asli pengguna berada di `D:/Temp/codex-clipboard-36769283-9014-4245-8024-dfb9326a060f.png`
dan `D:/Temp/codex-clipboard-a925d2af-26cf-4835-965a-05dd5c788adf.png`.

Ulangi pada browser desktop yang sama: buka Melodi awal, ubah lebar jendela melalui
760px sampai350px tanpa reload, lalu reload pada ukuran pendek. Periksa posisi birama,
semua tab, Playback, batas toolbar, note dan ruler. Jika chrome tetap desktop atas
dan pane terpotong, catat innerWidth, documentElement.clientWidth, zoom browser serta
meta build untuk mengisolasi perbedaan lingkungan. Audio/touch fisik tidak diuji ulang.
