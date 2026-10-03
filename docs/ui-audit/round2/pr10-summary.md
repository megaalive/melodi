# Putaran 2 — PR10: dock studio kanan

Build `.76` membuka dock kanan secara default pada lebar desktop, memindahkan tab Mixer/Chord/Generate/Alat ke dock, dan mengingat status serta lebarnya. Kontrol Seek, Range, Follow, Tambah note, dan Pilih range dipindahkan ke Alat; tab memiliki kontras dan navigasi keyboard, serta ukuran dock diumumkan lewat ARIA. Label kandidat, audisi, dan seleksi kini mengikuti bahasa Indonesia. Ketika Gitar dipilih, tab Alat dipilih sekali; render berikutnya mempertahankan tab yang dipilih pengguna.

## Audit sesudah PR10

Matriks memeriksa 100 sel (lima viewport × dua tema × sepuluh keadaan) dan menyertakan 30 screenshot: keadaan default, Generate dengan kandidat, dan Mixer pada setiap viewport/tema. Tidak ada kegagalan, overlap kontrol, overlap label kanvas, atau klip yang tidak dapat dijangkau. Nilai mentah clipping mencapai 11 pada grid drum telepon; semuanya berada di konten yang dapat digulir. Dock Gitar dan form Alat tidak lagi meluap secara horizontal.

| Viewport | Chrome Edit default | Kontrol terlihat | Klik-untuk-terlihat (total: tertutup + tab lain) | `<details>` |
| --- | ---: | ---: | ---: | ---: |
| 1920×1080 | 125 px / 11.6% | 42 | 24 (11 + 13) | 13 |
| 1440×900 | 119 px / 13.2% | 42 | 24 (11 + 13) | 13 |
| 1024×768 | 143 px / 18.6% | 33 | 33 (20 + 13) | 13 |
| 390×844 | 179 px / 21.2% | 19 | 38 (38 + 0) | 13 |
| 844×390 | 97 px / 24.9% | 16 | 38 (38 + 0) | 13 |

Total klik-untuk-terlihat menghitung semua target umum yang tersembunyi, termasuk isi tab yang belum dipilih. Kolom tertutup/tab lain adalah rincian penyebab; tab yang selalu terlihat tetap membutuhkan satu aktivasi untuk menampilkan isinya. PR11 menangani 11 target disclosure Generate pada desktop lebar. Dock empat tab memang mempertahankan isi tab lain di balik pemilih tab.

Chrome Edit default desktop 1440×900 berada di bawah batas 14%; layar telepon tetap di bawah 25%. Keadaan Lyrics mencapai 18.6% pada 1440×900 dan 15.5% pada 1920×1080, sedangkan Irama mencapai 23.9% pada 1024×768. Tidak ada overlap pada seluruh matriks. Klip yang tercatat berada di area scroll yang dapat dijangkau (`unreachableClipCount=0`).

CSS aktif berukuran **239,989 byte** dengan **16 blok `@media`**. Ukuran ini naik 3,628 byte dari PR9; diet aturan berbasis coverage tetap menjadi tahap PR12 dengan sasaran 165,000 byte atau justifikasi berbasis bukti.

Hasil lengkap dan screenshot:

- [Matriks sebelum PR10](pr9-after/matrix.md)
- [Matriks sesudah PR10](pr10-after/matrix.md)
- [Data JSON](pr10-after/results.json) · [CSV](pr10-after/results.csv)

Verifikasi: `npm test` lulus (516/516); `npm run check` lulus. Matriks lokal `/melodi/`: 100/100 sel, tanpa kegagalan. Build yang diaudit: `20261003.76`. Bukti GitHub Pages akan dicatat setelah push tahap ini.
