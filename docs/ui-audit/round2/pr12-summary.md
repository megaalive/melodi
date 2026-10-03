# Putaran 2 PR12 — audit CSS dan cleanup

Build yang diuji: `20261003.78`. PR12 menghapus aturan CSS lama yang sudah tidak
sesuai dengan struktur dock saat ini, mendeduplikasi aturan responsive yang
identik, menambahkan guard byte CSS, memperbarui deskripsi layout di README, dan
melengkapi sejarah audit PR6–12.

## Hasil cleanup CSS

- Menghapus 78 aturan `.studio #piano-roll-content > .candidate-dock*` yang
  tertinggal dari layout lama: **12,029 byte**. Runtime hanya memindahkan dock
  kandidat ke `#generation-panel`; styling dock aktif tetap dipertahankan.
- Menghapus 11 salinan terdahulu dari aturan responsive identik: **807 byte**.
  Penghapusan hanya dilakukan saat selector, deklarasi, dan konteks lengkap
  `@media` sama.
- Menambahkan aturan desktop untuk merapatkan toolbar kosong pada Score, Lyrics,
  dan Irama. Cache token naik ke `.78`.
- Pada ukuran aktif Chromium yang sama, CSS turun dari 241,410 B sebelum cleanup
  menjadi 229,065 B sesudahnya: pengurangan bersih **12,345 B**.
- Guard test menghitung byte setelah normalisasi LF, supaya hasilnya sama pada
  checkout Windows CRLF dan Linux LF. Pohon CSS impor kini **223,329 byte**;
  guard **224,000 byte**. Target **165,000 byte belum tercapai**.

Audit coverage mencakup 100 sel UI dan enam state dinamis. Laporan Chromium
sesudah cleanup mengukur **229,065 byte aktif**, dengan 1,368/1,882 aturan dan
154,642 byte terpakai (67.51%). Ada **18 blok `@media`** aktif (17 di
`responsive.css`, 1 di `studio.css`). Dari 514 aturan tanpa pemakaian pada
sampel, terdapat **0 kandidat aman** dari pemeriksaan
class-token statis. Tidak menggunakan status “tak terpakai” pada sampel sebagai
bukti bahwa aturan aman dihapus. [Laporan sebelum cleanup](pr12-css-coverage-before-cleanup/report.md),
[laporan sesudah cleanup](pr12-css-coverage-after/report.md), dan
[JSON sesudah cleanup](pr12-css-coverage-after/report.json).

## Matriks UI

Matriks memeriksa 100 kombinasi lima viewport, dua tema, dan sepuluh keadaan.
Tidak ada kegagalan, tumpang tindih kontrol, tumpang tindih label kanvas, atau
klip tanpa ancestor scroll. Clipping mentah yang tersisa berada di konten yang
memang digulir—misalnya timeline/kisi Piano Roll yang lebih lebar dari viewport
dan panel panjang. Ini tetap dilaporkan sebagai clipping, bukan disembunyikan
dari hitungan; `unreachableClipCount` tetap nol pada semua sel.

| Viewport | Kontrol terlihat, Edit default | Klik-untuk-terlihat, Edit default | Chrome maksimum | Klip mentah maksimum / tidak terjangkau | Overlap maksimum | `<details>` default |
|---|---:|---:|---:|---:|---:|---:|
| 1920×1080 | 42 | 23 (10 disclosure + 13 tab dock lain) | 125.2 px / 11.6% | 1 / 0 | 0 | 13 |
| 1440×900 | 42 | 23 (10 + 13) | 125.2 px / 13.9% | 0 / 0 | 0 | 13 |
| 1024×768 | 33 | 32 (19 + 13) | 183.2 px / 23.9% | 2 / 0 | 0 | 13 |
| 390×844 | 19 | 37 (37 + 0) | 192 px / 22.7% | 10 / 0 | 0 | 13 |
| 844×390 | 16 | 37 (37 + 0) | 97 px / 24.9% | 11 / 0 | 0 | 13 |

Klik-untuk-terlihat adalah hitungan ketat untuk semua target umum pada semua
panel: jumlahnya juga mencakup tab dock yang sedang tidak aktif. Di desktop
default, 10 target berada di disclosure tertutup dan 13 di tab dock lain; saat
Generate aktif, opsi dan pintasannya terbuka, sementara 13 target panel lain
tetap berada di tabnya. Tes DOM memastikan kontrol header rutin terlihat dan
memeriksa sebab disclosure/tab secara terpisah (`tests/desktop-controls.test.js`).

Desktop 1440×900 menjaga chrome maksimum di 13.9%; ponsel portrait dan landscape
tetap di bawah 25%. Pada 1024×768, maksimum 23.9%. Seluruh nilai per keadaan dan
temanya ada di [matriks](pr12-after/matrix.md), [JSON](pr12-after/results.json),
dan [CSV](pr12-after/results.csv). Ada 100 screenshot sesudah audit.

Dengan hitungan literal seluruh kontrol umum, kriteria nol klik-untuk-terlihat
belum tercapai: desktop default masih mencatat 23 karena konten tab dock yang
tidak dipilih serta disclosure tertutup. Hitungan clipping mentah juga belum nol,
karena bagian kanvas/panel yang dapat digulir melampaui area pandang; yang nol
adalah klip tanpa jalur scroll. Angka residual ini diwarisi dari tata letak `.77`
dan dicatat agar PR12 tidak mengklaim kriteria keseluruhan yang belum dipenuhi.

## Screenshot sebelum / sesudah

“Sebelum” memakai build PR11 `.77`; “sesudah” memakai `.78`. Pasangan memakai
viewport, tema, dan keadaan yang sama. Seluruh keadaan default, Generate dengan
kandidat, dan Mixer untuk lima viewport serta dua tema tercakup di tabel ini.

| Viewport | Tema | Default | Generate dengan kandidat | Mixer |
|---|---|---|---|---|
| 1920×1080 | light | [sebelum](pr11-after/1920x1080-light-edit-default.png) / [sesudah](pr12-after/1920x1080-light-edit-default.png) | [sebelum](pr11-after/1920x1080-light-edit-generate-candidates.png) / [sesudah](pr12-after/1920x1080-light-edit-generate-candidates.png) | [sebelum](pr11-after/1920x1080-light-edit-mixer-panel.png) / [sesudah](pr12-after/1920x1080-light-edit-mixer-panel.png) |
| 1920×1080 | dark | [sebelum](pr11-after/1920x1080-dark-edit-default.png) / [sesudah](pr12-after/1920x1080-dark-edit-default.png) | [sebelum](pr11-after/1920x1080-dark-edit-generate-candidates.png) / [sesudah](pr12-after/1920x1080-dark-edit-generate-candidates.png) | [sebelum](pr11-after/1920x1080-dark-edit-mixer-panel.png) / [sesudah](pr12-after/1920x1080-dark-edit-mixer-panel.png) |
| 1440×900 | light | [sebelum](pr11-after/1440x900-light-edit-default.png) / [sesudah](pr12-after/1440x900-light-edit-default.png) | [sebelum](pr11-after/1440x900-light-edit-generate-candidates.png) / [sesudah](pr12-after/1440x900-light-edit-generate-candidates.png) | [sebelum](pr11-after/1440x900-light-edit-mixer-panel.png) / [sesudah](pr12-after/1440x900-light-edit-mixer-panel.png) |
| 1440×900 | dark | [sebelum](pr11-after/1440x900-dark-edit-default.png) / [sesudah](pr12-after/1440x900-dark-edit-default.png) | [sebelum](pr11-after/1440x900-dark-edit-generate-candidates.png) / [sesudah](pr12-after/1440x900-dark-edit-generate-candidates.png) | [sebelum](pr11-after/1440x900-dark-edit-mixer-panel.png) / [sesudah](pr12-after/1440x900-dark-edit-mixer-panel.png) |
| 1024×768 | light | [sebelum](pr11-after/1024x768-light-edit-default.png) / [sesudah](pr12-after/1024x768-light-edit-default.png) | [sebelum](pr11-after/1024x768-light-edit-generate-candidates.png) / [sesudah](pr12-after/1024x768-light-edit-generate-candidates.png) | [sebelum](pr11-after/1024x768-light-edit-mixer-panel.png) / [sesudah](pr12-after/1024x768-light-edit-mixer-panel.png) |
| 1024×768 | dark | [sebelum](pr11-after/1024x768-dark-edit-default.png) / [sesudah](pr12-after/1024x768-dark-edit-default.png) | [sebelum](pr11-after/1024x768-dark-edit-generate-candidates.png) / [sesudah](pr12-after/1024x768-dark-edit-generate-candidates.png) | [sebelum](pr11-after/1024x768-dark-edit-mixer-panel.png) / [sesudah](pr12-after/1024x768-dark-edit-mixer-panel.png) |
| 390×844 | light | [sebelum](pr11-after/390x844-light-edit-default.png) / [sesudah](pr12-after/390x844-light-edit-default.png) | [sebelum](pr11-after/390x844-light-edit-generate-candidates.png) / [sesudah](pr12-after/390x844-light-edit-generate-candidates.png) | [sebelum](pr11-after/390x844-light-edit-mixer-panel.png) / [sesudah](pr12-after/390x844-light-edit-mixer-panel.png) |
| 390×844 | dark | [sebelum](pr11-after/390x844-dark-edit-default.png) / [sesudah](pr12-after/390x844-dark-edit-default.png) | [sebelum](pr11-after/390x844-dark-edit-generate-candidates.png) / [sesudah](pr12-after/390x844-dark-edit-generate-candidates.png) | [sebelum](pr11-after/390x844-dark-edit-mixer-panel.png) / [sesudah](pr12-after/390x844-dark-edit-mixer-panel.png) |
| 844×390 | light | [sebelum](pr11-after/844x390-light-edit-default.png) / [sesudah](pr12-after/844x390-light-edit-default.png) | [sebelum](pr11-after/844x390-light-edit-generate-candidates.png) / [sesudah](pr12-after/844x390-light-edit-generate-candidates.png) | [sebelum](pr11-after/844x390-light-edit-mixer-panel.png) / [sesudah](pr12-after/844x390-light-edit-mixer-panel.png) |
| 844×390 | dark | [sebelum](pr11-after/844x390-dark-edit-default.png) / [sesudah](pr12-after/844x390-dark-edit-default.png) | [sebelum](pr11-after/844x390-dark-edit-generate-candidates.png) / [sesudah](pr12-after/844x390-dark-edit-generate-candidates.png) | [sebelum](pr11-after/844x390-dark-edit-mixer-panel.png) / [sesudah](pr12-after/844x390-dark-edit-mixer-panel.png) |

## Verifikasi dan deploy

- `npm test`: lulus, 521/521.
- `npm run check`: lulus.
- CI dan GitHub Pages: menunggu push build `.78`; bukti URL/run akan ditambahkan
  setelah deploy terverifikasi.
