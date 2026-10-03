# Putaran 2 — PR11: Generate dan ekspresi

Build `.77` menampilkan opsi generator dan pintasan saat tab Generate aktif di desktop lebar. Bend, vibrato, dan kontrol nada terbuka otomatis saat seleksi serta mode cocok dan ruang vertikal cukup; pengguna tetap dapat menutup disclosure selama konteks itu aktif. Pengaturan gambar chord terbuka pada panel Chord desktop, sementara editor harmony tetap mengikuti aksi Edit/New yang sudah ada. Kartu kandidat memakai grid di dock mulai 68rem; dock 320px dan 480px menampilkan sedikitnya dua kolom, sementara lebar tepat di bawah breakpoint mempertahankan satu kolom.

Semua hook command/entity dipertahankan. Tooltip tombol kandidat kini memakai terjemahan id/en. Tombol tutup lembar mobile dikecualikan dari metrik kontrol umum karena bukan kontrol generator rutin.

## Audit sesudah PR11

Matriks mencakup 100 sel (lima viewport × dua tema × sepuluh keadaan) dan 30 screenshot keadaan default, Generate dengan kandidat, serta Mixer. Tidak ada kegagalan, overlap kontrol, overlap label kanvas, atau klip yang tidak terjangkau. Pada Generate desktop lebar, kontrol opsi dan pintasan memiliki `closedRevealTargetCount=0`; sisa 13 target klik-untuk-terlihat berasal dari tab dock yang tidak sedang dipilih.

| Viewport | Chrome Edit default | Kontrol terlihat | Klik-untuk-terlihat default | Generate aktif | `<details>` default / Generate |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1920×1080 | 125 px / 11.6% | 42 | 23 (10 tertutup + 13 tab lain) | 13 (0 tertutup + 13 tab lain) | 13 / 19 |
| 1440×900 | 119 px / 13.2% | 42 | 23 (10 + 13) | 13 (0 + 13) | 13 / 19 |
| 1024×768 | 143 px / 18.6% | 33 | 32 (19 + 13) | 32 (19 + 13) | 13 / 19 |
| 390×844 | 179 px / 21.2% | 19 | 37 (37 + 0) | 33 (19 + 14) | 13 / 19 |
| 844×390 | 97 px / 24.9% | 16 | 37 (37 + 0) | 33 (19 + 14) | 13 / 19 |

Klip mentah yang tersisa berkisar 0–11 pada keadaan scrollable; maksimum 11 ada pada 844×390. `unreachableClipCount=0` di seluruh sel. Chrome Edit default tetap di bawah 14% pada 1440×900 dan di bawah 25% pada ponsel. Keadaan Lyrics mencapai 18.6% pada 1440×900; keadaan Irama mencapai 23.9% pada 1024×768. CSS aktif berukuran **240,906 byte** dengan **17 blok `@media`**; anggaran PR11 sementara 241,000 byte. Diet berbasis coverage tetap menjadi PR12.

## Screenshot sebelum dan sesudah

“Sebelum” memakai build PR10; “sesudah” memakai build `.77`. Tautan mengarah ke screenshot dengan viewport dan tema yang sama.

| Viewport | Tema | Default | Generate dengan kandidat | Mixer |
| --- | --- | --- | --- | --- |
| 1920×1080 | light | [sebelum](pr10-after/1920x1080-light-edit-default.png) / [sesudah](pr11-after/1920x1080-light-edit-default.png) | [sebelum](pr10-after/1920x1080-light-edit-generate-candidates.png) / [sesudah](pr11-after/1920x1080-light-edit-generate-candidates.png) | [sebelum](pr10-after/1920x1080-light-edit-mixer-panel.png) / [sesudah](pr11-after/1920x1080-light-edit-mixer-panel.png) |
| 1920×1080 | dark | [sebelum](pr10-after/1920x1080-dark-edit-default.png) / [sesudah](pr11-after/1920x1080-dark-edit-default.png) | [sebelum](pr10-after/1920x1080-dark-edit-generate-candidates.png) / [sesudah](pr11-after/1920x1080-dark-edit-generate-candidates.png) | [sebelum](pr10-after/1920x1080-dark-edit-mixer-panel.png) / [sesudah](pr11-after/1920x1080-dark-edit-mixer-panel.png) |
| 1440×900 | light | [sebelum](pr10-after/1440x900-light-edit-default.png) / [sesudah](pr11-after/1440x900-light-edit-default.png) | [sebelum](pr10-after/1440x900-light-edit-generate-candidates.png) / [sesudah](pr11-after/1440x900-light-edit-generate-candidates.png) | [sebelum](pr10-after/1440x900-light-edit-mixer-panel.png) / [sesudah](pr11-after/1440x900-light-edit-mixer-panel.png) |
| 1440×900 | dark | [sebelum](pr10-after/1440x900-dark-edit-default.png) / [sesudah](pr11-after/1440x900-dark-edit-default.png) | [sebelum](pr10-after/1440x900-dark-edit-generate-candidates.png) / [sesudah](pr11-after/1440x900-dark-edit-generate-candidates.png) | [sebelum](pr10-after/1440x900-dark-edit-mixer-panel.png) / [sesudah](pr11-after/1440x900-dark-edit-mixer-panel.png) |
| 1024×768 | light | [sebelum](pr10-after/1024x768-light-edit-default.png) / [sesudah](pr11-after/1024x768-light-edit-default.png) | [sebelum](pr10-after/1024x768-light-edit-generate-candidates.png) / [sesudah](pr11-after/1024x768-light-edit-generate-candidates.png) | [sebelum](pr10-after/1024x768-light-edit-mixer-panel.png) / [sesudah](pr11-after/1024x768-light-edit-mixer-panel.png) |
| 1024×768 | dark | [sebelum](pr10-after/1024x768-dark-edit-default.png) / [sesudah](pr11-after/1024x768-dark-edit-default.png) | [sebelum](pr10-after/1024x768-dark-edit-generate-candidates.png) / [sesudah](pr11-after/1024x768-dark-edit-generate-candidates.png) | [sebelum](pr10-after/1024x768-dark-edit-mixer-panel.png) / [sesudah](pr11-after/1024x768-dark-edit-mixer-panel.png) |
| 390×844 | light | [sebelum](pr10-after/390x844-light-edit-default.png) / [sesudah](pr11-after/390x844-light-edit-default.png) | [sebelum](pr10-after/390x844-light-edit-generate-candidates.png) / [sesudah](pr11-after/390x844-light-edit-generate-candidates.png) | [sebelum](pr10-after/390x844-light-edit-mixer-panel.png) / [sesudah](pr11-after/390x844-light-edit-mixer-panel.png) |
| 390×844 | dark | [sebelum](pr10-after/390x844-dark-edit-default.png) / [sesudah](pr11-after/390x844-dark-edit-default.png) | [sebelum](pr10-after/390x844-dark-edit-generate-candidates.png) / [sesudah](pr11-after/390x844-dark-edit-generate-candidates.png) | [sebelum](pr10-after/390x844-dark-edit-mixer-panel.png) / [sesudah](pr11-after/390x844-dark-edit-mixer-panel.png) |
| 844×390 | light | [sebelum](pr10-after/844x390-light-edit-default.png) / [sesudah](pr11-after/844x390-light-edit-default.png) | [sebelum](pr10-after/844x390-light-edit-generate-candidates.png) / [sesudah](pr11-after/844x390-light-edit-generate-candidates.png) | [sebelum](pr10-after/844x390-light-edit-mixer-panel.png) / [sesudah](pr11-after/844x390-light-edit-mixer-panel.png) |
| 844×390 | dark | [sebelum](pr10-after/844x390-dark-edit-default.png) / [sesudah](pr11-after/844x390-dark-edit-default.png) | [sebelum](pr10-after/844x390-dark-edit-generate-candidates.png) / [sesudah](pr11-after/844x390-dark-edit-generate-candidates.png) | [sebelum](pr10-after/844x390-dark-edit-mixer-panel.png) / [sesudah](pr11-after/844x390-dark-edit-mixer-panel.png) |

Data lengkap: [matriks](pr11-after/matrix.md), [JSON](pr11-after/results.json), dan [CSV](pr11-after/results.csv). Build yang diaudit `20261003.77`, dilayani lokal di `/melodi/`.

Verifikasi: `npm test` lulus (521/521), `npm run check` lulus, dan audit Playwright 100/100. Tes khusus PR11 meliputi disclosure desktop/mobile, Harmony, seleksi ekspresi, serta grid pada 68rem dengan dock 320/480px dan 1px di bawah breakpoint.
