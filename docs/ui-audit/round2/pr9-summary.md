# Putaran 2 — PR9: kontrol rutin di header

Build `.75` memindahkan tindakan proyek, bahasa, tema, dan Command Palette ke header desktop. Header dan transport memakai satu baris; menu tetap tersedia pada layar sempit. Label transport ponsel kini memiliki nama aksesibel lengkap meski teks visual dipendekkan, dan kontrol Sembunyikan di toolbar Edit memakai label dan chevron sebaris.

## Metrik keadaan Edit default

| Viewport | Sebelum | Sesudah | Kontrol terlihat (sebelum → sesudah) | Primer (sebelum → sesudah) | Klik untuk terlihat (sebelum → sesudah) | Overlap default (sebelum → sesudah) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1920×1080 | 177.4 px / 16.4% | 129.8 px / 12.0% | 25 → 33 | 11 → 19 | 31 → 23 | 0 → 0 |
| 1440×900 | 171 px / 19.0% | 124 px / 13.8% | 25 → 33 | 11 → 19 | 31 → 23 | 0 → 0 |
| 1024×768 | 370.9 px / 48.3% | 143 px / 18.6% | 22 → 23 | 9 → 9 | 33 → 33 | 2 → 0 |
| 390×844 | 179 px / 21.2% | 179 px / 21.2% | 19 → 19 | 5 → 5 | 37 → 37 | 0 → 0 |
| 844×390 | 97 px / 24.9% | 97 px / 24.9% | 16 → 16 | 5 → 5 | 37 → 37 | 0 → 0 |

Audit sesudah perubahan memeriksa 100/100 kombinasi lima viewport, dua tema, dan sepuluh keadaan; tidak ada kegagalan, tumpang tindih kontrol, tumpang tindih label kanvas, klip yang tidak bisa dijangkau, atau overflow horizontal. Audit baseline juga berstatus `Failures: 0` menurut ambang tool, tetapi tetap merekam overlap sampai tiga pada sebagian keadaan 1024×768 (dua pada Edit default); sesudah PR9 overlap di seluruh matriks adalah nol. Ada elemen yang terklip di dalam wilayah yang memang dapat di-scroll; angka mentahnya bukan nol. Bukti dan data per sel ada di [matriks sebelum](pr9-before/matrix.md) dan [matriks sesudah](pr9-after/matrix.md). Keduanya mencakup 30 screenshot: lima viewport × dua tema × keadaan default, Generate dengan kandidat, dan Mixer.

Pada desktop lebar, 23 kontrol umum masih perlu dibuka. Seek/Range/Add Note/Select Range serta tab panel dan kontrol Generate menjadi lingkup PR10/PR11; kontrol proyek, bahasa, tema, palette, Undo, dan Redo sudah tampil langsung setelah PR9. Karena itu PR9 belum memenuhi target akhir nol klik-untuk-terlihat desktop.

CSS aktif sesudah PR9 berukuran 236,361 byte dengan 13 blok `@media`. Tes anggaran sementara naik dari 225,000 menjadi 240,000 byte untuk tata letak header/transport ini; PR12 akan memakai coverage untuk diet aturan mati dan menetapkan ulang batas akhir.

Verifikasi: `npm test` lulus (508/508); `npm run check` lulus. Build yang diaudit: `20261003.75`, disajikan lokal melalui `/melodi/`.
